import { useState } from 'react';
import { SearchIcon } from '../components/Icons';
import { NoteCard } from '../components/Notes';
import { useStore } from '../lib/store';
import { searchNotes } from '../notes/merge';
import { notes, STATUS_TEXT } from '../notes/store';

export function NotesView() {
  const { notes: all, status } = useStore(notes);
  const [query, setQuery] = useState('');
  const total = all.filter((n) => !n.deleted).length;
  const shown = searchNotes(all, query);
  return (
    <div className="page">
      <header className="page-head"><h1>Notes</h1></header>
      {total > 0 && (
        <label className="searchbox">
          <SearchIcon size={18} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your notes" autoCorrect="off" spellCheck={false} />
        </label>
      )}
      <p className="notes-status">{STATUS_TEXT[status]}</p>
      {total === 0 && (
        <p className="status">
          No notes yet. Open any album or artist and tap “Add note”, or use the ··· menu on a song.
        </p>
      )}
      {total > 0 && shown.length === 0 && <p className="status">No notes match “{query}”.</p>}
      <div className="notes-list">
        {shown.map((n) => <NoteCard key={n.id} note={n} showSubject />)}
      </div>
    </div>
  );
}
