'use client';

import { useEffect, useRef, useState } from 'react';
import { rpc } from '@/lib/supabase';
import * as sp from '@/lib/spotify';
import { phoneBus, tvBus, useBus } from '@/lib/bus';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { Spotify?: any; onSpotifyWebPlaybackSDKReady?: () => void }
}

const SONGS = 'songs';
type Queued = sp.Song & { key: string; t: number; slot: number };
interface NowPlaying { name: string; artist: string; art: string; paused: boolean }
export interface MusicStatus { connected: boolean; armed: boolean; now: NowPlaying | null; count: number; err?: string }

// ---------------------------------------------------------------- TV

export function MusicTV() {
  const bus = useBus(tvBus);
  const [connected, setConnected] = useState(false);
  const [armed, setArmed] = useState(false);
  const [device, setDevice] = useState<string | null>(null);
  const [songs, setSongs] = useState<Queued[]>([]);
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [err, setErr] = useState('');
  const [kick, setKick] = useState(0);       // bump to retry feeding songs
  const [needsTap, setNeedsTap] = useState(false);
  const player = useRef<any>(null);
  const issued = useRef(0);          // how many songs the list Spotify is playing contains
  const playingIdx = useRef(-1);     // which of our songs is playing now
  const lastUri = useRef('');
  const tuned = useRef(false);       // repeat/shuffle set for this player
  const feeding = useRef(false);
  const songsRef = useRef<Queued[]>([]);
  const connectedRef = useRef(false);
  songsRef.current = songs;
  connectedRef.current = connected;

  useEffect(() => { setConnected(sp.isConnected()); }, []);

  // Pull the shared song list whenever either phone adds one.
  const songCount = bus.view?.submitted.filter((x) => x.activity === SONGS).length ?? 0;
  useEffect(() => {
    const { room, token } = tvBus.get();
    if (!room || !token || !songCount) return;
    rpc<{ slot: number; item: number; body: sp.Song & { t: number } }[]>('us_again_get_answers', { p_room: room, p_host_token: token, p_activity: SONGS })
      .then((list) => setSongs(list.map((a) => ({ ...a.body, key: `${a.slot}-${a.item}`, slot: a.slot })).sort((a, b) => a.t - b.t)))
      .catch(() => {});
  }, [songCount, bus.room]);

  // Load Spotify's in-browser player once connected.
  useEffect(() => {
    if (!connected) return;
    const init = () => {
      const p = new window.Spotify.Player({
        name: 'Us, Again (TV)', volume: 0.7,
        getOAuthToken: async (cb: (t: string) => void) => { const t = await sp.getToken(); if (t) cb(t); },
      });
      p.addListener('ready', ({ device_id }: { device_id: string }) => setDevice(device_id));
      p.addListener('not_ready', () => setDevice(null));
      p.addListener('player_state_changed', (st: any) => {
        if (!st) { setNow(null); return; }
        const tr = st.track_window.current_track;
        if (tr.uri !== lastUri.current) {
          // Track which of our songs this is (search forward first, so repeated songs are counted right).
          const list = songsRef.current;
          let idx = list.findIndex((x, j) => j > playingIdx.current && x.uri === tr.uri);
          if (idx < 0) idx = list.findIndex((x) => x.uri === tr.uri);
          playingIdx.current = idx;
          lastUri.current = tr.uri;
        }
        setNow({ name: tr.name, artist: tr.artists.map((a: any) => a.name).join(', '), art: tr.album.images[0]?.url || '', paused: st.paused });
      });
      p.addListener('authentication_error', () => { sp.disconnect(); setConnected(false); setErr('Spotify signed out. Connect again.'); });
      p.addListener('account_error', () => setErr('Playing here needs Spotify Premium.'));
      p.addListener('initialization_error', () => setErr('This browser can’t play Spotify. Try Chrome on a laptop.'));
      p.addListener('autoplay_failed', () => { setNeedsTap(true); setErr('Tap ▶ to start the music.'); });
      p.connect();
      player.current = p;
    };
    if (window.Spotify) init();
    else {
      window.onSpotifyWebPlaybackSDKReady = init;
      if (!document.getElementById('sp-sdk')) {
        const s = document.createElement('script');
        s.id = 'sp-sdk'; s.src = 'https://sdk.scdn.co/spotify-player.js'; s.async = true;
        document.body.appendChild(s);
      }
    }
    return () => { player.current?.disconnect(); player.current = null; };
  }, [connected]);

  // Hand Spotify the whole song list as one context, so it plays straight through.
  // When songs are added mid-song, re-send the longer list at the same spot so nothing restarts.
  useEffect(() => {
    if (!armed || !device || feeding.current || !songs.length || songs.length === issued.current) return;
    feeding.current = true;
    (async () => {
      const st = await player.current?.getCurrentState();
      const started = issued.current > 0;
      const idle = !st || (st.paused && st.position === 0 && st.track_window.next_tracks.length === 0);
      let offset = 0, pos = 0, keepPaused = false;
      if (started && !idle) { offset = Math.max(0, playingIdx.current); pos = st.position; keepPaused = st.paused; }
      else if (started) offset = Math.min(issued.current, songs.length - 1); // list had finished: start with the new songs
      if (!started) await sp.api('/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [device], play: false }) }).catch(() => null);
      await sp.api(`/me/player/play?device_id=${device}`, {
        method: 'PUT', body: JSON.stringify({ uris: songs.map((x) => x.uri), offset: { position: offset }, position_ms: pos }),
      });
      if (!tuned.current) {
        // An account left on "repeat one" would loop a single song forever. Play the list in order instead.
        await sp.api(`/me/player/repeat?state=context&device_id=${device}`, { method: 'PUT' }).catch(() => null);
        await sp.api(`/me/player/shuffle?state=false&device_id=${device}`, { method: 'PUT' }).catch(() => null);
        tuned.current = true;
      }
      if (keepPaused) player.current?.pause();
      issued.current = songs.length;
      setErr('');
    })().catch((e) => {
      const code = String(e).match(/[0-9]{3}/)?.[0];
      setErr(code === '403' ? 'Spotify says this account can’t play here (Premium needed).'
        : code === '404' ? 'Spotify couldn’t find this player yet. Tap Retry.'
        : code === '401' ? 'Spotify signed out. Reconnect.'
        : 'Couldn’t start playback. Tap Retry.');
    }).finally(() => { feeding.current = false; });
  }, [songs, armed, device, kick]);

  // A real tap: unlocks audio in the browser, then plays or retries.
  const tapPlay = async () => {
    const pl = player.current;
    pl?.activateElement?.();
    setErr(''); setNeedsTap(false);
    const st = await pl?.getCurrentState?.();
    if (st?.track_window?.current_track) pl.resume();
    else { issued.current = 0; tuned.current = false; setKick((k) => k + 1); }
  };

  // Tell the phones what's going on.
  useEffect(() => {
    const status: MusicStatus = { connected, armed, now, count: songs.length, err };
    tvBus.send('sp-now', status as unknown as Record<string, unknown>);
  }, [connected, armed, now, songs.length, err, bus.ch]);

  // Handle requests from the phones.
  useEffect(() => tvBus.onEvent(async (event, p) => {
    if (event === 'sp-hello') {
      tvBus.send('sp-now', { connected: connectedRef.current, armed, now, count: songsRef.current.length, err });
    }
    if (event === 'sp-search') {
      if (!connectedRef.current) { tvBus.send('sp-results', { rid: p.rid, error: 'not_connected' }); return; }
      try { tvBus.send('sp-results', { rid: p.rid, items: await sp.searchTracks(String(p.q || '')) }); }
      catch { tvBus.send('sp-results', { rid: p.rid, error: 'search_failed' }); }
    }
    if (event === 'sp-ctl') {
      const pl = player.current; if (!pl) return;
      if (p.cmd === 'toggle') pl.togglePlay();
      if (p.cmd === 'next') pl.nextTrack();
      if (p.cmd === 'prev') pl.previousTrack();
    }
    if (event === 'sp-save') {
      const uris = songsRef.current.map((s) => s.uri);
      if (!uris.length) { tvBus.send('sp-saved', { error: 'empty' }); return; }
      const date = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      try { tvBus.send('sp-saved', { url: await sp.savePlaylist(`Us, Again (${date})`, uris) }); }
      catch { tvBus.send('sp-saved', { error: 'save_failed' }); }
    }
  }), [armed, now, err]);

  const arm = () => { player.current?.activateElement?.(); setArmed(true); };

  if (!bus.room) return null;
  return (
    <div className="music" role="region" aria-label="Music">
      {!connected ? (
        <button className="music-btn" onClick={() => sp.login()}>🎵 Connect Spotify</button>
      ) : !armed ? (
        <button className="music-btn" onClick={arm}>▶ Start the music</button>
      ) : !device ? (
        <span className="music-idle">🎵 Connecting to Spotify…</span>
      ) : now && !needsTap ? (
        <>
          {now.art && <img className="music-art" src={now.art} alt="" />}
          <span className="music-meta"><b>{now.name}</b><span>{now.artist}</span></span>
          <button className="music-ctl" onClick={() => player.current?.togglePlay()} aria-label={now.paused ? 'Play' : 'Pause'}>{now.paused ? '▶' : '❚❚'}</button>
          <button className="music-ctl" onClick={() => player.current?.nextTrack()} aria-label="Next song">⏭</button>
        </>
      ) : (
        <>
          {songs.length > 0 && <button className="music-ctl big" onClick={tapPlay} aria-label="Play">▶</button>}
          <span className="music-idle">{songs.length ? `${songs.length} ${songs.length === 1 ? 'song' : 'songs'} ready` : '🎵 Add songs from your phones'}</span>
        </>
      )}
      {err && (
        <span className="music-err">
          {err}
          {!/Premium|signed out|browser/.test(err) && <button className="tool" onClick={tapPlay}>Retry</button>}
          {/signed out/.test(err) && <button className="tool" onClick={() => sp.login()}>Reconnect</button>}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Phone

export function MusicPhone() {
  const bus = useBus(phoneBus);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<MusicStatus | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<sp.Song[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const [saved, setSaved] = useState('');
  const rid = useRef('');
  const nextItem = useRef(0);

  useEffect(() => phoneBus.onEvent((event, p) => {
    if (event === 'sp-now') setStatus(p as unknown as MusicStatus);
    if (event === 'sp-results' && p.rid === rid.current) {
      setBusy(false);
      if (p.error === 'not_connected') setMsg('Connect Spotify on the TV first.');
      else if (p.error) setMsg('Search didn’t work. Try again.');
      else { setResults(p.items as sp.Song[]); setMsg((p.items as sp.Song[]).length ? '' : 'No songs found.'); }
    }
    if (event === 'sp-saved') {
      if (p.url) setSaved(String(p.url));
      else setMsg(p.error === 'empty' ? 'Add a few songs first.' : 'Couldn’t save the playlist. Try again.');
    }
  }), []);

  useEffect(() => { if (open) phoneBus.send('sp-hello', {}); }, [open]);

  if (!bus.room || !bus.view || bus.view.state.phase === 'lobby') return null;

  const search = () => {
    if (!q.trim()) return;
    rid.current = Math.random().toString(36).slice(2);
    setBusy(true); setMsg('');
    phoneBus.send('sp-search', { q: q.trim(), rid: rid.current });
    setTimeout(() => setBusy((b) => { if (b) setMsg('The TV didn’t answer. Is it still open?'); return false; }), 8000);
  };
  const add = async (s: sp.Song) => {
    const { room, token, slot, view } = phoneBus.get();
    if (!room || !token || slot == null || !view) return;
    const mine = view.submitted.filter((x) => x.activity === SONGS && x.slot === slot).length;
    const item = Math.max(mine, nextItem.current);
    if (item > 50) { setMsg('That’s the most songs one person can add.'); return; }
    nextItem.current = item + 1;
    try {
      await rpc('us_again_submit_answer', { p_room: room, p_token: token, p_activity: SONGS, p_item: item, p_body: { ...s, t: Date.now() } });
      phoneBus.send('refresh', {});
      setAdded((a) => [...a, s.uri]);
    } catch { setMsg('Couldn’t add that song. Try again.'); }
  };

  return (
    <>
      <button className={`music-fab ${status?.now && !status.now.paused ? 'playing' : ''}`} onClick={() => setOpen(true)} aria-label="Music">🎵</button>
      {open && (
        <div className="sheet" role="dialog" aria-label="Our soundtrack">
          <div className="sheet-inner">
            <div className="sheet-head">
              <h2>Our soundtrack</h2>
              <button className="tool" onClick={() => setOpen(false)}>Close</button>
            </div>
            {status?.now ? (
              <div className="np">
                {status.now.art && <img src={status.now.art} alt="" />}
                <span className="music-meta"><b>{status.now.name}</b><span>{status.now.artist}</span></span>
                <div className="np-ctl">
                  <button className="music-ctl" onClick={() => phoneBus.send('sp-ctl', { cmd: 'prev' })} aria-label="Previous">⏮</button>
                  <button className="music-ctl" onClick={() => phoneBus.send('sp-ctl', { cmd: 'toggle' })} aria-label="Play or pause">{status.now.paused ? '▶' : '❚❚'}</button>
                  <button className="music-ctl" onClick={() => phoneBus.send('sp-ctl', { cmd: 'next' })} aria-label="Next">⏭</button>
                </div>
              </div>
            ) : (
              <p className="hint">
                {!status ? 'Checking the TV…' : !status.connected ? 'Connect Spotify on the TV to get started.'
                  : !status.armed ? 'Tap “Start the music” on the TV once, then add songs here.' : 'Add a song and it’ll start playing on the TV.'}
              </p>
            )}
            <div className="search-row">
              <input value={q} placeholder="Search songs or artists" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }} />
              <button className="btn primary" disabled={busy} onClick={search}>{busy ? '…' : 'Search'}</button>
            </div>
            <p className="note" role="alert">{msg}</p>
            <ul className="results">
              {results.map((s) => (
                <li key={s.uri}>
                  {s.thumb && <img src={s.thumb} alt="" />}
                  <span className="music-meta"><b>{s.name}</b><span>{s.artist}</span></span>
                  <button className="tool" disabled={added.includes(s.uri)} onClick={() => add(s)}>{added.includes(s.uri) ? 'Added ♥' : 'Add'}</button>
                </li>
              ))}
            </ul>
            <p className="hint">{status?.count ? `${status.count} ${status.count === 1 ? 'song' : 'songs'} in your soundtrack so far.` : ''}</p>
            {saved ? (
              <a className="btn primary wide" href={saved} target="_blank" rel="noreferrer">Saved! Open in Spotify</a>
            ) : (
              <button className="btn ghost wide" onClick={() => { setMsg(''); phoneBus.send('sp-save', {}); }}>Save as a Spotify playlist</button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
