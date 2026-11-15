import { useState } from 'react';
import { ChevronLeft } from '../components/Icons';
import { go } from '../lib/router';
import { useStore } from '../lib/store';
import { useData } from '../lib/useData';
import { notes, STATUS_TEXT } from '../notes/store';
import * as api from '../spotify/api';
import { beginLogin, builtInClientId, cleanClientId, getClientId, isDemo, redirectUri, setClientId, setDemo, signOut } from '../spotify/auth';

export function Welcome({ error }: { error: string | null }) {
  const [id, setId] = useState(getClientId());
  const [message, setMessage] = useState(error);
  const fromBuild = !!builtInClientId();
  const badBuildValue = !fromBuild && !!import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  const valid = fromBuild || !!cleanClientId(id);

  const connect = async () => {
    try {
      if (!valid) {
        setMessage('That doesn’t look like a Spotify client ID. It is 32 letters and digits, shown as “Client ID” in your Spotify app’s settings (not the client secret).');
        return;
      }
      if (!fromBuild) setClientId(id);
      await beginLogin();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not start sign-in.');
    }
  };

  return (
    <div className="welcome">
      <img src="/icon.svg" alt="" className="welcome-mark" />
      <h1>Magic Spells</h1>
      <p className="lede">A fast remote and browser for your Spotify — every speaker, your whole library.</p>

      {!fromBuild && (
        <div className="setup">
          <label htmlFor="cid">Spotify client ID</label>
          <input id="cid" value={id} onChange={(e) => setId(e.target.value)} placeholder="32-character ID from developer.spotify.com" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          {badBuildValue && <p className="error">The client ID saved in the site’s settings isn’t valid, so it’s being ignored. Paste the right one here.</p>}
          <p className="fineprint">
            In your Spotify developer app, add this exact redirect URI:<br />
            <code>{redirectUri()}</code>
          </p>
        </div>
      )}

      {message && <p className="error" role="alert">{message}</p>}
      <button className="btn btn-primary btn-wide" onClick={connect} disabled={!fromBuild && !id.trim()}>Connect Spotify</button>
      <button className="btn btn-quiet btn-wide" onClick={() => { setDemo(true); window.location.reload(); }}>Look around with demo music</button>
    </div>
  );
}

export function Settings() {
  const me = useData('me', api.me);
  const noteState = useStore(notes);
  return (
    <div className="page">
      <header className="page-head">
        <button className="icon-btn back-inline" onClick={() => window.history.back()} aria-label="Back"><ChevronLeft /></button>
        <h1>Settings</h1>
      </header>
      <div className="settings">
        <div className="setting">
          <span>Account</span>
          <strong>{isDemo() ? 'Demo music (not connected)' : me.data?.display_name || me.data?.id || '…'}</strong>
        </div>
        <div className="setting">
          <span>Listening notes</span>
          <strong>{noteState.notes.filter((n) => !n.deleted).length} notes · {STATUS_TEXT[noteState.status]}</strong>
        </div>
        {!isDemo() && (
          <div className="setting">
            <span>Redirect URI</span>
            <code>{redirectUri()}</code>
          </div>
        )}
        <button className="btn btn-wide" onClick={() => { signOut(); go('/home'); window.location.reload(); }}>
          {isDemo() ? 'Leave demo' : 'Sign out of Spotify'}
        </button>
      </div>
    </div>
  );
}
