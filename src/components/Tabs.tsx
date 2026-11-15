import { useRef, useState } from 'react';
import { go } from '../lib/router';
import { invalidate, useData } from '../lib/useData';
import { deleteTab, findTabs, importTab, listTabs, TAB_ACCEPT, tabSearchLinks } from '../tools/tabs';
import { toast, ui } from '../state/ui';

function ImportButton({ song, label }: { song?: { uri: string; title: string; artist: string }; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const tab = await importTab(file, song);
      invalidate('tabs:mine');
      ui.set({ infoFor: null });
      go(`/tab/${tab.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t import that file.');
    }
  };
  return (
    <>
      <button className="btn btn-small" onClick={() => input.current?.click()}>{label}</button>
      <input ref={input} type="file" accept={TAB_ACCEPT} hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
    </>
  );
}

/** Tabs for one song: your imported file if there is one, the Songsterr tab, and search links. */
export function SongTabs({ uri, title, artist }: { uri: string; title: string; artist: string }) {
  const mine = useData('tabs:mine', listTabs);
  const found = useData(`tabs:find:${uri}`, () => findTabs(title, artist).then((v) => v ?? []));
  const own = (mine.data || []).filter((t) => t.trackUri === uri);
  const open = (id: string) => {
    ui.set({ infoFor: null });
    go(`/tab/${id}`);
  };
  return (
    <div className="songtabs">
      <h3>Tabs</h3>
      {own.map((t) => (
        <button key={t.id} className="action tab-own" onClick={() => open(t.id)}>▶ Play your tab <span className="row-sub">{t.name}</span></button>
      ))}
      {(found.data || []).map((t) => (
        <a key={t.id} className="action" href={t.url} target="_blank" rel="noreferrer">
          <span className="row-text">
            <span>Songsterr ↗</span>
            <span className="row-sub">{[...t.parts, t.chords && 'Chords'].filter(Boolean).join(' · ') || 'Tab'}</span>
          </span>
        </a>
      ))}
      <div className="chips">
        {tabSearchLinks(title, artist).filter((l) => !(found.data?.length && l.label === 'Songsterr')).map((l) => (
          <a key={l.label} className="chip chip-link" href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>
        ))}
        <ImportButton song={{ uri, title, artist }} label="Import a tab file" />
      </div>
    </div>
  );
}

/** The library of imported tab files, on the Tools page. */
export function MyTabs() {
  const mine = useData('tabs:mine', listTabs);
  const [confirming, setConfirming] = useState<string | null>(null);
  const remove = async (id: string) => {
    await deleteTab(id);
    setConfirming(null);
    mine.reload();
  };
  return (
    <section className="tool">
      <div className="notes-head">
        <h2>Your tabs</h2>
        <ImportButton label="Import" />
      </div>
      <p className="facts">
        Import Guitar Pro or MusicXML files and play along: pick the guitar, bass or piano part, slow it down, loop it. Files stay on this device.
      </p>
      {mine.data?.map((t) => (
        <div className="row" key={t.id}>
          <button className="row-main" onClick={() => go(`/tab/${t.id}`)}>
            <span className="row-text"><span className="row-title">{t.title}</span><span className="row-sub">{[t.artist, t.name].filter(Boolean).join(' · ')}</span></span>
          </button>
          {confirming === t.id
            ? <button className="btn btn-small btn-danger" onClick={() => remove(t.id)}>Delete?</button>
            : <button className="btn btn-quiet btn-small" onClick={() => setConfirming(t.id)}>Remove</button>}
        </div>
      ))}
    </section>
  );
}
