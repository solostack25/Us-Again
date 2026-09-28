'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { rpc, roomChannel } from '@/lib/supabase';
import { ACTS, ACT_ORDER, MAPR, RULES, itemText } from '@/lib/activities';
import {
  type Action, type Answer, type GameState, type RoomView,
  akey, autoAdvance, countFor, findAnswer, normalize, playerName, reduce, revealTurn,
} from '@/lib/game';

const HOST_KEY = 'usagain-host';
type HostSession = { id: string; host: string };

function readSaved(): HostSession | null {
  try { const s = localStorage.getItem(HOST_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
function writeSaved(s: HostSession | null) {
  try { if (s) localStorage.setItem(HOST_KEY, JSON.stringify(s)); else localStorage.removeItem(HOST_KEY); } catch { /* storage unavailable */ }
}

export default function TV() {
  const [session, setSession] = useState<HostSession | null>(null);
  const [view, setView] = useState<RoomView | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer[]>>({});
  const [qr, setQr] = useState('');
  const [origin, setOrigin] = useState('');
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState('');
  const viewRef = useRef<RoomView | null>(null);
  const endedRef = useRef(false);
  const actRef = useRef<((a: Action) => void) | null>(null);

  // Create a room, or resume the one this TV already had open.
  useEffect(() => {
    setOrigin(window.location.origin);
    let cancelled = false;
    (async () => {
      try {
        const saved = readSaved();
        if (saved) {
          try {
            await rpc('us_again_get_room', { p_room: saved.id, p_token: saved.host });
            if (!cancelled) setSession(saved);
            return;
          } catch { writeSaved(null); }
        }
        const r = await rpc<{ room_id: string; host_token: string }>('us_again_create_room');
        const s = { id: r.room_id, host: r.host_token };
        writeSaved(s);
        if (!cancelled) setSession(s);
      } catch {
        setError('Couldn’t start a session. Check the connection and reload.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!session) return;
    let queue: Promise<void> = Promise.resolve();
    const run = (fn: () => Promise<void>) => { queue = queue.then(fn).catch((e) => console.error(e)); };
    const ch: RealtimeChannel = roomChannel(session.id);

    const loadAnswers = async (v: RoomView) => {
      const s = v.state;
      if (!s.act || !['reveal', 'mapReveal', 'draft', 'end'].includes(s.phase)) return;
      const keys = [akey(s)];
      if (ACTS[s.act].kind === 'map') keys.push(akey(s, '-r'));
      if (ACTS[s.act].kind === 'draft') keys.push(akey(s, '-alt'));
      const out: Record<string, Answer[]> = {};
      for (const k of keys) {
        out[k] = await rpc<Answer[]>('us_again_get_answers', { p_room: session.id, p_host_token: session.host, p_activity: k });
      }
      setAnswers(out);
    };

    const commit = async (s: GameState) => {
      await rpc('us_again_set_state', { p_room: session.id, p_host_token: session.host, p_state: s });
      const v = { ...(viewRef.current as RoomView), state: s };
      viewRef.current = v;
      setView(v);
      ch.send({ type: 'broadcast', event: 'state', payload: { v: s.v } });
      await loadAnswers(v);
    };

    const refresh = async () => {
      if (endedRef.current) return;
      try {
        const raw = await rpc<RoomView>('us_again_get_room', { p_room: session.id, p_token: session.host });
        const v = { ...raw, state: normalize(raw.state) };
        viewRef.current = v;
        setView(v);
        const next = autoAdvance(v);
        if (next) await commit(next);
        else await loadAnswers(v);
      } catch (e) {
        if (String(e).includes('room_not_found')) { endedRef.current = true; writeSaved(null); setEnded(true); }
      }
    };

    const handle = async (a: Action, v?: number) => {
      const cur = viewRef.current;
      if (!cur || endedRef.current) return;
      if (v !== undefined && v !== cur.state.v) return; // stale or duplicate tap
      if (a.type === 'erase') {
        await rpc('us_again_end_room', { p_room: session.id, p_host_token: session.host });
        ch.send({ type: 'broadcast', event: 'ended', payload: {} });
        endedRef.current = true;
        writeSaved(null);
        setEnded(true);
        return;
      }
      const next = reduce(cur.state, a);
      if (next) await commit(next);
    };

    ch.on('broadcast', { event: 'action' }, ({ payload }) => run(() => handle(payload.a as Action, payload.v as number)))
      .on('broadcast', { event: 'refresh' }, () => run(refresh))
      .subscribe((status) => { if (status === 'SUBSCRIBED') run(refresh); });

    run(refresh);
    const timer = setInterval(() => run(refresh), 3000);
    actRef.current = (a) => run(() => handle(a));
    return () => { clearInterval(timer); ch.unsubscribe(); };
  }, [session]);

  // Keyboard fallback for a laptop driving the TV.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') actRef.current?.({ type: 'next' });
      if (e.key === 'ArrowLeft') actRef.current?.({ type: 'back' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const code = view?.code;
  useEffect(() => {
    if (!code || !origin) return;
    import('qrcode').then((Q) =>
      Q.toString(`${origin}/play?code=${code}`, { type: 'svg', margin: 1, color: { dark: '#22304B', light: '#FFFFFF' } })
    ).then(setQr).catch(() => setQr(''));
  }, [code, origin]);

  const newSession = () => { writeSaved(null); window.location.reload(); };

  if (error) return <main className="tv"><h1 className="tv-title">{error}</h1></main>;
  if (ended) {
    return (
      <main className="tv tv-center">
        <h1 className="tv-title">Everything you wrote has been erased.</h1>
        <p className="tv-lede">Thank you for making time for each other.</p>
        <button className="btn primary" onClick={newSession}>Start a new session</button>
      </main>
    );
  }
  if (!view) return <main className="tv tv-center"><p className="tv-lede">Setting up your room…</p></main>;

  const s = view.state;
  const name = (slot: number) => playerName(view, slot);
  const act = s.act ? ACTS[s.act] : null;

  if (s.phase === 'lobby') {
    const host = origin.replace(/^https?:\/\//, '');
    return (
      <main className="tv tv-lobby">
        <div>
          <p className="brand-lg">Us, Again</p>
          <p className="tv-lede">On your phones, go to <strong>{host}/play</strong> or scan the code, then enter</p>
          <div className="tv-code" aria-label={`Room code ${view.code}`}>{view.code}</div>
          <ul className="tv-players">
            {[0, 1].map((i) => {
              const p = view.players.find((x) => x.slot === i);
              return <li key={i} className={p ? 'in' : ''}>{p ? `${p.name} is here` : 'Waiting…'}</li>;
            })}
          </ul>
        </div>
        {qr && <div className="tv-qr" dangerouslySetInnerHTML={{ __html: qr }} />}
      </main>
    );
  }

  if (s.phase === 'menu' || !act) {
    return (
      <main className="tv">
        <h1 className="tv-title">Pick an activity on either phone.</h1>
        <p className="tv-lede">You’re not trying to fix anything tonight. You’re remembering who this person is, and learning who they are right now.</p>
        <ul className="tv-acts">
          {ACT_ORDER.map((id) => (
            <li key={id}>
              <span className="t">{ACTS[id].title}</span>
              <span className="b">{ACTS[id].blurb}</span>
              <span className="m">{ACTS[id].time}{ACTS[id].first ? '. A good one to start with.' : ''}</span>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  if (s.phase === 'rules') {
    return (
      <main className="tv">
        <h1 className="tv-title">{act.title}</h1>
        <p className="tv-lede">{act.blurb}</p>
        <ul className="tv-rules">{[...RULES.base, RULES[act.kind]].map((r) => <li key={r}>{r}</li>)}</ul>
        <p className="tv-foot">Tap Start on either phone when you’re both ready.</p>
      </main>
    );
  }

  const n = act.items.length;

  if (s.phase === 'write') {
    const key = akey(s);
    return (
      <main className="tv tv-center">
        <h1 className="tv-title">Answer on your phones.</h1>
        <p className="tv-lede">
          {act.kind === 'map' ? 'Each of you is mapping the other’s world.' : 'Each of you is writing privately.'} Nothing shows up here until you’re both done.
        </p>
        <div className="tv-progress">
          {[0, 1].map((slot) => {
            const c = Math.min(countFor(view, key, slot), n);
            return (
              <div key={slot} className="tv-prog-row">
                <span className="nm">{name(slot)}</span>
                <span className="bar" aria-hidden="true">{Array.from({ length: n }, (_, j) => <i key={j} className={j < c ? 'on' : ''} />)}</span>
                <span className="ct">{c === n ? 'Done' : `${c} of ${n}`}</span>
              </div>
            );
          })}
        </div>
      </main>
    );
  }

  if (s.phase === 'reveal') {
    const { idx, presenter, listener } = revealTurn(s.k);
    const a = findAnswer(answers[akey(s)], presenter, idx);
    return (
      <main className="tv">
        <p className="tv-step">{act.stem ? `Sentence ${idx + 1} of ${n}` : `Exhibit ${idx + 1} of ${n}`}. {name(presenter)} presents, {name(listener)} listens.</p>
        <div className="tv-placard">
          {act.stem ? (
            <p className="ans"><span className="stem">{act.items[idx].t.replace('…', '')}</span> {a?.body.text}</p>
          ) : (
            <>
              <p className="ttl">{act.items[idx].t}</p>
              <p className="ans">{a?.body.text}</p>
            </>
          )}
          <p className="cap">{act.stem ? `${name(presenter)}’s answer` : `Curated by ${name(presenter)}`}</p>
        </div>
      </main>
    );
  }

  if (s.phase === 'mapReveal') {
    const owner = s.o, guesser = 1 - s.o;
    const guess = findAnswer(answers[akey(s)], guesser, s.i);
    const resp = findAnswer(answers[akey(s, '-r')], owner, s.i);
    return (
      <main className="tv">
        <p className="tv-step">{name(guesser)}’s map of {name(owner)}’s world. {s.i + 1} of {n}</p>
        <div className="tv-placard">
          <p className="ttl">{itemText(act, s.i, name(owner))}</p>
          <p className="ans">{guess?.body.text}</p>
          <p className={`verdict ${resp?.body.r != null ? 'on' : ''}`}>
            {resp?.body.r != null ? MAPR[resp.body.r] : `${name(owner)}, how close is it?`}
          </p>
        </div>
      </main>
    );
  }

  if (s.phase === 'draft') {
    const drafter = s.d % 2, other = 1 - drafter;
    const pick = findAnswer(answers[akey(s)], drafter, s.d);
    const alt = findAnswer(answers[akey(s, '-alt')], other, s.d);
    return (
      <main className="tv">
        <p className="tv-step">Round {s.d + 1} of {n}. {name(drafter)} drafts.</p>
        <h1 className="tv-title">{act.items[s.d].t}</h1>
        {s.dsub === 'pick' ? (
          <p className="tv-lede">{name(drafter)} is choosing a memory…</p>
        ) : (
          <div className="tv-placard">
            <p className="ans">{pick?.body.text}</p>
            <p className="cap">
              {name(drafter)}’s pick{alt?.body.steal ? `, stolen by ${name(other)}` : ''}
            </p>
            {alt?.body.text && <p className="alt"><strong>{name(other)} would have picked:</strong> {alt.body.text}</p>}
          </div>
        )}
      </main>
    );
  }

  // End: the keepsake
  const main = answers[akey(s)];
  return (
    <main className="tv">
      <h1 className="tv-title">That’s the whole exhibit.</h1>
      <p className="tv-lede">Stay here a while. Talk about whatever surprised you. When you finish on your phones, all of this is erased.</p>
      <div className="tv-keep">
        {act.kind === 'draft' ? (
          <section>
            {act.items.map((it, j) => {
              const d = j % 2;
              const alt = findAnswer(answers[akey(s, '-alt')], 1 - d, j);
              return (
                <div className="item" key={j}>
                  <p className="q">{it.t}. {name(d)}{alt?.body.steal ? `, stolen by ${name(1 - d)}` : ''}</p>
                  <p className="a">{findAnswer(main, d, j)?.body.text}</p>
                  {alt?.body.text && <p className="a sub">{name(1 - d)}: {alt.body.text}</p>}
                </div>
              );
            })}
          </section>
        ) : (
          [0, 1].map((slot) => (
            <section key={slot}>
              <h2>{act.kind === 'map' ? `${name(slot)}’s world` : `${name(slot)}’s ${act.stem ? 'answers' : 'exhibits'}`}</h2>
              {act.items.map((it, j) => {
                if (act.kind === 'map') {
                  const r = findAnswer(answers[akey(s, '-r')], slot, j)?.body.r;
                  return (
                    <div className="item" key={j}>
                      <p className="q">{itemText(act, j, name(slot))}{r != null ? `. ${MAPR[r]}` : ''}</p>
                      <p className="a">{findAnswer(main, 1 - slot, j)?.body.text}</p>
                    </div>
                  );
                }
                return (
                  <div className="item" key={j}>
                    <p className="q">{it.t}</p>
                    <p className="a">{findAnswer(main, slot, j)?.body.text}</p>
                  </div>
                );
              })}
            </section>
          ))
        )}
      </div>
    </main>
  );
}
