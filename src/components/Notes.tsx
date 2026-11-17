import { useEffect, useRef, useState } from 'react';
import { pathForUri, go } from '../lib/router';
import { useStore } from '../lib/store';
import { notesAbout } from '../notes/merge';
import { deleteNote, notes, saveNote } from '../notes/store';
import type { LocalNote, NoteSubject } from '../notes/types';
import { toast, ui } from '../state/ui';
import { Art } from './Art';
import { PlusIcon } from './Icons';

export function noteDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function NoteCard({ note, showSubject, context }: { note: LocalNote; showSubject?: boolean; context?: string }) {
  const edit = () => ui.set({ noteDraft: { subject: note, id: note.id, body: note.body } });
  const path = pathForUri(note.parent_uri || note.subject_uri);
  return (
    <article className="note">
      {showSubject && (
        <button className="note-subject" onClick={() => path && go(path)} disabled={!path}>
          <Art images={note.image ? [{ url: note.image }] : null} size={40} round={note.subject_uri.startsWith('spotify:artist:')} />
          <span className="row-text"><span className="row-title">{note.title}</span><span className="row-sub">{note.subtitle}</span></span>
        </button>
      )}
      <button className="note-body" onClick={edit} aria-label="Edit note">
        {!showSubject && context && <span className="note-context">{context}</span>}
        <p>{note.body}</p>
        <span className="note-date">{noteDate(note.created_at)}{note.updated_at - note.created_at > 60_000 ? ' · edited' : ''}</span>
      </button>
    </article>
  );
}

/** The notes block on an album or artist page. Track notes appear under their album. */
export function NotesSection({ subject }: { subject: NoteSubject }) {
  const all = useStore(notes).notes;
  const mine = notesAbout(all, subject.subject_uri);
  return (
    <section className="about notes-section">
      <div className="notes-head">
        <h2>Your notes</h2>
        <button className="btn btn-small" onClick={() => ui.set({ noteDraft: { subject, body: '' } })}><PlusIcon size={16} /> Add note</button>
      </div>
      {mine.length === 0 && <p className="facts">Nothing yet. Jot down what you hear — it stays with this {subject.subject_uri.split(':')[1].replace('track', 'song')}.</p>}
      {mine.map((n) => <NoteCard key={n.id} note={n} context={n.subject_uri !== subject.subject_uri ? n.title : undefined} />)}
    </section>
  );
}

export function NoteEditor() {
  const draft = useStore(ui).noteDraft!;
  const [body, setBody] = useState(draft.body);
  const box = useRef<HTMLTextAreaElement>(null);
  const close = () => ui.set({ noteDraft: null });

  useEffect(() => {
    // Wait for the sheet to finish sliding up before raising the keyboard.
    const id = setTimeout(() => box.current?.focus(), 350);
    return () => clearTimeout(id);
  }, []);

  const save = () => {
    const text = body.trim();
    if (!text) return;
    saveNote(draft.subject, text, draft.id);
    toast('Note saved');
    close();
  };

  const remove = () => {
    if (!draft.id || !window.confirm('Delete this note?')) return;
    deleteNote(draft.id);
    toast('Note deleted');
    close();
  };

  return (
    <div className="note-editor">
      <div className="row row-static actions-head">
        <Art images={draft.subject.image ? [{ url: draft.subject.image }] : null} size={44} round={draft.subject.subject_uri.startsWith('spotify:artist:')} />
        <span className="row-text"><span className="row-title">{draft.subject.title}</span><span className="row-sub">{draft.subject.subtitle}</span></span>
      </div>
      <textarea ref={box} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What do you hear?" maxLength={20000} rows={7} aria-label="Note" />
      <div className="note-actions">
        {draft.id && <button className="btn btn-quiet btn-danger" onClick={remove}>Delete</button>}
        <span className="spacer" />
        <button className="btn btn-quiet" onClick={close}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={!body.trim() || body.trim() === draft.body}>Save</button>
      </div>
    </div>
  );
}
