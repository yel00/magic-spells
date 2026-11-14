export interface Note {
  id: string;
  /** What the note is about: a track, album or artist. */
  subject_uri: string;
  /** For a track note, the album it belongs to, so the album page can show it too. */
  parent_uri: string | null;
  title: string;
  subtitle: string;
  image: string | null;
  body: string;
  created_at: number;
  updated_at: number;
  deleted: boolean;
}

/** A note as held on this device: `dirty` means it has changes the server hasn't seen. */
export interface LocalNote extends Note {
  dirty?: boolean;
}

export type NoteSubject = Pick<Note, 'subject_uri' | 'parent_uri' | 'title' | 'subtitle' | 'image'>;
