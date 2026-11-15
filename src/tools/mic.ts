// Microphone capture for the analyzer. The phone listens to the room (or an
// instrument) and hands the samples to the Listener; nothing is recorded or sent anywhere.
import { createStore } from '../lib/store';
import { Listener, type Reading } from './dsp';

interface MicState {
  status: 'off' | 'starting' | 'listening' | 'denied' | 'unsupported';
  reading: Reading | null;
}

export const mic = createStore<MicState>({ status: 'off', reading: null });

let stopFn: (() => void) | null = null;

export async function startListening() {
  if (stopFn) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    mic.set({ status: 'unsupported' });
    return;
  }
  mic.set({ status: 'starting', reading: null });
  let stream: MediaStream;
  try {
    // Phone call processing (echo cancelling, noise removal, auto gain) mangles music, so switch it off.
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch {
    mic.set({ status: 'denied' });
    return;
  }
  const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();
  await ctx.resume().catch(() => undefined);
  const listener = new Listener(ctx.sampleRate);
  const source = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(2048, 1, 1);
  const silent = ctx.createGain();
  silent.gain.value = 0; // the node must reach the output to run, but we don't want to hear the mic
  node.onaudioprocess = (e) => listener.push(e.inputBuffer.getChannelData(0));
  source.connect(node);
  node.connect(silent);
  silent.connect(ctx.destination);
  const timer = setInterval(() => mic.set({ reading: listener.read() }), 400);
  mic.set({ status: 'listening' });
  stopFn = () => {
    clearInterval(timer);
    node.onaudioprocess = null;
    source.disconnect();
    node.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => undefined);
    stopFn = null;
  };
}

export function stopListening() {
  stopFn?.();
  mic.set({ status: 'off' });
}
