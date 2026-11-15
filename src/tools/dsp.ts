// The listening maths: tempo, key and pitch from raw microphone samples.
// Everything here is plain arithmetic on arrays, so it can be tested with
// synthesised sound and needs no browser.
import { estimateKey, type KeyEstimate } from './keys';

/** In-place radix-2 FFT; returns magnitudes of the first half. `re` must have a power-of-two length. */
export function magnitudes(re: Float32Array): Float32Array {
  const n = re.length;
  const im = new Float32Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]];
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  const out = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) out[i] = Math.hypot(re[i], im[i]);
  return out;
}

/** How much of each of the 12 pitch classes is in a spectrum, counting only clear peaks between 65 Hz and 2.1 kHz. */
export function chromaFrom(mags: Float32Array, sampleRate: number): Float32Array {
  const chroma = new Float32Array(12);
  const binHz = sampleRate / (mags.length * 2);
  const lo = Math.max(2, Math.ceil(65 / binHz));
  const hi = Math.min(mags.length - 2, Math.floor(2100 / binHz));
  for (let i = lo; i <= hi; i++) {
    const m = mags[i];
    if (m <= mags[i - 1] || m < mags[i + 1]) continue;
    // Refine the peak position between bins for a truer pitch.
    const denom = mags[i - 1] - 2 * m + mags[i + 1];
    const shift = denom ? (0.5 * (mags[i - 1] - mags[i + 1])) / denom : 0;
    const midi = 69 + 12 * Math.log2(((i + shift) * binHz) / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    // Mistuned energy (between notes) counts for less.
    const inTune = 1 - Math.min(1, Math.abs(midi - Math.round(midi)) * 2);
    chroma[pc] += m * inTune;
  }
  return chroma;
}

export interface TempoEstimate {
  bpm: number;
  /** 0–1: how strongly the beat repeats at this tempo. */
  confidence: number;
}

/**
 * Tempo from an onset-strength envelope (one value per hop): find the delay at
 * which the envelope best lines up with itself. People hear the beat somewhere
 * near 120 BPM, so ambiguous cases (60 vs 120 vs 240) lean towards the middle.
 */
export function estimateTempo(envelope: ArrayLike<number>, rate: number): TempoEstimate | null {
  const n = envelope.length;
  if (n < rate * 4) return null;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += envelope[i];
  mean /= n;
  const x = new Float32Array(n);
  let zero = 0;
  for (let i = 0; i < n; i++) {
    x[i] = envelope[i] - mean;
    zero += x[i] * x[i];
  }
  if (zero <= 1e-9) return null;
  const acf = (lag: number) => {
    const l = Math.round(lag);
    if (l >= n) return 0;
    let s = 0;
    for (let i = 0; i + l < n; i++) s += x[i] * x[i + l];
    return s / (n - l);
  };
  const norm = zero / n;
  const minLag = Math.floor((60 / 210) * rate);
  const maxLag = Math.min(Math.ceil((60 / 50) * rate), Math.floor(n / 3));
  let best = { lag: 0, score: -Infinity, raw: 0 };
  const scoreAt = (lag: number) => acf(lag) + 0.5 * acf(lag * 2) + 0.25 * acf(lag * 3);
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * rate) / lag;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.8) ** 2);
    const raw = scoreAt(lag);
    const score = raw * prior;
    if (score > best.score) best = { lag, score, raw };
  }
  if (!best.lag || best.raw <= 0) return null;
  // Sharpen between whole-hop delays.
  const a = scoreAt(best.lag - 1);
  const b = scoreAt(best.lag);
  const c = scoreAt(best.lag + 1);
  const denom = a - 2 * b + c;
  const lag = best.lag + (denom < 0 ? (0.5 * (a - c)) / denom : 0);
  return { bpm: (60 * rate) / lag, confidence: Math.max(0, Math.min(1, acf(best.lag) / norm)) };
}

/** Pitch of a single played note (YIN method), or null for silence or noise. */
export function detectPitch(samples: Float32Array, sampleRate: number): number | null {
  const n = samples.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += samples[i] * samples[i];
  if (Math.sqrt(rms / n) < 0.008) return null;
  const maxLag = Math.min(Math.floor(sampleRate / 55), Math.floor(n / 2));
  const minLag = Math.floor(sampleRate / 1500);
  const d = new Float32Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i < n - maxLag; i++) {
      const diff = samples[i] - samples[i + lag];
      s += diff * diff;
    }
    d[lag] = s;
  }
  let running = 0;
  const cmnd = new Float32Array(maxLag + 1);
  cmnd[0] = 1;
  for (let lag = 1; lag <= maxLag; lag++) {
    running += d[lag];
    cmnd[lag] = running ? (d[lag] * lag) / running : 1;
  }
  for (let lag = minLag; lag < maxLag; lag++) {
    if (cmnd[lag] < 0.12) {
      while (lag + 1 < maxLag && cmnd[lag + 1] < cmnd[lag]) lag++;
      const denom = cmnd[lag - 1] - 2 * cmnd[lag] + cmnd[lag + 1];
      const shift = denom ? (0.5 * (cmnd[lag - 1] - cmnd[lag + 1])) / denom : 0;
      return sampleRate / (lag + shift);
    }
  }
  return null;
}

const HOP = 512;
const FFT = 8192;

export interface Reading {
  seconds: number;
  tempo: TempoEstimate | null;
  key: KeyEstimate | null;
  pitch: number | null;
  level: number;
}

/** Feed it microphone samples as they arrive; ask it what it has heard so far. */
export class Listener {
  private envelope: number[] = [];
  private ring = new Float32Array(FFT);
  private ringPos = 0;
  private filled = 0;
  private hop = new Float32Array(HOP);
  private hopPos = 0;
  private low = 0;
  private prevLow = 0;
  private prevHigh = 0;
  private chroma = new Float32Array(12);
  private sinceFft = 0;
  private total = 0;
  private level = 0;
  private window: Float32Array;
  readonly envelopeRate: number;

  constructor(readonly sampleRate: number) {
    this.envelopeRate = sampleRate / HOP;
    this.window = new Float32Array(FFT);
    for (let i = 0; i < FFT; i++) this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT - 1));
  }

  push(samples: Float32Array) {
    const alpha = 1 - Math.exp((-2 * Math.PI * 150) / this.sampleRate);
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      this.ring[this.ringPos] = s;
      this.ringPos = (this.ringPos + 1) % FFT;
      this.hop[this.hopPos++] = s;
      if (this.hopPos === HOP) {
        // Onset strength: how much louder this instant is than the last, in the bass (kick) and everything else (snare, strum).
        let eLow = 0;
        let eHigh = 0;
        for (let j = 0; j < HOP; j++) {
          this.low += alpha * (this.hop[j] - this.low);
          const high = this.hop[j] - this.low;
          eLow += this.low * this.low;
          eHigh += high * high;
        }
        const lLow = Math.log(eLow / HOP + 1e-7);
        const lHigh = Math.log(eHigh / HOP + 1e-7);
        this.envelope.push(Math.max(0, lLow - this.prevLow) + Math.max(0, lHigh - this.prevHigh));
        this.prevLow = lLow;
        this.prevHigh = lHigh;
        this.level = Math.sqrt((eLow + eHigh) / HOP);
        this.hopPos = 0;
        // Tempo is judged on the last 15 seconds, so it follows a change of song.
        const keep = Math.round(this.envelopeRate * 15);
        if (this.envelope.length > keep) this.envelope.splice(0, this.envelope.length - keep);
      }
    }
    this.total += samples.length;
    this.filled = Math.min(FFT, this.filled + samples.length);
    this.sinceFft += samples.length;
    if (this.filled === FFT && this.sinceFft >= FFT / 2) {
      this.sinceFft = 0;
      const frame = this.ordered();
      for (let i = 0; i < FFT; i++) frame[i] *= this.window[i];
      const c = chromaFrom(magnitudes(frame), this.sampleRate);
      let sum = 0;
      for (let i = 0; i < 12; i++) sum += c[i];
      // Each frame gets an equal say regardless of loudness; older frames fade over about a minute.
      if (sum > 1e-3) for (let i = 0; i < 12; i++) this.chroma[i] = this.chroma[i] * 0.985 + c[i] / sum;
    }
  }

  private ordered(): Float32Array {
    const out = new Float32Array(FFT);
    out.set(this.ring.subarray(this.ringPos));
    out.set(this.ring.subarray(0, this.ringPos), FFT - this.ringPos);
    return out;
  }

  read(): Reading {
    const seconds = this.total / this.sampleRate;
    const recent = this.filled === FFT ? this.ordered().subarray(FFT - 4096) : null;
    return {
      seconds,
      tempo: estimateTempo(this.envelope, this.envelopeRate),
      key: seconds >= 4 ? estimateKey(this.chroma) : null,
      pitch: recent ? detectPitch(recent, this.sampleRate) : null,
      level: this.level,
    };
  }
}

/** Tempo from taps: the median gap between the last few taps. */
export function tapTempo(times: number[]): number | null {
  const recent = times.slice(-9);
  if (recent.length < 3) return null;
  const gaps = recent.slice(1).map((t, i) => t - recent[i]).sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  return median > 0 ? 60000 / median : null;
}
