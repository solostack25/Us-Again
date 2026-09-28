'use client';

import { useEffect, useRef, useState } from 'react';
import { rpc } from '@/lib/supabase';
import { ACTS, DOODLE_ROUNDS, DOODLE_SECONDS, PORTRAIT_SECONDS, STORY_LINES, TUNE_ROUNDS } from '@/lib/activities';
import { type Action, type Body, type RoomView, akey, doodlePrompt, meldSeed, playerName, spectrum, storyOpener } from '@/lib/game';
import { DrawPad, type DrawPadHandle, type StrokeEvent } from './Canvas';
import { tintStyle } from './Deco';

export type PSess = { room: string; token: string; slot: number; code: string };
export interface PlayProps {
  view: RoomView;
  sess: PSess;
  ping: () => void;
  send: (a: Action) => void;
  emit: (event: string, payload: Record<string, unknown>) => void;
}

const has = (v: RoomView, key: string, slot: number, item: number) =>
  v.submitted.some((x) => x.activity === key && x.slot === slot && x.item === item);

async function submit(sess: PSess, activity: string, item: number, body: Body) {
  await rpc('us_again_submit_answer', { p_room: sess.room, p_token: sess.token, p_activity: activity, p_item: item, p_body: body });
}

/** Seconds left on a countdown that starts when the component mounts. */
function useCountdown(total: number) {
  const [left, setLeft] = useState(total);
  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil(total - (Date.now() - start) / 1000))), 250);
    return () => clearInterval(t);
  }, [total]);
  return left;
}

function Shell({ act, children }: { act: keyof typeof ACTS; children: React.ReactNode }) {
  return <main className="phone" style={tintStyle(ACTS[act].tint)}>{children}</main>;
}

function Waiting({ title, text, emoji = '✨' }: { title: string; text?: string; emoji?: string }) {
  return (
    <>
      <p className="big-emoji" aria-hidden="true">{emoji}</p>
      <h1 className="ph-title">{title}</h1>
      {text && <p className="lede">{text}</p>}
    </>
  );
}

function NextBtn({ send, label = 'Next' }: { send: PlayProps['send']; label?: string }) {
  return <button className="btn primary wide" onClick={() => send({ type: 'next' })}>{label}</button>;
}

export function PhonePlay(props: PlayProps) {
  const { view } = props;
  const s = view.state;
  const kind = ACTS[s.act!].kind;
  const k = `${s.round}-${s.r}-${s.sub}-${s.o}`;
  switch (kind) {
    case 'meld': return <Meld key={k} {...props} />;
    case 'truths': return <TruthsGuess key={k} {...props} />;
    case 'story': return <Story key={k} {...props} />;
    case 'portrait': return <Portrait key={k} {...props} />;
    case 'doodle': return <Doodle key={k} {...props} />;
    case 'tune': return <Tune key={k} {...props} />;
    case 'beat': return <Beat key={k} {...props} />;
    default: return null;
  }
}

function Meld({ view, sess, ping, send }: PlayProps) {
  const s = view.state;
  const me = sess.slot;
  const [word, setWord] = useState('');
  const [err, setErr] = useState('');
  const done = has(view, akey(s), me, s.r);
  if (s.sub === 'show') {
    return <Shell act="meld"><Waiting emoji="🧠" title="Look at the TV!" text="Did you meld? If not, you’ll both try to connect your two words." /><NextBtn send={send} label="Continue" /></Shell>;
  }
  if (done) return <Shell act="meld"><Waiting title="Locked in." text={`Waiting for ${playerName(view, 1 - me)}…`} /></Shell>;
  const go = async () => {
    const w = word.trim();
    if (!w || w.split(/\s+/).length > 2) { setErr('One word, maybe two.'); return; }
    try { await submit(sess, akey(s), s.r, { text: w }); ping(); } catch { setErr('Couldn’t save that. Try again.'); }
  };
  return (
    <Shell act="meld">
      <p className="who">Round {s.r + 1}. No talking!</p>
      <h1 className="prompt">{s.r === 0 ? <>What’s the first word you think of for “{meldSeed(s)}”?</> : 'Type one word that connects the two words on the TV.'}</h1>
      <input className="word-input" value={word} maxLength={30} autoFocus autoComplete="off" autoCapitalize="none"
        onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} />
      <p className="note" role="alert">{err}</p>
      <button className="btn primary wide" onClick={go}>Lock it in</button>
    </Shell>
  );
}

/** Writing phase for Two truths and a memory. */
export function TruthsWrite({ view, sess, ping }: Omit<PlayProps, 'send' | 'emit'>) {
  const s = view.state;
  const key = akey(s);
  const dk = `usagain-d-${sess.room}-${key}`;
  const [lines, setLines] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(dk) || '') as string[]; } catch { return ['', '', '']; }
  });
  const [fake, setFake] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);
  const done = has(view, key, sess.slot, 0) && !editing;
  const set = (i: number, v: string) => {
    const next = lines.map((x, j) => (j === i ? v : x));
    setLines(next);
    try { localStorage.setItem(dk, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };
  if (done) {
    return (
      <Shell act="truths">
        <Waiting title="Nicely done." text={`Waiting for ${playerName(view, 1 - sess.slot)} to finish their three memories…`} />
        <button className="btn ghost" onClick={() => setEditing(true)}>Edit mine</button>
      </Shell>
    );
  }
  const go = async () => {
    if (lines.some((l) => !l.trim())) { setErr('Write all three memories.'); return; }
    if (fake == null) { setErr('Mark which one is made up.'); return; }
    try { await submit(sess, key, 0, { s: lines.map((l) => l.trim()), f: fake }); ping(); setEditing(false); }
    catch { setErr('Couldn’t save that. Try again.'); }
  };
  return (
    <Shell act="truths">
      <p className="who">Only you can see this.</p>
      <h1 className="prompt">Write three memories of us. Make one of them up.</h1>
      <p className="hint">Keep them about the same length so the fake doesn’t stand out. Then tap the one that’s made up.</p>
      {[0, 1, 2].map((i) => (
        <div key={i} className={`truth-row ${fake === i ? 'fake' : ''}`}>
          <textarea className="short" value={lines[i]} maxLength={160} aria-label={`Memory ${i + 1}`} onChange={(e) => set(i, e.target.value)} />
          <button className="opt tiny" aria-pressed={fake === i} onClick={() => setFake(i)}>{fake === i ? 'This is the fake' : 'Mark as fake'}</button>
        </div>
      ))}
      <p className="note" role="alert">{err}</p>
      <button className="btn primary wide" onClick={go}>Done</button>
    </Shell>
  );
}

function TruthsGuess({ view, sess, ping, send }: PlayProps) {
  const s = view.state;
  const me = sess.slot, owner = s.o;
  const [err, setErr] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  if (s.sub === 'show') {
    return <Shell act="truths"><Waiting emoji="🕵️" title="The reveal is on the TV." text="Now tell the real stories behind the true ones." /><NextBtn send={send} label={owner === 0 ? 'Switch turns' : 'See the results'} /></Shell>;
  }
  if (me === owner) return <Shell act="truths"><Waiting emoji="😇" title="Keep a straight face." text={`${playerName(view, 1 - me)} is deciding which memory you made up.`} /></Shell>;
  const pick = async (g: number) => {
    setPicked(g);
    try { await submit(sess, akey(s, '-g'), owner, { g }); ping(); } catch { setErr('Couldn’t save that. Try again.'); setPicked(null); }
  };
  return (
    <Shell act="truths">
      <p className="who">Your guess</p>
      <h1 className="ph-title">Which of {playerName(view, owner)}’s memories is made up?</h1>
      <p className="lede">They’re numbered on the TV.</p>
      <div className="numpad">
        {[0, 1, 2].map((i) => <button key={i} className="pickbtn" aria-pressed={picked === i} disabled={picked != null} onClick={() => pick(i)}>{i + 1}</button>)}
      </div>
      <p className="note" role="alert">{err}</p>
    </Shell>
  );
}

function Story({ view, sess, ping }: PlayProps) {
  const s = view.state;
  const me = sess.slot, writer = s.r % 2;
  const [line, setLine] = useState('');
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  if (me !== writer || sent || has(view, akey(s), me, s.r)) {
    return (
      <Shell act="story">
        <Waiting emoji="📖" title={me === writer ? 'Passed along.' : `${playerName(view, writer)} is writing.`}
          text={`Line ${s.r + 1} of ${STORY_LINES}. The whole story appears on the TV at the end.`} />
      </Shell>
    );
  }
  const go = async () => {
    if (!line.trim()) { setErr('Write your line first.'); return; }
    try { await submit(sess, akey(s), s.r, { text: line.trim() }); setSent(true); ping(); } catch { setErr('Couldn’t save that. Try again.'); }
  };
  return (
    <Shell act="story">
      <p className="who">Line {s.r + 1} of {STORY_LINES}. Your turn.</p>
      {s.r === 0 ? (
        <><p className="hint">The story begins:</p><h1 className="prompt">“{storyOpener(s)}”</h1><p className="hint">Finish that first sentence.</p></>
      ) : (
        <><p className="hint">The line before yours:</p><h1 className="prompt">“{s.prev}”</h1><p className="hint">Write what happens next. One or two sentences.</p></>
      )}
      <textarea className="short" value={line} maxLength={220} onChange={(e) => setLine(e.target.value)} />
      <p className="note" role="alert">{err}</p>
      <button className="btn primary wide" onClick={go}>Pass it on</button>
    </Shell>
  );
}

function Portrait({ view, sess, ping, send }: PlayProps) {
  const s = view.state;
  const me = sess.slot;
  const pad = useRef<DrawPadHandle>(null);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const left = useCountdown(PORTRAIT_SECONDS);
  const done = sent || has(view, akey(s), me, 0);
  const go = async () => {
    if (done || !pad.current) return;
    setSent(true);
    try { await submit(sess, akey(s), 0, { img: pad.current.exportImage() }); ping(); } catch { setErr('Couldn’t save that. Try again.'); setSent(false); }
  };
  useEffect(() => { if (left === 0 && s.sub === 'draw') go(); }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  if (s.sub === 'show') return <Shell act="portrait"><Waiting emoji="🖼️" title="The unveiling is on the TV!" /><NextBtn send={send} label="Finish" /></Shell>;
  if (done) return <Shell act="portrait"><Waiting emoji="🎨" title="Masterpiece submitted." text={`Waiting for ${playerName(view, 1 - me)}…`} /></Shell>;
  return (
    <Shell act="portrait">
      <div className="draw-head"><h1 className="ph-title">Draw {playerName(view, 1 - me)}!</h1><span className={`ph-timer ${left <= 10 ? 'low' : ''}`}>{left}s</span></div>
      <DrawPad ref={pad} />
      <p className="note" role="alert">{err}</p>
      <button className="btn primary wide" onClick={go}>I’m done</button>
    </Shell>
  );
}

function Doodle({ view, sess, ping, send, emit }: PlayProps) {
  const s = view.state;
  const me = sess.slot, drawer = s.r % 2;
  const pad = useRef<DrawPadHandle>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const left = useCountdown(DOODLE_SECONDS);
  if (s.sub === 'show') {
    return <Shell act="doodle"><Waiting emoji="✏️" title="Look at the TV!" text="Tell the story behind this memory." /><NextBtn send={send} label={s.r < DOODLE_ROUNDS - 1 ? 'Next round' : 'See the gallery'} /></Shell>;
  }
  if (me !== drawer) {
    return <Shell act="doodle"><Waiting emoji="👀" title="Guess out loud!" text={`${playerName(view, drawer)} is drawing a memory you share. Watch the TV.`} /></Shell>;
  }
  const finish = async (ok: boolean) => {
    if (!pad.current || busy) return;
    setBusy(true);
    try { await submit(sess, akey(s), s.r, { img: pad.current.exportImage() }); send({ type: 'result', ok }); }
    catch { setErr('Couldn’t save that. Try again.'); setBusy(false); }
  };
  return (
    <Shell act="doodle">
      <div className="secret"><span>Draw this, secretly</span><strong>{doodlePrompt(s)}</strong></div>
      <div className="draw-head"><p className="who">Round {s.r + 1} of {DOODLE_ROUNDS}. No letters!</p><span className={`ph-timer ${left <= 10 ? 'low' : ''}`}>{left}s</span></div>
      <DrawPad ref={pad} onEvent={(e: StrokeEvent) => emit('stroke', e as unknown as Record<string, unknown>)} />
      <p className="note" role="alert">{err}</p>
      <div className="row">
        <button className="btn ghost grow" disabled={busy} onClick={() => finish(false)}>{left === 0 ? 'Time’s up. Reveal' : 'Reveal'}</button>
        <button className="btn primary grow" disabled={busy} onClick={() => finish(true)}>They got it!</button>
      </div>
    </Shell>
  );
}

function Tune({ view, sess, ping, send, emit }: PlayProps) {
  const s = view.state;
  const me = sess.slot, giver = s.r % 2;
  const [l, r] = spectrum(s);
  const [clue, setClue] = useState('');
  const [v, setV] = useState(50);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const lastEmit = useRef(0);
  if (s.sub === 'show') {
    return <Shell act="tune"><Waiting emoji="📻" title="Look at the TV!" text="How close were you?" /><NextBtn send={send} label={s.r < TUNE_ROUNDS - 1 ? 'Next round' : 'See your score'} /></Shell>;
  }
  if (s.sub === 'clue') {
    if (me !== giver) return <Shell act="tune"><Waiting emoji="🤫" title={`${playerName(view, giver)} is thinking of a clue.`} text="No peeking at their phone!" /></Shell>;
    if (sent || has(view, akey(s, '-c'), me, s.r)) return <Shell act="tune"><Waiting title="Clue sent." /></Shell>;
    const go = async () => {
      if (!clue.trim()) { setErr('Give a clue first.'); return; }
      try { await submit(sess, akey(s, '-c'), s.r, { text: clue.trim() }); setSent(true); ping(); } catch { setErr('Couldn’t save that. Try again.'); }
    };
    return (
      <Shell act="tune">
        <p className="who">Round {s.r + 1}. Only you can see the target.</p>
        <div className="mini-spec">
          <div className="bar"><span className="target" style={{ left: `${s.target}%` }} /></div>
          <div className="labels"><span>{l}</span><span>{r}</span></div>
        </div>
        <h1 className="prompt">Give a clue that sits right at that spot.</h1>
        <p className="hint">A thing, a moment, a food, a habit. Anything that lands between “{l}” and “{r}” where the heart is.</p>
        <input className="word-input" value={clue} maxLength={60} onChange={(e) => setClue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} />
        <p className="note" role="alert">{err}</p>
        <button className="btn primary wide" onClick={go}>Send clue</button>
      </Shell>
    );
  }
  // guess
  if (me === giver) return <Shell act="tune"><Waiting emoji="😶" title="Poker face." text={`${playerName(view, 1 - me)} is tuning in. No hints!`} /></Shell>;
  if (sent || has(view, akey(s, '-g'), me, s.r)) return <Shell act="tune"><Waiting title="Locked in." /></Shell>;
  const move = (x: number) => {
    setV(x);
    if (Date.now() - lastEmit.current > 70) { emit('dial', { v: x }); lastEmit.current = Date.now(); }
  };
  const lock = async () => {
    emit('dial', { v });
    try { await submit(sess, akey(s, '-g'), s.r, { v }); setSent(true); ping(); } catch { setErr('Couldn’t save that. Try again.'); }
  };
  return (
    <Shell act="tune">
      <p className="who">Round {s.r + 1}. The clue is on the TV.</p>
      <h1 className="ph-title">Where does it land?</h1>
      <div className="dial">
        <input type="range" min={0} max={100} value={v} aria-label={`Between ${l} and ${r}`} onChange={(e) => move(Number(e.target.value))} />
        <div className="labels"><span>{l}</span><span>{r}</span></div>
      </div>
      <p className="note" role="alert">{err}</p>
      <button className="btn primary wide" onClick={lock}>Lock it in</button>
    </Shell>
  );
}

function Beat({ view, sess, send, emit }: PlayProps) {
  const s = view.state;
  const [n, setN] = useState(0);
  if (s.sub === 'ready') {
    return (
      <Shell act="beat">
        <Waiting emoji="💓" title="Ready when you are." text="When it starts, tap the big heart together for 20 seconds. No talking, no counting." />
        <button className="btn primary wide" onClick={() => send({ type: 'go' })}>Start</button>
      </Shell>
    );
  }
  if (s.sub === 'count') return <Shell act="beat"><Waiting emoji="⏳" title="Get ready…" /></Shell>;
  if (s.sub === 'tap') {
    return (
      <Shell act="beat">
        <button className="tapheart" key={n}
          onPointerDown={() => { emit('tap', { slot: sess.slot }); setN((x) => x + 1); navigator.vibrate?.(15); }}
          aria-label="Tap in rhythm">♥</button>
      </Shell>
    );
  }
  return (
    <Shell act="beat">
      <Waiting emoji="💞" title="Look at the TV!" />
      <div className="row">
        <button className="btn ghost grow" onClick={() => send({ type: 'again' })}>Try again</button>
        <button className="btn primary grow" onClick={() => send({ type: 'next' })}>Done</button>
      </div>
    </Shell>
  );
}
