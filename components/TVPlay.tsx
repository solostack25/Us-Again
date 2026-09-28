'use client';

import { ACTS, BEAT_SECONDS, DOODLE_ROUNDS, DOODLE_SECONDS, PORTRAIT_SECONDS, STORY_LINES, TUNE_ROUNDS } from '@/lib/activities';
import {
  type AnswerMap, type GameState, type RoomView,
  akey, doodlePrompt, findAnswer, meldMatched, meldSeed, playerName, spectrum, storyOpener,
} from '@/lib/game';
import { Burst, Hearts, tintStyle } from './Deco';
import { StrokeView, type Stroke } from './Canvas';
import { TVBoard } from './Boards';

export interface LiveProps {
  view: RoomView;
  answers: AnswerMap;
  strokes: Stroke[];
  dial: number | null;
  pulse: [number, number];
  elapsed: number; // seconds since the current step started, per the TV clock
}

const has = (v: RoomView, key: string, slot: number, item: number) =>
  v.submitted.some((x) => x.activity === key && x.slot === slot && x.item === item);

function Chips({ view, done }: { view: RoomView; done: [boolean, boolean] }) {
  return (
    <div className="tv-pair">
      {[0, 1].map((i) => (
        <span key={i} className={`chip ${done[i] ? 'in' : ''}`}>{playerName(view, i)} {done[i] ? '✓' : '…'}</span>
      ))}
    </div>
  );
}

function Timer({ total, elapsed }: { total: number; elapsed: number }) {
  const left = Math.max(0, Math.ceil(total - elapsed));
  return <p className={`tv-timer ${left <= 10 ? 'low' : ''}`}>{left}s</p>;
}

function Spectrum({ s, needle, showTarget }: { s: GameState; needle: number | null; showTarget: boolean }) {
  const [l, r] = spectrum(s);
  return (
    <div className="spectrum">
      <div className="spec-bar">
        {showTarget && (
          <>
            <span className="zone z1" style={{ left: `${s.target - 20}%`, width: '40%' }} />
            <span className="zone z2" style={{ left: `${s.target - 14}%`, width: '28%' }} />
            <span className="zone z3" style={{ left: `${s.target - 9}%`, width: '18%' }} />
            <span className="zone z4" style={{ left: `${s.target - 4}%`, width: '8%' }} />
          </>
        )}
        {needle != null && <span className="needle" style={{ left: `${needle}%` }} />}
      </div>
      <div className="spec-labels"><span>← {l}</span><span>{r} →</span></div>
    </div>
  );
}

export function TVPlay({ view, answers, strokes, dial, pulse, elapsed }: LiveProps) {
  const s = view.state;
  const act = ACTS[s.act!];
  const name = (slot: number) => playerName(view, slot);
  const key = akey(s);

  switch (act.kind) {
    case 'board':
      return <TVBoard view={view} />;
    case 'meld': {
      const prevA = findAnswer(answers[key], 0, s.r - 1)?.body.text;
      const prevB = findAnswer(answers[key], 1, s.r - 1)?.body.text;
      if (s.sub === 'write') {
        return (
          <main className="tv tv-center" style={tintStyle(act.tint)}>
            <p className="tv-step">Round {s.r + 1}</p>
            {s.r === 0 ? (
              <>
                <p className="tv-lede">Type the first word you think of when you see</p>
                <h1 className="tv-word pop">{meldSeed(s)}</h1>
              </>
            ) : (
              <>
                <p className="tv-lede">Now type one word that connects</p>
                <h1 className="tv-word pop">{prevA} <span className="plus">+</span> {prevB}</h1>
              </>
            )}
            <Chips view={view} done={[has(view, key, 0, s.r), has(view, key, 1, s.r)]} />
          </main>
        );
      }
      const matched = meldMatched(s, answers);
      return (
        <main className="tv" style={tintStyle(act.tint)}>
          <p className="tv-step">Round {s.r + 1}</p>
          <div className="tv-match pop" key={s.r}>
            {[0, 1].map((slot) => (
              <div key={slot} className={`pick ${matched ? 'same' : ''}`}>
                <span className="who-nm">{name(slot)}</span>
                <span className="choice">{findAnswer(answers[key], slot, s.r)?.body.text}</span>
              </div>
            ))}
          </div>
          <p className={`verdict-big ${matched ? 'yes' : ''}`}>
            {matched ? <>Mind meld! <Burst /></> : s.r >= 9 ? 'So close. That’s the last round.' : 'Not yet. Next round, connect these two.'}
          </p>
        </main>
      );
    }

    case 'truths': {
      const owner = s.o, guesser = 1 - s.o;
      const mine = findAnswer(answers[key], owner, 0)?.body;
      const g = findAnswer(answers[akey(s, '-g')], guesser, owner)?.body.g;
      const show = s.sub === 'show';
      const right = show && g === mine?.f;
      return (
        <main className="tv" style={tintStyle(act.tint)}>
          <p className="tv-step">{show ? 'The reveal' : `${name(guesser)}, which of ${name(owner)}’s memories is made up? Pick on your phone.`}</p>
          <ol className="truths">
            {(mine?.s || []).map((t, i) => (
              <li key={i} className={`${show && i === mine?.f ? 'fake' : ''} ${show && i === g ? 'guessed' : ''}`}>
                <span className="n">{i + 1}</span><span className="t">{t}</span>
                {show && i === mine?.f && <span className="tag">Made up</span>}
              </li>
            ))}
          </ol>
          {show && <p className={`verdict-big ${right ? 'yes' : ''}`}>{right ? <>{name(guesser)} spotted it! <Burst /></> : `${name(owner)} fooled you!`}</p>}
        </main>
      );
    }

    case 'story': {
      const writer = s.r % 2;
      return (
        <main className="tv tv-center" style={tintStyle(act.tint)}>
          <p className="tv-step">Line {s.r + 1} of {STORY_LINES}</p>
          <h1 className="tv-title">“{storyOpener(s)}”</h1>
          <p className="tv-lede">{name(writer)} is writing the next line, having seen only the one before it. No peeking until the end.</p>
          <div className="tv-dots" aria-hidden="true">
            {Array.from({ length: STORY_LINES }, (_, j) => <i key={j} className={j < s.r ? 'on' : j === s.r ? 'now' : ''}>♥</i>)}
          </div>
        </main>
      );
    }

    case 'portrait': {
      if (s.sub === 'draw') {
        return (
          <main className="tv tv-center" style={tintStyle(act.tint)}>
            <p className="tv-emoji" aria-hidden="true">🎨</p>
            <h1 className="tv-title">Drawing each other. No peeking!</h1>
            <Timer total={PORTRAIT_SECONDS} elapsed={elapsed} />
            <Chips view={view} done={[has(view, key, 0, 0), has(view, key, 1, 0)]} />
          </main>
        );
      }
      return <Portraits view={view} answers={answers} />;
    }

    case 'doodle': {
      const drawer = s.r % 2, guesser = 1 - drawer;
      if (s.sub === 'draw') {
        return (
          <main className="tv tv-doodle" style={tintStyle(act.tint)}>
            <div>
              <p className="tv-step">Round {s.r + 1} of {DOODLE_ROUNDS}</p>
              <h1 className="tv-title">{name(drawer)} is drawing a memory.</h1>
              <p className="tv-lede">{name(guesser)}, guess out loud!</p>
              <Timer total={DOODLE_SECONDS} elapsed={elapsed} />
            </div>
            <div className="frame live"><StrokeView strokes={strokes} /></div>
          </main>
        );
      }
      const img = findAnswer(answers[key], drawer, s.r)?.body.img;
      const ok = s.res[s.r];
      return (
        <main className="tv tv-doodle" style={tintStyle(act.tint)}>
          <div>
            <p className="tv-step">Round {s.r + 1} of {DOODLE_ROUNDS}</p>
            <p className="tv-lede">It was</p>
            <h1 className="tv-title pop">{doodlePrompt(s)}</h1>
            <p className={`verdict-big ${ok ? 'yes' : ''}`}>{ok ? <>{name(guesser)} got it! <Burst /></> : 'Not this time. Tell the story behind it.'}</p>
          </div>
          <div className="frame">{img ? <img src={img} alt={`${name(drawer)}’s drawing of ${doodlePrompt(s)}`} /> : <StrokeView strokes={strokes} />}</div>
        </main>
      );
    }

    case 'tune': {
      const giver = s.r % 2, guesser = 1 - giver;
      const clue = findAnswer(answers[akey(s, '-c')], giver, s.r)?.body.text;
      const guess = findAnswer(answers[akey(s, '-g')], guesser, s.r)?.body.v;
      const total = s.pts.reduce((a, b) => a + b, 0);
      return (
        <main className="tv" style={tintStyle(act.tint)}>
          <p className="tv-step">Round {s.r + 1} of {TUNE_ROUNDS}. Score {total}</p>
          {s.sub === 'clue' && <h1 className="tv-title">{name(giver)} is thinking of a clue…</h1>}
          {s.sub !== 'clue' && <h1 className="tv-title pop" key={`c${s.r}`}>“{clue}”</h1>}
          <Spectrum s={s} needle={s.sub === 'show' ? (guess ?? null) : s.sub === 'guess' ? dial : null} showTarget={s.sub === 'show'} />
          {s.sub === 'guess' && <p className="tv-lede">{name(guesser)} is tuning in…</p>}
          {s.sub === 'show' && (
            <p className={`verdict-big ${s.pts[s.r] >= 3 ? 'yes' : ''}`}>
              {['Missed it. Talk it out.', '+1. In the neighborhood.', '+2. Nice!', '+3. So close!', '+4. Perfectly tuned in!'][s.pts[s.r] ?? 0]}
              {s.pts[s.r] >= 3 && <Burst />}
            </p>
          )}
        </main>
      );
    }

    case 'beat': {
      if (s.sub === 'ready') {
        return (
          <main className="tv tv-center" style={tintStyle(act.tint)}>
            <Hearts count={10} />
            <p className="tv-emoji" aria-hidden="true">💓</p>
            <h1 className="tv-title">Find your rhythm together.</h1>
            <p className="tv-lede">When you tap Start, you’ll have {BEAT_SECONDS} seconds. Tap the heart on your phone, and try to fall into the same beat. No talking, no counting.</p>
          </main>
        );
      }
      if (s.sub === 'count') {
        const n = Math.max(1, 3 - Math.floor(elapsed));
        return <main className="tv tv-center" style={tintStyle(act.tint)}><h1 className="tv-count pop" key={n}>{n}</h1></main>;
      }
      if (s.sub === 'tap') {
        return (
          <main className="tv tv-center tv-beat" style={tintStyle(act.tint)}>
            <Timer total={BEAT_SECONDS} elapsed={elapsed} />
            <div className="beat-hearts">
              {[0, 1].map((slot) => (
                <div key={slot} className="beat-one">
                  <span className="bh" key={pulse[slot]}>♥</span>
                  <span className="who-nm">{name(slot)}</span>
                </div>
              ))}
            </div>
          </main>
        );
      }
      return <BeatResult view={view} />;
    }
    default:
      return null;
  }
}

function Portraits({ view, answers }: { view: RoomView; answers: AnswerMap }) {
  const s = view.state;
  const name = (slot: number) => playerName(view, slot);
  return (
    <main className="tv" style={tintStyle(ACTS[s.act!].tint)}>
      <Hearts count={10} />
      <h1 className="tv-title">The unveiling</h1>
      <div className="gallery">
        {[0, 1].map((slot) => {
          const img = findAnswer(answers[akey(s)], slot, 0)?.body.img;
          return (
            <figure key={slot} className="frame pop">
              {img && <img src={img} alt={`${name(slot)}’s portrait of ${name(1 - slot)}`} />}
              <figcaption>{name(slot)}’s portrait of {name(1 - slot)}</figcaption>
            </figure>
          );
        })}
      </div>
    </main>
  );
}

function BeatResult({ view }: { view: RoomView }) {
  const s = view.state;
  const b = s.beat;
  const sync = b?.sync ?? 0;
  const line = sync >= 80 ? 'Two hearts, one beat.' : sync >= 60 ? 'Beautifully in step.' : sync >= 35 ? 'Finding each other.' : 'Two different songs. Try again?';
  return (
    <main className="tv tv-center" style={tintStyle(ACTS[s.act!].tint)}>
      <Hearts count={14} />
      <h1 className="tv-count pop">{sync}%</h1>
      <h2 className="tv-title">{line} {sync >= 60 && <Burst />}</h2>
      <p className="tv-lede">{playerName(view, 0)} tapped {b?.a ?? 0} times, {playerName(view, 1)} tapped {b?.b ?? 0}.</p>
    </main>
  );
}

/** Keepsake screens for the live games. */
export function TVPlayEnd({ view, answers }: { view: RoomView; answers: AnswerMap }) {
  const s = view.state;
  const act = ACTS[s.act!];
  const name = (slot: number) => playerName(view, slot);
  const key = akey(s);
  const shell = (title: string, body: React.ReactNode) => (
    <main className="tv tv-end" style={tintStyle(act.tint)}>
      <Hearts count={12} />
      <p className="tv-emoji" aria-hidden="true">{act.emoji}</p>
      <h1 className="tv-title">{title}</h1>
      {body}
    </main>
  );

  switch (act.kind) {
    case 'meld': {
      const rounds = s.r + 1;
      const matched = meldMatched(s, answers, s.r);
      const word = findAnswer(answers[key], 0, s.r)?.body.text;
      return shell(matched ? `You melded on “${word}” in ${rounds} ${rounds === 1 ? 'round' : 'rounds'}.` : 'No meld this time. Look at the path you took.', (
        <div className="chain">
          <span className="w seed">{meldSeed(s)}</span>
          {Array.from({ length: rounds }, (_, r) => (
            <span key={r} className="step">
              <span className="w">{findAnswer(answers[key], 0, r)?.body.text}</span>
              <span className="w">{findAnswer(answers[key], 1, r)?.body.text}</span>
            </span>
          ))}
        </div>
      ));
    }
    case 'truths': {
      const score = [0, 1].filter((o) => findAnswer(answers[akey(s, '-g')], 1 - o, o)?.body.g === findAnswer(answers[key], o, 0)?.body.f).length;
      return shell(score === 2 ? 'You both spotted the fakes!' : score === 1 ? 'One fake spotted, one masterful liar.' : 'Two expert storytellers.', (
        <div className="tv-keep">
          {[0, 1].map((o) => {
            const b = findAnswer(answers[key], o, 0)?.body;
            return (
              <section key={o}>
                <h2>{name(o)}’s memories</h2>
                {(b?.s || []).map((t, i) => (
                  <div className="item" key={i}><p className="q">{i === b?.f ? 'Made up' : 'True'}</p><p className="a">{t}</p></div>
                ))}
              </section>
            );
          })}
        </div>
      ));
    }
    case 'story':
      return shell('The story of us', (
        <div className="story">
          <p className="line opener">{storyOpener(s)}</p>
          {Array.from({ length: STORY_LINES }, (_, r) => (
            <p key={r} className={`line w${r % 2}`}>{findAnswer(answers[key], r % 2, r)?.body.text}</p>
          ))}
          <p className="tv-lede">One of you, read it aloud.</p>
        </div>
      ));
    case 'portrait':
      return <Portraits view={view} answers={answers} />;
    case 'doodle': {
      const got = s.res.filter(Boolean).length;
      return shell(`You guessed ${got} of ${DOODLE_ROUNDS}.`, (
        <div className="gallery four">
          {Array.from({ length: DOODLE_ROUNDS }, (_, r) => {
            const img = findAnswer(answers[key], r % 2, r)?.body.img;
            return (
              <figure key={r} className="frame">
                {img && <img src={img} alt={doodlePrompt(s, r)} />}
                <figcaption>{doodlePrompt(s, r)}{s.res[r] ? ' ♥' : ''}</figcaption>
              </figure>
            );
          })}
        </div>
      ));
    }
    case 'tune': {
      const total = s.pts.reduce((a, b) => a + b, 0);
      const max = TUNE_ROUNDS * 4;
      return shell(`${total} of ${max} points.`, (
        <p className="tv-lede">{total >= max * 0.7 ? 'You two are on the same frequency.' : total >= max * 0.4 ? 'Nicely tuned in.' : 'Some static tonight. Talk through the surprising ones.'}</p>
      ));
    }
    case 'beat':
      return <BeatResult view={view} />;
    default:
      return null;
  }
}
