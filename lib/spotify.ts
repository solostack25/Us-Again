// Spotify on the TV: PKCE login (no client secret), token refresh, search, playlists.
const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || '5422441fb4cd40e39baea34d60797e00';
const SCOPES = [
  'streaming', 'user-read-email', 'user-read-private',
  'user-read-playback-state', 'user-modify-playback-state',
  'playlist-modify-private', 'playlist-modify-public',
].join(' ');
const KEY = 'usagain-spotify';
const VERIFIER = 'usagain-sp-verifier';

type Tok = { access: string; refresh: string; exp: number };
export interface Song { uri: string; name: string; artist: string; art: string; thumb: string }

const redirectUri = () => `${window.location.origin}/spotify/callback`;
function read(): Tok | null { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
function store(t: { access_token: string; refresh_token?: string; expires_in: number }) {
  const old = read();
  const tok: Tok = { access: t.access_token, refresh: t.refresh_token || old?.refresh || '', exp: Date.now() + (t.expires_in - 60) * 1000 };
  try { localStorage.setItem(KEY, JSON.stringify(tok)); } catch { /* storage unavailable */ }
}
const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const isConnected = () => !!read();
export function disconnect() { try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ } }

export async function login() {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  const verifier = b64url(bytes.buffer);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  localStorage.setItem(VERIFIER, verifier);
  const q = new URLSearchParams({
    client_id: CLIENT_ID, response_type: 'code', redirect_uri: redirectUri(), scope: SCOPES,
    code_challenge_method: 'S256', code_challenge: challenge,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${q}`;
}

async function tokenRequest(body: Record<string, string>) {
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...body }),
  });
  if (!r.ok) throw new Error(`token ${r.status}`);
  store(await r.json());
}

export async function finishLogin(code: string) {
  const verifier = localStorage.getItem(VERIFIER) || '';
  await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: verifier });
  localStorage.removeItem(VERIFIER);
}

export async function getToken(): Promise<string | null> {
  const t = read();
  if (!t) return null;
  if (Date.now() < t.exp) return t.access;
  try { await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh }); return read()?.access ?? null; }
  catch { disconnect(); return null; }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T | null> {
  const tok = await getToken();
  if (!tok) throw new Error('not_connected');
  const r = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (r.status === 204 || r.status === 202) return null;
  if (!r.ok) throw new Error(`spotify ${r.status}`);
  const text = await r.text();
  return text ? (JSON.parse(text) as T) : null;
}

type ApiTrack = { uri: string; name: string; artists: { name: string }[]; album: { images: { url: string; width: number }[] } };
export async function searchTracks(q: string): Promise<Song[]> {
  const r = await api<{ tracks: { items: ApiTrack[] } }>(`/search?${new URLSearchParams({ q, type: 'track', limit: '10' })}`);
  return (r?.tracks.items || []).map((t) => {
    const imgs = t.album.images || [];
    return {
      uri: t.uri, name: t.name, artist: t.artists.map((a) => a.name).join(', '),
      art: (imgs[1] || imgs[0])?.url || '', thumb: (imgs[imgs.length - 1] || imgs[0])?.url || '',
    };
  });
}

export async function savePlaylist(name: string, uris: string[]): Promise<string> {
  const pl = await api<{ id: string; external_urls?: { spotify?: string } }>('/me/playlists', {
    method: 'POST', body: JSON.stringify({ name, description: 'Made together on Us, Again', public: false }),
  });
  if (!pl) throw new Error('create failed');
  for (let i = 0; i < uris.length; i += 100) {
    await api(`/playlists/${pl.id}/items`, { method: 'POST', body: JSON.stringify({ uris: uris.slice(i, i + 100) }) });
  }
  return pl.external_urls?.spotify || '';
}
