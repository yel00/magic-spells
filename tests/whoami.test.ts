// The lists kept on the device (your concerts, notes, tags) are filed under the
// Spotify account. The app must know whose they are without waiting for
// Spotify to answer, or a slow or failed request leaves every list empty.
import { beforeEach, describe, expect, it, vi } from 'vitest';

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe('remembering who is signed in', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', fakeStorage());
  });

  it('knows the account on the next launch before Spotify has answered', async () => {
    let auth = await import('../src/spotify/auth');
    expect(auth.rememberedUser()).toBeUndefined();
    auth.rememberUser('jay123');
    vi.resetModules();
    auth = await import('../src/spotify/auth');
    expect(auth.rememberedUser()).toBe('jay123');
  });

  it('forgets the account on sign-out, so the next person never sees these lists', async () => {
    const auth = await import('../src/spotify/auth');
    auth.rememberUser('jay123');
    auth.signOut();
    expect(auth.rememberedUser()).toBeUndefined();
  });

  it('does not remember the demo account', async () => {
    const auth = await import('../src/spotify/auth');
    auth.setDemo(true);
    auth.rememberUser('demo-user');
    expect(auth.rememberedUser()).toBeUndefined();
  });
});
