import { useState } from 'react';
import { ChevronLeft } from '../components/Icons';
import { go } from '../lib/router';
import { useStore } from '../lib/store';
import { useData } from '../lib/useData';
import { notes, STATUS_TEXT } from '../notes/store';
import * as api from '../spotify/api';
import { countOn, deployUrl, EXTRAS, fetchSetup, REPO_URL } from '../setup';
import { toast } from '../state/ui';
import { beginLogin, builtInClientId, cleanClientId, getClientId, isDemo, redirectUri, setClientId, setDemo, signOut } from '../spotify/auth';

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CopyButton({ text }: { text: string }) {
  const [label, setLabel] = useState('Copy');
  const press = async () => {
    setLabel((await copy(text)) ? 'Copied' : 'Press and hold the text');
    setTimeout(() => setLabel('Copy'), 2000);
  };
  return <button className="btn btn-small" onClick={press}>{label}</button>;
}

/** Hands the "make your own copy" link to the share sheet, or copies it. */
async function shareApp() {
  const data = { title: 'Magic Spells', text: 'A fast remote and music browser for Spotify. Make your own copy in a few minutes:', url: REPO_URL };
  try {
    if (navigator.share) await navigator.share(data);
    else toast((await copy(REPO_URL)) ? 'Link copied' : REPO_URL);
  } catch {
    /* closed the share sheet */
  }
}

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
          <ol className="steps">
            <li>
              Open the <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">Spotify developer dashboard</a> and press <b>Create app</b>. Any name will do. Tick <b>Web API</b>. The Spotify account needs Premium.
            </li>
            <li>
              For <b>Redirect URI</b>, paste this exactly:
              <span className="copy-row"><code>{redirectUri()}</code><CopyButton text={redirectUri()} /></span>
            </li>
            <li>Save, then copy the app’s <b>Client ID</b> (not the secret) and paste it below.</li>
          </ol>
          <label htmlFor="cid">Spotify client ID</label>
          <input id="cid" value={id} onChange={(e) => setId(e.target.value)} placeholder="32-character ID from developer.spotify.com" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          {badBuildValue && <p className="error">The client ID saved in the site’s settings isn’t valid, so it’s being ignored. Paste the right one here.</p>}
          <p className="fineprint">The ID is remembered on this device and is not a secret. Up to five people can use one Spotify app; add the others under User Management in the dashboard.</p>
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
  const setup = useData('setup', fetchSetup);
  const status = setup.data;
  const [open, setOpen] = useState<string | null>(null);
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
        <div className="setting">
          <span>Extras{status ? ` · ${countOn(status)} of ${EXTRAS.length} on` : ''}</span>
          {setup.loading && !status && <strong>Checking…</strong>}
          {!setup.loading && !status && <p className="setting-note">Can’t check what’s switched on from here.</p>}
          {status && (
            <ul className="extras">
              {EXTRAS.map((e) => (
                <li key={e.id}>
                  <button className="extra" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
                    <span className={status[e.id] ? 'dot dot-on' : 'dot'} />
                    <span className="extra-name">{e.name}</span>
                    <span className="extra-state">{status[e.id] ? 'On' : 'Off'}</span>
                  </button>
                  {open === e.id && (
                    <div className="extra-how">
                      <p>{status[e.id] ? e.adds : `${e.adds} Without it: ${e.without.toLowerCase()}`}</p>
                      {e.id === 'ai' && status.ai && <p>{status.aiNamedOnly ? 'Only the Spotify accounts you have named can run one.' : 'Anyone who can sign in to this copy can run one. To limit it to people you name, add the setting AI_ALLOWED_USERS with their Spotify IDs, separated by commas.'}</p>}
                      {!status[e.id] && (
                        <>
                          <p>To switch it on ({e.cost.toLowerCase()}): get a key from <a href={e.link} target="_blank" rel="noreferrer">{e.where}</a>, add it to your host’s environment variables as</p>
                          <span className="copy-row"><code>{e.setting}</code><CopyButton text={e.setting} /></span>
                          <p>then redeploy.</p>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        {!isDemo() && me.data?.id && (
          <div className="setting">
            <span>Your Spotify ID</span>
            <span className="copy-row"><code>{me.data.id}</code><CopyButton text={me.data!.id} /></span>
            <p className="setting-note">This is what goes in AI_ALLOWED_USERS to name who may run tasting sessions.</p>
          </div>
        )}
        <div className="setting">
          <span>Share Magic Spells</span>
          <p className="setting-note">Everyone runs their own free copy with their own Spotify app, so nothing of yours is shared. It takes about ten minutes.</p>
          <div className="setting-actions">
            <button className="btn btn-primary" onClick={shareApp}>Send the link</button>
            <a className="btn" href={deployUrl()} target="_blank" rel="noreferrer">Make a copy</a>
          </div>
        </div>
        <button className="btn btn-wide" onClick={() => { signOut(); go('/home'); window.location.reload(); }}>
          {isDemo() ? 'Leave demo' : 'Sign out of Spotify'}
        </button>
      </div>
    </div>
  );
}
