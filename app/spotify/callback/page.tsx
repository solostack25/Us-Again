'use client';

import { useEffect, useState } from 'react';
import { finishLogin } from '@/lib/spotify';

export default function SpotifyCallback() {
  const [msg, setMsg] = useState('Connecting to Spotify…');
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const code = q.get('code');
    if (q.get('error') || !code) { setMsg('Spotify didn’t connect. Head back to the TV and try again.'); return; }
    finishLogin(code).then(() => window.location.replace('/tv')).catch(() => setMsg('Couldn’t finish connecting to Spotify. Head back and try again.'));
  }, []);
  return (
    <main className="phone">
      <p className="big-emoji" aria-hidden="true">🎵</p>
      <h1 className="ph-title">{msg}</h1>
      <a className="btn ghost" href="/tv">Back to the TV</a>
    </main>
  );
}
