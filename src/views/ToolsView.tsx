import { useEffect, useRef, useState } from 'react';
import { ChevronLeft } from '../components/Icons';
import { MyTabs } from '../components/Tabs';
import { useStore } from '../lib/store';
import { tapTempo } from '../tools/dsp';
import { camelot, keyName, noteFor } from '../tools/keys';
import { mic, startListening, stopListening } from '../tools/mic';

function Analyzer() {
  const { status, reading } = useStore(mic);
  useEffect(() => stopListening, []);

  const tempo = reading?.tempo && reading.tempo.confidence > 0.08 ? reading.tempo : null;
  const key = reading?.key && reading.key.confidence > 0.15 ? reading.key : null;
  const note = reading?.pitch ? noteFor(reading.pitch) : null;
  const bpm = tempo ? Math.round(tempo.bpm) : null;
  const quiet = status === 'listening' && reading && reading.level < 0.004;

  return (
    <section className="tool">
      <div className="notes-head">
        <h2>Listen</h2>
        {status === 'listening' || status === 'starting'
          ? <button className="btn btn-small" onClick={stopListening}>Stop</button>
          : <button className="btn btn-primary btn-small" onClick={startListening}>Start listening</button>}
      </div>
      <p className="facts">
        {status === 'off' && 'Hold the phone near the speaker or your instrument. Tempo and key settle after about ten seconds.'}
        {status === 'starting' && 'Waiting for the microphone…'}
        {status === 'denied' && 'The microphone wasn’t allowed. Allow it for this site in Settings, then try again.'}
        {status === 'unsupported' && 'This browser can’t use the microphone here.'}
        {status === 'listening' && (quiet ? 'Listening… it’s very quiet.' : `Listening… ${Math.floor(reading?.seconds || 0)}s`)}
      </p>
      {status === 'listening' && (
        <div className="readouts">
          <div className="readout">
            <span className="readout-label">Tempo</span>
            <span className="readout-value">{bpm ?? '—'}</span>
            <span className="readout-sub">{bpm ? `BPM · or ${bpm < 100 ? `${bpm * 2} double time` : `${Math.round(bpm / 2)} half time`}` : 'needs a steady beat'}</span>
          </div>
          <div className="readout">
            <span className="readout-label">Key</span>
            <span className="readout-value readout-key">{key ? keyName(key.key) : '—'}</span>
            <span className="readout-sub">{key ? `Camelot ${camelot(key.key)} · ${key.confidence > 0.5 ? 'confident' : 'tentative'}` : 'needs a few bars'}</span>
          </div>
          <div className="readout">
            <span className="readout-label">Note</span>
            <span className="readout-value">{note ? <>{note.name}<small>{note.octave}</small></> : '—'}</span>
            <span className="readout-sub">{note ? `${note.cents > 0 ? '+' : ''}${note.cents} cents · ${note.frequency.toFixed(1)} Hz` : 'play one note'}</span>
            {note && <span className="cents"><i style={{ left: `${50 + note.cents}%` }} className={Math.abs(note.cents) <= 5 ? 'in-tune' : ''} /></span>}
          </div>
        </div>
      )}
    </section>
  );
}

function TapTempo() {
  const taps = useRef<number[]>([]);
  const [bpm, setBpm] = useState<number | null>(null);
  const tap = () => {
    const now = performance.now();
    // A long pause starts a new count.
    if (taps.current.length && now - taps.current[taps.current.length - 1] > 2500) taps.current = [];
    taps.current.push(now);
    setBpm(tapTempo(taps.current));
  };
  return (
    <section className="tool">
      <h2>Tap tempo</h2>
      <button className="tap" onPointerDown={tap} aria-label="Tap in time with the music">
        <span className="readout-value">{bpm ? Math.round(bpm) : 'Tap'}</span>
        <span className="readout-sub">{bpm ? 'BPM' : 'in time with the beat'}</span>
      </button>
    </section>
  );
}

export function ToolsView() {
  return (
    <div className="page">
      <header className="page-head">
        <button className="icon-btn back-inline" onClick={() => window.history.back()} aria-label="Back"><ChevronLeft /></button>
        <h1>Tools</h1>
      </header>
      <div className="tools">
        <Analyzer />
        <TapTempo />
        <MyTabs />
      </div>
    </div>
  );
}
