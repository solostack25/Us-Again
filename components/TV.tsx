'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { rpc, roomChannel } from '@/lib/supabase';
import { ACTS, ACT_ORDER, MAPR, MOODS, RULES, itemText } from '@/lib/activities';
import { Burst, Hearts, tintStyle } from './Deco';
import {
  type Action, type Answer, type GameState, type RoomView,
  akey, autoAdvance, countFor, findAnswer, normalize, playerName, reduce, revealSteps, revealTurn,
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
        <Hearts />
        <p className="tv-emoji" aria-hidden="true">🤍</p>
        <h1 className="tv-title">Everything you wrote has been erased.</h1>
        <p className="tv-lede">Thank you for making time for each other tonight.</p>
        <button className="btn primary" onClick={newSession}>Start a new session</button>
      </main>
    );
  }
  if (!view) return <main className="tv tv-center"><Hearts count={10} /><p className="tv-lede">Setting up your room…</p></main>;

  const s = view.state;
  const name = (slot: number) => playerName(view, slot);
  const act = s.act ? ACTS[s.act] : null;

  if (s.phase === 'lobby') {
    const host = origin.replace(/^https?:\/\//, '');
    const both = view.players.length >= 2;
    return (
      <main className="tv tv-lobby">
        <Hearts />
        <div className="lobby-main">
          <p className="brand-lg">Us, Again <span className="heart" aria-hidden="true">♥</span></p>
          <p className="tv-lede">Get cozy. On your phones, go to <strong>{host}/play</strong> or scan the code, then enter</p>
          <div className="tv-code" aria-label={`Room code ${view.code}`}>
            {view.code.split('').map((c, i) => <span key={i} style={{ animationDelay: `${i * 90}ms` }}>{c}</span>)}
          </div>
          <div className={`tv-pair ${both ? 'both' : ''}`}>
            {[0, 1].map((i) => {
              const pl = view.players.find((x) => x.slot === i);
              return (
                <span key={i} className={`chip ${pl ? 'in' : ''}`}>{pl ? pl.name : 'Waiting…'}</span>
              );
            }).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, <span key="h" className="pair-heart" aria-hidden="true">♥</span>, el] : [el]), [])}
          </div>
        </div>
        {qr && <div className="tv-qr" dangerouslySetInnerHTML={{ __html: qr }} />}
      </main>
    );
  }

  if (s.phase === 'menu' || !act) {
    return (
      <main className="tv tv-menu">
        <Hearts count={10} />
        <h1 className="tv-title">{name(0)} <span className="heart" aria-hidden="true">♥</span> {name(1)}, what are you in the mood for?</h1>
        <p className="tv-lede">Pick on either phone. You’re not trying to fix anything tonight, just to find each other again.</p>
        <div className="tv-moods">
          {MOODS.map((m) => (
            <section key={m.id}>
              <h2>{m.label}</h2>
              <ul className="tv-acts">
                {ACT_ORDER.filter((id) => ACTS[id].mood === m.id).map((id) => (
                  <li key={id} style={tintStyle(ACTS[id].tint)}>
                    <span className="e" aria-hidden="true">{ACTS[id].emoji}</span>
                    <span className="t">{ACTS[id].title}</span>
                    <span className="m">{ACTS[id].time}{ACTS[id].badge ? `. ${ACTS[id].badge}` : ''}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
    );
  }

  if (s.phase === 'rules') {
    return (
      <main className="tv" style={tintStyle(act.tint)}>
        <p className="tv-emoji" aria-hidden="true">{act.emoji}</p>
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
    const lede = act.kind === 'map' ? 'Each of you is guessing about the other.'
      : act.kind === 'match' ? 'Each of you is picking in secret.'
      : 'Each of you is writing privately.';
    return (
      <main className="tv tv-center" style={tintStyle(act.tint)}>
        <p className="tv-emoji" aria-hidden="true">{act.emoji}</p>
        <h1 className="tv-title">Answer on your phones.</h1>
        <p className="tv-lede">{lede} Nothing shows up here until you’re both done.</p>
        <div className="tv-progress">
          {[0, 1].map((slot) => {
            const c = Math.min(countFor(view, key, slot), n);
            return (
              <div key={slot} className="tv-prog-row">
                <span className="nm">{name(slot)}</span>
                <span className="bar" aria-hidden="true">{Array.from({ length: n }, (_, j) => <i key={j} className={j < c ? 'on' : ''}>♥</i>)}</span>
                <span className="ct">{c === n ? 'Done' : `${c} of ${n}`}</span>
              </div>
            );
          })}
        </div>
      </main>
    );
  }

  if (s.phase === 'reveal' && act.kind === 'match') {
    const idx = s.k;
    const picks = [0, 1].map((slot) => findAnswer(answers[akey(s)], slot, idx)?.body);
    const matched = !!picks[0]?.c && picks[0]?.c === picks[1]?.c;
    return (
      <main className="tv" style={tintStyle(act.tint)}>
        <p className="tv-step">{idx + 1} of {revealSteps(act)}</p>
        <h1 className="tv-title">{act.items[idx].t}</h1>
        <div className="tv-match pop" key={s.k}>
          {[0, 1].map((slot) => (
            <div key={slot} className={`pick ${matched ? 'same' : ''}`}>
              <span className="who-nm">{name(slot)}</span>
              <span className="choice">{picks[slot]?.text}</span>
            </div>
          ))}
        </div>
        <p className={`verdict-big ${matched ? 'yes' : ''}`} key={`v${s.k}`}>
          {matched ? <>It’s a match! <Burst /></> : 'Different picks. Ask each other why.'}
        </p>
      </main>
    );
  }

  if (s.phase === 'reveal') {
    const { idx, presenter, listener } = revealTurn(s.k);
    const a = findAnswer(answers[akey(s)], presenter, idx);
    return (
      <main className="tv" style={tintStyle(act.tint)}>
        <p className="tv-step">{act.stem ? `Note ${idx + 1} of ${n}` : `Exhibit ${idx + 1} of ${n}`}. {name(presenter)} shares, {name(listener)} listens.</p>
        <div className="tv-placard pop" key={s.k}>
          {act.stem ? (
            <p className="ans"><span className="stem">{act.items[idx].t.replace('…', '')}</span> {a?.body.text}</p>
          ) : (
            <>
              <p className="ttl">{act.items[idx].t}</p>
              <p className="ans">{a?.body.text}</p>
            </>
          )}
          <p className="cap"><span className="heart" aria-hidden="true">♥</span> {act.stem ? `From ${name(presenter)}` : `Curated by ${name(presenter)}`}</p>
        </div>
      </main>
    );
  }

  if (s.phase === 'mapReveal') {
    const owner = s.o, guesser = 1 - s.o;
    const guess = findAnswer(answers[akey(s)], guesser, s.i);
    const resp = findAnswer(answers[akey(s, '-r')], owner, s.i);
    return (
      <main className="tv" style={tintStyle(act.tint)}>
        <p className="tv-step">{name(guesser)}’s guesses about {name(owner)}. {s.i + 1} of {n}</p>
        <div className="tv-placard pop" key={`${s.o}-${s.i}`}>
          <p className="ttl">{itemText(act, s.i, name(owner))}</p>
          <p className="ans">{guess?.body.text}</p>
          <p className={`verdict ${resp?.body.r != null ? 'on' : ''}`} key={resp?.body.r ?? 'none'}>
            {resp?.body.r != null ? <>{MAPR[resp.body.r]}{resp.body.r === 0 && <Burst />}</> : `${name(owner)}, how close is it?`}
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
      <main className="tv" style={tintStyle(act.tint)}>
        <p className="tv-step">Round {s.d + 1} of {n}. {name(drafter)} is on the clock.</p>
        <h1 className="tv-title">{act.items[s.d].t}</h1>
        {s.dsub === 'pick' ? (
          <p className="tv-lede">{name(drafter)} is choosing a memory…</p>
        ) : (
          <div className="tv-placard pop" key={s.d}>
            <p className="ans">{pick?.body.text}</p>
            <p className="cap"><span className="heart" aria-hidden="true">♥</span> {name(drafter)}’s pick</p>
            {alt?.body.steal && <p className="verdict on" key="steal">Stolen by {name(other)}! You both treasure this one. <Burst /></p>}
            {alt?.body.text && <p className="alt"><strong>{name(other)} would have picked:</strong> {alt.body.text}</p>}
          </div>
        )}
      </main>
    );
  }

  // End: the keepsake
  const main = answers[akey(s)];
  const matches = act.kind === 'match'
    ? act.items.filter((_, j) => { const a = findAnswer(main, 0, j)?.body.c; return !!a && a === findAnswer(main, 1, j)?.body.c; }).length
    : 0;
  return (
    <main className="tv tv-end" style={tintStyle(act.tint)}>
      <Hearts count={12} />
      <p className="tv-emoji" aria-hidden="true">{act.emoji}</p>
      <h1 className="tv-title">{act.kind === 'match' ? `You matched on ${matches} of ${n}.` : 'That’s the whole collection.'}</h1>
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
        ) : act.kind === 'match' ? (
          <section>
            {act.items.map((it, j) => {
              const a0 = findAnswer(main, 0, j)?.body, a1 = findAnswer(main, 1, j)?.body;
              const same = !!a0?.c && a0.c === a1?.c;
              return (
                <div className="item" key={j}>
                  <p className="q">{it.t}{same ? ' ♥' : ''}</p>
                  <p className="a">{same ? a0?.text : `${name(0)}: ${a0?.text ?? ''}. ${name(1)}: ${a1?.text ?? ''}.`}</p>
                </div>
              );
            })}
          </section>
        ) : (
          [0, 1].map((slot) => (
            <section key={slot}>
              <h2>{act.kind === 'map' ? `All about ${name(slot)}` : `From ${name(slot)}`}</h2>
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
