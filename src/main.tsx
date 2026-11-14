import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { completeLoginIfReturning, isSignedIn } from './spotify/auth';
import './styles.css';
import { Welcome } from './views/Settings';

function Root() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    completeLoginIfReturning().then((err) => {
      setError(err);
      setSignedIn(isSignedIn());
      setReady(true);
    });
    const onSignedOut = () => {
      setError('Your Spotify session ended. Please connect again.');
      setSignedIn(false);
    };
    window.addEventListener('ms:signedout', onSignedOut);
    return () => window.removeEventListener('ms:signedout', onSignedOut);
  }, []);

  if (!ready) return null;
  return signedIn ? <App /> : <Welcome error={error} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}
