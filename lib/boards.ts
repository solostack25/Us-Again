// Pure rules for the classic board games. Player slots are 0 and 1.

export type BoardGame = 'ttt' | 'c4' | 'checkers' | 'mancala';
export type Move = number | { from: number; to: number };

export interface Board {
  cells: number[];      // game-specific encoding, see each game
  turn: number;         // whose move it is
  winner: number | null; // 0 or 1, -1 for a draw, null while playing
  line: number[];       // winning cells to highlight
  last: number[];       // cells touched by the last move
  must: number | null;  // checkers: piece that must keep jumping
  note: string;         // short event text ("Extra turn!", "Capture!")
}

const base = (cells: number[], turn: number): Board => ({ cells, turn, winner: null, line: [], last: [], must: null, note: '' });

export function initBoard(game: BoardGame, first: number): Board {
  switch (game) {
    case 'ttt': return base(Array(9).fill(-1), first);
    case 'c4': return base(Array(42).fill(-1), first);
    case 'mancala': return base([4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0], first);
    case 'checkers': {
      // 0 empty, 1 slot-0 man, 2 slot-0 king, 3 slot-1 man, 4 slot-1 king. Slot 0 starts at the bottom.
      const cells = Array(64).fill(0);
      for (let i = 0; i < 64; i++) {
        const r = Math.floor(i / 8), c = i % 8;
        if ((r + c) % 2 === 1) { if (r < 3) cells[i] = 3; else if (r > 4) cells[i] = 1; }
      }
      return base(cells, first);
    }
  }
}

/** Applies a move for `slot`. Returns the new board, or null if the move isn't legal. */
export function play(game: BoardGame, b: Board, slot: number, m: Move): Board | null {
  if (b.winner !== null || b.turn !== slot) return null;
  switch (game) {
    case 'ttt': return typeof m === 'number' ? ttt(b, slot, m) : null;
    case 'c4': return typeof m === 'number' ? c4(b, slot, m) : null;
    case 'mancala': return typeof m === 'number' ? mancala(b, slot, m) : null;
    case 'checkers': return typeof m === 'object' ? checkers(b, slot, m) : null;
  }
}

// ---------- Tic-tac-toe: cells hold -1 or a slot ----------
const TTT_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
function ttt(b: Board, slot: number, i: number): Board | null {
  if (i < 0 || i > 8 || b.cells[i] !== -1) return null;
  const cells = b.cells.slice(); cells[i] = slot;
  const line = TTT_LINES.find((l) => l.every((j) => cells[j] === slot));
  const full = cells.every((c) => c !== -1);
  return { ...b, cells, last: [i], note: '', line: line ?? [], winner: line ? slot : full ? -1 : null, turn: 1 - slot };
}

// ---------- Connect Four: 7 columns x 6 rows, index = row * 7 + col, row 0 at the top ----------
function c4(b: Board, slot: number, col: number): Board | null {
  if (col < 0 || col > 6) return null;
  let row = -1;
  for (let r = 5; r >= 0; r--) if (b.cells[r * 7 + col] === -1) { row = r; break; }
  if (row < 0) return null;
  const cells = b.cells.slice(); const at = row * 7 + col; cells[at] = slot;
  const line = c4Line(cells, row, col, slot);
  const full = cells.every((c) => c !== -1);
  return { ...b, cells, last: [at], note: '', line, winner: line.length ? slot : full ? -1 : null, turn: 1 - slot };
}
function c4Line(cells: number[], row: number, col: number, slot: number): number[] {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const run = [row * 7 + col];
    for (const sgn of [1, -1]) {
      let r = row + dr * sgn, c = col + dc * sgn;
      while (r >= 0 && r < 6 && c >= 0 && c < 7 && cells[r * 7 + c] === slot) { run.push(r * 7 + c); r += dr * sgn; c += dc * sgn; }
    }
    if (run.length >= 4) return run;
  }
  return [];
}

// ---------- Mancala (Kalah): 0-5 slot 0 pits, 6 slot 0 store, 7-12 slot 1 pits, 13 slot 1 store ----------
export const pitIndex = (slot: number, i: number) => (slot === 0 ? i : 7 + i);
export const storeIndex = (slot: number) => (slot === 0 ? 6 : 13);
function mancala(b: Board, slot: number, i: number): Board | null {
  if (i < 0 || i > 5) return null;
  const start = pitIndex(slot, i);
  const cells = b.cells.slice();
  let seeds = cells[start];
  if (!seeds) return null;
  cells[start] = 0;
  let at = start;
  const touched = [start];
  while (seeds > 0) {
    at = (at + 1) % 14;
    if (at === storeIndex(1 - slot)) continue;
    cells[at]++; seeds--; touched.push(at);
  }
  let note = '';
  let turn = 1 - slot;
  const mine = slot === 0 ? at >= 0 && at <= 5 : at >= 7 && at <= 12;
  if (at === storeIndex(slot)) { turn = slot; note = 'Extra turn!'; }
  else if (mine && cells[at] === 1 && cells[12 - at] > 0) {
    cells[storeIndex(slot)] += cells[12 - at] + 1;
    touched.push(12 - at);
    cells[at] = 0; cells[12 - at] = 0;
    note = 'Capture!';
  }
  const side = (sl: number) => [0, 1, 2, 3, 4, 5].reduce((sum, k) => sum + cells[pitIndex(sl, k)], 0);
  let winner: number | null = null;
  if (side(0) === 0 || side(1) === 0) {
    for (const sl of [0, 1]) for (let k = 0; k < 6; k++) { cells[storeIndex(sl)] += cells[pitIndex(sl, k)]; cells[pitIndex(sl, k)] = 0; }
    winner = cells[6] === cells[13] ? -1 : cells[6] > cells[13] ? 0 : 1;
  }
  return { ...b, cells, last: touched, note, line: [], winner, turn: winner === null ? turn : b.turn };
}

// ---------- Checkers (American rules; captures optional, multi-jumps continue) ----------
export const owner = (p: number) => (p === 1 || p === 2 ? 0 : p === 3 || p === 4 ? 1 : -1);
const isKing = (p: number) => p === 2 || p === 4;
function dirs(p: number): [number, number][] {
  if (isKing(p)) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  return owner(p) === 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
}
/** Legal destinations for the piece at `from`, and whether each is a jump. */
export function checkerMoves(cells: number[], from: number, jumpsOnly = false): { to: number; jump: number | null }[] {
  const p = cells[from]; if (!p) return [];
  const r = Math.floor(from / 8), c = from % 8, out: { to: number; jump: number | null }[] = [];
  for (const [dr, dc] of dirs(p)) {
    const r1 = r + dr, c1 = c + dc, r2 = r + 2 * dr, c2 = c + 2 * dc;
    if (r1 < 0 || r1 > 7 || c1 < 0 || c1 > 7) continue;
    const mid = r1 * 8 + c1;
    if (!cells[mid]) { if (!jumpsOnly) out.push({ to: mid, jump: null }); continue; }
    if (owner(cells[mid]) !== owner(p) && r2 >= 0 && r2 <= 7 && c2 >= 0 && c2 <= 7 && !cells[r2 * 8 + c2]) out.push({ to: r2 * 8 + c2, jump: mid });
  }
  return out;
}
export function checkerMovable(b: Board, slot: number): number[] {
  if (b.must !== null) return [b.must];
  return b.cells.map((p, i) => (owner(p) === slot && checkerMoves(b.cells, i).length ? i : -1)).filter((i) => i >= 0);
}
function checkers(b: Board, slot: number, m: { from: number; to: number }): Board | null {
  if (owner(b.cells[m.from]) !== slot) return null;
  if (b.must !== null && m.from !== b.must) return null;
  const mv = checkerMoves(b.cells, m.from, b.must !== null).find((x) => x.to === m.to);
  if (!mv) return null;
  const cells = b.cells.slice();
  let p = cells[m.from];
  cells[m.from] = 0;
  if (mv.jump !== null) cells[mv.jump] = 0;
  const row = Math.floor(m.to / 8);
  let crowned = false;
  if (p === 1 && row === 0) { p = 2; crowned = true; }
  if (p === 3 && row === 7) { p = 4; crowned = true; }
  cells[m.to] = p;
  const again = mv.jump !== null && !crowned && checkerMoves(cells, m.to, true).length > 0;
  const next: Board = {
    ...b, cells, line: [], last: [m.from, m.to, ...(mv.jump !== null ? [mv.jump] : [])],
    must: again ? m.to : null, turn: again ? slot : 1 - slot,
    note: crowned ? 'Crowned!' : again ? 'Keep jumping!' : mv.jump !== null ? 'Capture!' : '',
  };
  if (!again) {
    const opp = 1 - slot;
    const oppCanMove = next.cells.some((q, i) => owner(q) === opp && checkerMoves(next.cells, i).length > 0);
    if (!oppCanMove) next.winner = slot;
  }
  return next;
}
