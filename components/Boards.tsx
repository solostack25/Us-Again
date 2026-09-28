'use client';

import { useState } from 'react';
import { ACTS } from '@/lib/activities';
import { checkerMovable, checkerMoves, owner, pitIndex, storeIndex, type Board, type BoardGame } from '@/lib/boards';
import { type Action, type RoomView, playerName } from '@/lib/game';
import { Burst, Hearts, tintStyle } from './Deco';

const MARK = ['♥', '★'];
const cls = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

function TTT({ b, onCell }: { b: Board; onCell?: (i: number) => void }) {
  return (
    <div className="bd ttt">
      {b.cells.map((c, i) => (
        <button key={i} className={cls('cell', c >= 0 && `p${c}`, b.line.includes(i) && 'win', b.last.includes(i) && 'last')}
          disabled={!onCell || c >= 0} onClick={() => onCell?.(i)} aria-label={`Square ${i + 1}`}>
          {c >= 0 ? MARK[c] : ''}
        </button>
      ))}
    </div>
  );
}

function C4({ b, onCol }: { b: Board; onCol?: (c: number) => void }) {
  return (
    <div className="bd c4">
      {onCol && (
        <div className="c4-drops">
          {Array.from({ length: 7 }, (_, c) => (
            <button key={c} className="drop" disabled={b.cells[c] !== -1} onClick={() => onCol(c)} aria-label={`Drop in column ${c + 1}`}>▼</button>
          ))}
        </div>
      )}
      <div className="c4-grid">
        {b.cells.map((c, i) => (
          <span key={i} className={cls('hole', c >= 0 && `p${c}`, b.line.includes(i) && 'win', b.last.includes(i) && 'last')}
            onClick={() => onCol?.(i % 7)} />
        ))}
      </div>
    </div>
  );
}

function Checkers({ b, slot, onMove }: { b: Board; slot?: number; onMove?: (from: number, to: number) => void }) {
  const [sel, setSel] = useState<number | null>(b.must);
  const movable = onMove && slot != null ? checkerMovable(b, slot) : [];
  const selected = b.must ?? sel;
  const targets = selected != null && onMove ? checkerMoves(b.cells, selected, b.must !== null).map((m) => m.to) : [];
  const tap = (i: number) => {
    if (!onMove) return;
    if (selected != null && targets.includes(i)) { onMove(selected, i); setSel(null); return; }
    if (movable.includes(i)) setSel(i === sel ? null : i);
  };
  return (
    <div className="bd checkers">
      {b.cells.map((p, i) => {
        const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
        return (
          <button key={i} className={cls('sq', dark ? 'dark' : 'light', b.last.includes(i) && 'last', targets.includes(i) && 'target',
            movable.includes(i) && 'movable', selected === i && 'sel')}
            disabled={!onMove || !dark} onClick={() => tap(i)} aria-label={`Square ${i}`}>
            {p > 0 && <span className={cls('pc', `p${owner(p)}`, (p === 2 || p === 4) && 'king')}>{p === 2 || p === 4 ? '♛' : ''}</span>}
          </button>
        );
      })}
    </div>
  );
}

function Mancala({ b, slot, onPit }: { b: Board; slot?: number; onPit?: (i: number) => void }) {
  const pit = (sl: number, i: number) => {
    const idx = pitIndex(sl, i);
    const mine = onPit && sl === slot;
    return (
      <button key={idx} className={cls('pit', `s${sl}`, b.last.includes(idx) && 'last', mine && b.cells[idx] > 0 && 'mine')}
        disabled={!mine || b.cells[idx] === 0} onClick={() => onPit?.(i)} aria-label={`Pit with ${b.cells[idx]} stones`}>
        <span className="n">{b.cells[idx]}</span>
        <span className="stones" aria-hidden="true">{Array.from({ length: Math.min(b.cells[idx], 12) }, (_, k) => <i key={k} />)}</span>
      </button>
    );
  };
  return (
    <div className="bd mancala">
      <div className={cls('store', 's1', b.last.includes(13) && 'last')}><span className="n">{b.cells[storeIndex(1)]}</span></div>
      <div className="row top">{[5, 4, 3, 2, 1, 0].map((i) => pit(1, i))}</div>
      <div className="row bottom">{[0, 1, 2, 3, 4, 5].map((i) => pit(0, i))}</div>
      <div className={cls('store', 's0', b.last.includes(6) && 'last')}><span className="n">{b.cells[storeIndex(0)]}</span></div>
    </div>
  );
}

function BoardView({ game, b, slot, act }: { game: BoardGame; b: Board; slot?: number; act?: (a: Action) => void }) {
  const mine = act && slot != null && b.turn === slot && b.winner === null;
  switch (game) {
    case 'ttt': return <TTT b={b} onCell={mine ? (i) => act!({ type: 'move', slot: slot!, m: i }) : undefined} />;
    case 'c4': return <C4 b={b} onCol={mine ? (c) => act!({ type: 'move', slot: slot!, m: c }) : undefined} />;
    case 'checkers': return <Checkers key={`${b.must}-${b.turn}`} b={b} slot={slot} onMove={mine ? (from, to) => act!({ type: 'move', slot: slot!, m: { from, to } }) : undefined} />;
    case 'mancala': return <Mancala b={b} slot={slot} onPit={mine ? (i) => act!({ type: 'move', slot: slot!, m: i }) : undefined} />;
  }
}

function Scoreboard({ view }: { view: RoomView }) {
  const s = view.state;
  return (
    <div className="scoreboard">
      <span className={cls('sb', 'p0', s.bd?.turn === 0 && s.sub === 'turn' && 'turn')}>{MARK[0]} {playerName(view, 0)} <b>{s.wins[0]}</b></span>
      <span className={cls('sb', 'p1', s.bd?.turn === 1 && s.sub === 'turn' && 'turn')}><b>{s.wins[1]}</b> {playerName(view, 1)} {MARK[1]}</span>
    </div>
  );
}

function outcome(view: RoomView) {
  const w = view.state.bd?.winner;
  if (w === -1) return 'A draw. Perfectly matched.';
  if (w == null) return '';
  return `${playerName(view, w)} wins!`;
}

export function TVBoard({ view }: { view: RoomView }) {
  const s = view.state;
  const act = ACTS[s.act!];
  const b = s.bd!;
  const over = s.sub === 'over';
  return (
    <main className={cls('tv', 'tv-board', `g-${act.board}`)} style={tintStyle(act.tint)}>
      {over && b.winner !== -1 && <Hearts count={14} />}
      <div className="board-side">
        <p className="tv-step">{act.title}</p>
        <Scoreboard view={view} />
        {over ? (
          <h1 className="tv-title pop">{outcome(view)} {b.winner !== -1 && <Burst />}</h1>
        ) : (
          <h1 className="tv-title">{playerName(view, b.turn)}’s turn</h1>
        )}
        <p className="tv-lede note-line" key={s.v}>{over ? 'Play again or pick another game on your phones.' : b.note}</p>
      </div>
      <div className="board-wrap"><BoardView game={act.board!} b={b} /></div>
    </main>
  );
}

export function PhoneBoard({ view, slot, send }: { view: RoomView; slot: number; send: (a: Action) => void }) {
  const s = view.state;
  const act = ACTS[s.act!];
  const b = s.bd!;
  const over = s.sub === 'over';
  const myTurn = !over && b.turn === slot;
  return (
    <main className={cls('phone', 'ph-board', `g-${act.board}`)} style={tintStyle(act.tint)}>
      <Scoreboard view={view} />
      <h1 className="ph-title">
        {over ? outcome(view) : myTurn ? `Your turn ${MARK[slot]}` : `${playerName(view, b.turn)} is thinking…`}
      </h1>
      {!over && <p className="lede">{myTurn ? hint(act.board!, b, slot) : b.note || 'Watch the TV.'}</p>}
      <BoardView game={act.board!} b={b} slot={slot} act={myTurn ? send : undefined} />
      {over && (
        <div className="opts">
          <button className="btn primary wide" onClick={() => send({ type: 'again' })}>Play again</button>
          <button className="btn ghost wide" onClick={() => send({ type: 'menu' })}>Pick another game</button>
        </div>
      )}
    </main>
  );
}

function hint(game: BoardGame, b: Board, slot: number) {
  if (b.note === 'Keep jumping!') return 'You can jump again with the same piece.';
  if (b.note === 'Extra turn!') return 'Your last stone landed in your store. Go again!';
  switch (game) {
    case 'ttt': return 'Tap a square.';
    case 'c4': return 'Tap a column to drop your disc.';
    case 'checkers': return 'Tap one of your glowing pieces, then where it should go.';
    case 'mancala': return `Tap one of your pits (${slot === 0 ? 'bottom' : 'top'} row) to sow its stones.`;
  }
}
