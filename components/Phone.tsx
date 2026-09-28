'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { rpc, roomChannel } from '@/lib/supabase';
import { ACTS, ACT_ORDER, LISTEN, MAPR, RULES, itemText } from '@/lib/activities';
import { type Action, type RoomView, akey, countFor, normalize, playerName, revealTurn } from '@/lib/game';

const P_KEY = 'usagain-player';
type PSess = { room: string; token: string; slot: number; code: string };

function readP(): PSess | null {
  try { const s = localStorage.getItem(P_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
function writeP(s: PSess | null) {
  try { if (s) localStorage.setItem(P_KEY, JSON.stringify(s)); else localStorage.removeItem(P_KEY); } catch { /* storage unavailable */ }
}
function readDraft(k: string) { try { return localStorage.getItem(k) || ''; } catch { return ''; } }
function writeDraft(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }
function clearDrafts(room: string) {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(`usagain-d-${room}`)).forEach((k) => localStorage.removeItem(k));
  } catch { /* storage unavailable */ }
}

const JOIN_ERRORS: Record<string, string> = {
  room_not_found: 'There’s no session with that code. Check the code on the TV.',
  room_full: 'This session already has two people in it.',
  invalid_name: 'Enter a name up to 40 characters.',
};

export default function Phone() {
  const [sess, setSess] = useState<PSess | null>(null);
  const [checked, setChecked] = useState(false);
  const [view, setView] = useState<RoomView | null>(null);
  const [ended, setEnded] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [joining, setJoining] = useState(false);
  const chRef = useRef<RealtimeChannel | null>(null);
  const viewRef = useRef<RoomView | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('code')?.toUpperCase() || '';
    if (q) setCode(q);
    const saved = readP();
    (async () => {
      if (saved && (!q || q === saved.code)) {
        try {
          await rpc('us_again_get_room', { p_room: saved.room, p_token: saved.token });
          setSess(saved);
        } catch { writeP(null); }
      }
      setChecked(true);
    })();
  }, []);

  useEffect(() => {
    if (!sess) return;
    const ch = roomChannel(sess.room);
    chRef.current = ch;
    let stopped = false;
    const refresh = async () => {
      if (stopped) return;
      try {
        const raw = await rpc<RoomView>('us_again_get_room', { p_room: sess.room, p_token: sess.token });
        const v = { ...raw, state: normalize(raw.state) };
        viewRef.current = v;
        setView(v);
      } catch (e) {
        if (String(e).includes('room_not_found')) { stopped = true; clearDrafts(sess.room); writeP(null); setEnded(true); }
      }
    };
    ch.on('broadcast', { event: 'state' }, () => { refresh(); })
      .on('broadcast', { event: 'ended' }, () => { stopped = true; clearDrafts(sess.room); writeP(null); setEnded(true); })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { ch.send({ type: 'broadcast', event: 'refresh', payload: {} }); refresh(); }
      });
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => { stopped = true; clearInterval(timer); ch.unsubscribe(); chRef.current = null; };
  }, [sess]);

  const send = (a: Action) => {
    chRef.current?.send({ type: 'broadcast', event: 'action', payload: { a, v: viewRef.current?.state.v } });
  };
  const ping = () => { chRef.current?.send({ type: 'broadcast', event: 'refresh', payload: {} }); };

  const join = async () => {
    setErr('');
    if (!code.trim() || !name.trim()) { setErr('Enter the room code and your name.'); return; }
    setJoining(true);
    try {
      const r = await rpc<{ room_id: string; slot: number; player_token: string }>('us_again_join', { p_code: code.trim(), p_name: name.trim() });
      const s = { room: r.room_id, token: r.player_token, slot: r.slot, code: code.trim().toUpperCase() };
      writeP(s);
      setSess(s);
    } catch (e) {
      const key = Object.keys(JOIN_ERRORS).find((k) => String(e).includes(k));
      setErr(key ? JOIN_ERRORS[key] : 'Couldn’t join. Check your connection and try again.');
    } finally { setJoining(false); }
  };

  if (ended) {
    return (
      <main className="phone">
        <h1 className="ph-title">That’s the end of the session.</h1>
        <p className="lede">Everything you both wrote has been erased.</p>
        <button className="btn ghost" onClick={() => { setEnded(false); setSess(null); setView(null); }}>Join another session</button>
      </main>
    );
  }

  if (!checked) return <main className="phone"><p className="lede">Loading…</p></main>;

  if (!sess) {
    return (
      <main className="phone">
        <p className="brand">Us, Again</p>
        <h1 className="ph-title">Join the session on your TV.</h1>
        <div className="field">
          <label htmlFor="code">Room code</label>
          <input id="code" className="code-input" value={code} maxLength={4} autoCapitalize="characters" autoComplete="off"
            onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </div>
        <div className="field">
          <label htmlFor="nm">Your name</label>
          <input id="nm" value={name} maxLength={40} autoComplete="given-name" onChange={(e) => setName(e.target.value)} />
        </div>
        <p className="note" role="alert">{err}</p>
        <button className="btn primary wide" disabled={joining} onClick={join}>{joining ? 'Joining…' : 'Join'}</button>
      </main>
    );
  }

  if (!view) return <main className="phone"><p className="lede">Connecting…</p></main>;

  const s = view.state;
  const me = sess.slot, partner = 1 - me;
  const nm = (slot: number) => playerName(view, slot);
  const act = s.act ? ACTS[s.act] : null;

  if (s.phase === 'lobby') {
    return (
      <main className="phone">
        <p className="brand">Us, Again</p>
        <h1 className="ph-title">You’re in, {nm(me)}.</h1>
        <p className="lede">Waiting for your partner to join. The TV shows the code.</p>
      </main>
    );
  }

  if (s.phase === 'menu' || !act) {
    return (
      <main className="phone">
        <h1 className="ph-title">Pick an activity</h1>
        <div className="opts">
          {ACT_ORDER.map((id) => (
            <button key={id} className="opt big" onClick={() => send({ type: 'choose', act: id })}>
              <span className="t">{ACTS[id].title}</span>
              <span className="m">{ACTS[id].time}{ACTS[id].first ? '. A good one to start with.' : ''}</span>
            </button>
          ))}
        </div>
      </main>
    );
  }

  if (s.phase === 'rules') {
    return (
      <main className="phone">
        <h1 className="ph-title">{act.title}</h1>
        <ul className="rules">{[...RULES.base, RULES[act.kind]].map((r) => <li key={r}>{r}</li>)}</ul>
        <div className="row">
          <button className="btn ghost" onClick={() => send({ type: 'menu' })}>Pick another</button>
          <button className="btn primary grow" onClick={() => send({ type: 'start' })}>Start</button>
        </div>
      </main>
    );
  }

  if (s.phase === 'write') {
    return <Write key={akey(s)} view={view} sess={sess} ping={ping} />;
  }

  if (s.phase === 'reveal') {
    const { idx, presenter, listener } = revealTurn(s.k);
    const n = act.items.length;
    if (me === presenter) {
      return (
        <main className="phone">
          <p className="who">{act.stem ? `Sentence ${idx + 1}` : `Exhibit ${idx + 1}`} of {n}</p>
          <h1 className="ph-title">Your turn to present.</h1>
          <p className="lede">{act.stem ? 'Read your answer from the TV, then say a little about why.' : 'Your exhibit is on the TV. Tell the story behind it.'}</p>
          <div className="row">
            {s.k > 0 && <button className="btn ghost" onClick={() => send({ type: 'back' })}>Back</button>}
            <button className="btn primary grow" onClick={() => send({ type: 'next' })}>{s.k < n * 2 - 1 ? 'Next' : 'Finish'}</button>
          </div>
        </main>
      );
    }
    return (
      <main className="phone">
        <p className="who">{nm(listener === me ? presenter : listener)} is presenting</p>
        <h1 className="ph-title">You’re listening.</h1>
        <div className="listen">
          <p>You can only say things like</p>
          {LISTEN.map((l) => <q key={l}>{l}</q>)}
        </div>
      </main>
    );
  }

  if (s.phase === 'mapReveal') {
    if (me === s.o) return <MapOwner key={`${akey(s)}-${s.o}-${s.i}`} view={view} sess={sess} ping={ping} send={send} />;
    return (
      <main className="phone">
        <p className="who">Your map of {nm(s.o)}’s world</p>
        <h1 className="ph-title">Listen to {nm(s.o)}.</h1>
        <p className="lede">Ask about whatever you missed. Don’t defend your guess.</p>
      </main>
    );
  }

  if (s.phase === 'draft') {
    const drafter = s.d % 2;
    if (s.dsub === 'pick') {
      if (me === drafter) return <DraftPick key={`${akey(s)}-${s.d}`} view={view} sess={sess} ping={ping} />;
      return (
        <main className="phone">
          <p className="who">Round {s.d + 1}</p>
          <h1 className="ph-title">{nm(drafter)} is drafting.</h1>
          <p className="lede">“{act.items[s.d].t}.” Think about what you’d pick, in case you want to steal theirs.</p>
        </main>
      );
    }
    if (me === drafter) {
      return (
        <main className="phone">
          <p className="who">Round {s.d + 1}</p>
          <h1 className="ph-title">Tell the story behind your pick.</h1>
          <p className="lede">{nm(partner)} can steal it or say what they’d have picked.</p>
          <button className="btn ghost wide" onClick={() => send({ type: 'next' })}>Next category</button>
        </main>
      );
    }
    return <DraftRespond key={`${akey(s)}-${s.d}`} view={view} sess={sess} ping={ping} send={send} />;
  }

  // end
  return (
    <main className="phone">
      <h1 className="ph-title">That’s the whole exhibit.</h1>
      <p className="lede">Take your time with the TV. When you’re ready, you can play another activity or finish.</p>
      <div className="opts">
        <button className="btn primary wide" onClick={() => send({ type: 'menu' })}>Play another activity</button>
        <button className="btn ghost wide" onClick={() => send({ type: 'erase' })}>Finish and erase everything</button>
      </div>
    </main>
  );
}

type SubProps = { view: RoomView; sess: PSess; ping: () => void; send?: (a: Action) => void };

function Write({ view, sess, ping }: SubProps) {
  const s = view.state;
  const act = ACTS[s.act!];
  const n = act.items.length;
  const key = akey(s);
  const me = sess.slot, partner = 1 - me;
  const partnerName = playerName(view, partner);
  const [idx, setIdx] = useState(() => {
    const done = new Set(view.submitted.filter((x) => x.activity === key && x.slot === me).map((x) => x.item));
    for (let j = 0; j < n; j++) if (!done.has(j)) return j;
    return n;
  });
  const dk = (j: number) => `usagain-d-${sess.room}-${key}-${j}`;
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (idx < n) setText(readDraft(dk(idx))); setErr(''); }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  if (idx >= n) {
    const pc = Math.min(countFor(view, key, partner), n);
    return (
      <main className="phone">
        <h1 className="ph-title">You’re done.</h1>
        <p className="lede">{pc >= n ? 'Look at the TV.' : `Waiting for ${partnerName}. ${pc} of ${n} so far.`}</p>
        <button className="btn ghost" onClick={() => setIdx(0)}>Review my answers</button>
      </main>
    );
  }

  const prompt = act.kind === 'map' ? itemText(act, idx, partnerName) : act.items[idx].t;
  const hint = act.kind === 'map'
    ? `Guess what’s in ${partnerName}’s world right now. Short is fine.`
    : act.items[idx].h || 'Finish the sentence in your own words.';

  const next = async () => {
    const t = text.trim();
    if (!t) { setErr('Write a few words, even rough ones.'); return; }
    setSaving(true);
    try {
      await rpc('us_again_submit_answer', { p_room: sess.room, p_token: sess.token, p_activity: key, p_item: idx, p_body: { text: t } });
      ping();
      setIdx(idx + 1);
    } catch { setErr('Couldn’t save that. Check your connection and try again.'); }
    finally { setSaving(false); }
  };

  return (
    <main className="phone">
      <div className="progress" aria-hidden="true">{Array.from({ length: n }, (_, j) => <i key={j} className={j <= idx ? 'on' : ''} />)}</div>
      <p className="who">Only you can see this. {idx + 1} of {n}</p>
      <h1 className="prompt">{prompt}</h1>
      <p className="hint">{hint}</p>
      <textarea aria-label={prompt} value={text} onChange={(e) => { setText(e.target.value); writeDraft(dk(idx), e.target.value); }} />
      <p className="note" role="alert">{err}</p>
      <div className="row">
        {idx > 0 && <button className="btn ghost" onClick={() => setIdx(idx - 1)}>Back</button>}
        <button className="btn primary grow" disabled={saving} onClick={next}>{idx < n - 1 ? 'Next' : 'Done'}</button>
      </div>
    </main>
  );
}

function MapOwner({ view, sess, ping, send }: SubProps) {
  const s = view.state;
  const act = ACTS[s.act!];
  const n = act.items.length;
  const [r, setR] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const pick = async (j: number) => {
    setR(j); setErr('');
    try {
      await rpc('us_again_submit_answer', { p_room: sess.room, p_token: sess.token, p_activity: akey(s, '-r'), p_item: s.i, p_body: { r: j } });
      ping();
    } catch { setErr('Couldn’t save that. Try again.'); setR(null); }
  };
  const last = s.o === 1 && s.i === n - 1;
  return (
    <main className="phone">
      <p className="who">{playerName(view, 1 - sess.slot)}’s map of your world. {s.i + 1} of {n}</p>
      <h1 className="ph-title">How close is it?</h1>
      <p className="lede">Their guess is on the TV. Pick one, then say it out loud.</p>
      <div className="opts">
        {MAPR.map((m, j) => (
          <button key={m} className="opt" aria-pressed={r === j} onClick={() => pick(j)}>{m}</button>
        ))}
      </div>
      <p className="note" role="alert">{err}</p>
      <button className="btn primary wide" disabled={r === null} onClick={() => send?.({ type: 'next' })}>{last ? 'Finish' : 'Next'}</button>
    </main>
  );
}

function DraftPick({ view, sess, ping }: SubProps) {
  const s = view.state;
  const act = ACTS[s.act!];
  const dk = `usagain-d-${sess.room}-${akey(s)}-${s.d}`;
  const [text, setText] = useState(() => readDraft(dk));
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const lock = async () => {
    const t = text.trim();
    if (!t) { setErr('Write your pick first.'); return; }
    setSaving(true);
    try {
      await rpc('us_again_submit_answer', { p_room: sess.room, p_token: sess.token, p_activity: akey(s), p_item: s.d, p_body: { text: t } });
      ping();
    } catch { setErr('Couldn’t save that. Try again.'); }
    finally { setSaving(false); }
  };
  return (
    <main className="phone">
      <p className="who">Round {s.d + 1} of {act.items.length}. Your pick.</p>
      <h1 className="prompt">{act.items[s.d].t}</h1>
      <p className="hint">Pick one memory. It goes up on the TV when you lock it in.</p>
      <textarea aria-label={act.items[s.d].t} value={text} onChange={(e) => { setText(e.target.value); writeDraft(dk, e.target.value); }} />
      <p className="note" role="alert">{err}</p>
      <button className="btn primary wide" disabled={saving} onClick={lock}>Lock in pick</button>
    </main>
  );
}

function DraftRespond({ view, sess, ping, send }: SubProps) {
  const s = view.state;
  const drafter = s.d % 2;
  const [mode, setMode] = useState<'choose' | 'counter' | 'done'>('choose');
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const submit = async (body: { text?: string; steal?: boolean }) => {
    try {
      await rpc('us_again_submit_answer', { p_room: sess.room, p_token: sess.token, p_activity: akey(s, '-alt'), p_item: s.d, p_body: body });
      ping();
      setMode('done');
    } catch { setErr('Couldn’t save that. Try again.'); }
  };
  return (
    <main className="phone">
      <p className="who">Round {s.d + 1}. {playerName(view, drafter)}’s pick is on the TV.</p>
      {mode === 'choose' && (
        <>
          <h1 className="ph-title">Did you have the same memory?</h1>
          <div className="opts">
            <button className="opt" onClick={() => submit({ steal: true })}>Steal it. I had that one too.</button>
            <button className="opt" onClick={() => setMode('counter')}>I’d pick something else</button>
          </div>
        </>
      )}
      {mode === 'counter' && (
        <>
          <h1 className="ph-title">What would you have picked?</h1>
          <textarea className="short" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="row">
            <button className="btn ghost" onClick={() => setMode('choose')}>Back</button>
            <button className="btn primary grow" onClick={() => text.trim() ? submit({ text: text.trim() }) : setErr('Write your pick first.')}>Share it</button>
          </div>
        </>
      )}
      {mode === 'done' && <h1 className="ph-title">It’s on the TV.</h1>}
      <p className="note" role="alert">{err}</p>
      <button className="btn ghost wide" onClick={() => send?.({ type: 'next' })}>Next category</button>
    </main>
  );
}
