import { ACTS, type ActId, type Activity } from './activities';

export type Phase = 'lobby' | 'menu' | 'rules' | 'write' | 'reveal' | 'mapReveal' | 'draft' | 'end';

export interface GameState {
  v: number;            // version; phone actions carry it so double taps don't double-advance
  phase: Phase;
  act?: ActId;
  round: number;        // bumps each time an activity starts, so answers from earlier rounds don't count
  k: number;            // reveal index
  o: number; i: number; // map reveal: whose world, which category
  d: number;            // draft round
  dsub: 'pick' | 'respond';
}

export const initialState: GameState = { v: 0, phase: 'lobby', round: 0, k: 0, o: 0, i: 0, d: 0, dsub: 'pick' };

export interface Player { slot: number; name: string }
export interface Submitted { slot: number; activity: string; item: number }
export interface Answer { slot: number; item: number; body: { text?: string; r?: number; steal?: boolean; c?: 'a' | 'b' } }
export interface RoomView { code: string; state: GameState; you: 'host' | number; players: Player[]; submitted: Submitted[] }

export type Action =
  | { type: 'choose'; act: ActId }
  | { type: 'start' }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'menu' }
  | { type: 'erase' };

export const normalize = (s: Partial<GameState> | null | undefined): GameState => ({ ...initialState, ...(s || {}) });
export const akey = (s: GameState, suffix = '') => `${s.act}-${s.round}${suffix}`;
const bump = (s: GameState, patch: Partial<GameState>): GameState => ({ ...s, ...patch, v: s.v + 1 });

export function countFor(v: RoomView, key: string, slot: number): number {
  return new Set(v.submitted.filter((x) => x.activity === key && x.slot === slot).map((x) => x.item)).size;
}

export function playerName(v: RoomView, slot: number): string {
  return v.players.find((p) => p.slot === slot)?.name ?? `Player ${slot + 1}`;
}

export function findAnswer(list: Answer[] | undefined, slot: number, item: number): Answer | undefined {
  return list?.find((a) => a.slot === slot && a.item === item);
}

/** Transitions the TV makes on its own when conditions are met. */
export function autoAdvance(v: RoomView): GameState | null {
  const s = v.state;
  if (s.phase === 'lobby' && v.players.length >= 2) return bump(s, { phase: 'menu' });
  if (s.phase === 'write' && s.act) {
    const n = ACTS[s.act].items.length;
    const key = akey(s);
    if (countFor(v, key, 0) >= n && countFor(v, key, 1) >= n) {
      return bump(s, { phase: ACTS[s.act].kind === 'map' ? 'mapReveal' : 'reveal', k: 0, o: 0, i: 0 });
    }
  }
  if (s.phase === 'draft' && s.dsub === 'pick' && s.act) {
    const picked = v.submitted.some((x) => x.activity === akey(s) && x.item === s.d && x.slot === s.d % 2);
    if (picked) return bump(s, { dsub: 'respond' });
  }
  return null;
}

/** Transitions triggered by a phone (or the TV keyboard). Returns null when the action doesn't apply. */
export function reduce(s: GameState, a: Action): GameState | null {
  switch (a.type) {
    case 'choose':
      if (s.phase !== 'menu' && s.phase !== 'end' && s.phase !== 'rules') return null;
      return bump(s, { phase: 'rules', act: a.act, round: s.round + 1, k: 0, o: 0, i: 0, d: 0, dsub: 'pick' });
    case 'menu':
      if (s.phase !== 'end' && s.phase !== 'rules') return null;
      return bump(s, { phase: 'menu' });
    case 'start':
      if (s.phase !== 'rules' || !s.act) return null;
      return bump(s, ACTS[s.act].kind === 'draft' ? { phase: 'draft', d: 0, dsub: 'pick' } : { phase: 'write' });
    case 'next': {
      if (!s.act) return null;
      const n = ACTS[s.act].items.length;
      if (s.phase === 'reveal') return s.k < revealSteps(ACTS[s.act]) - 1 ? bump(s, { k: s.k + 1 }) : bump(s, { phase: 'end' });
      if (s.phase === 'mapReveal') {
        if (s.i < n - 1) return bump(s, { i: s.i + 1 });
        if (s.o === 0) return bump(s, { o: 1, i: 0 });
        return bump(s, { phase: 'end' });
      }
      if (s.phase === 'draft' && s.dsub === 'respond') {
        return s.d < n - 1 ? bump(s, { d: s.d + 1, dsub: 'pick' }) : bump(s, { phase: 'end' });
      }
      return null;
    }
    case 'back': {
      if (!s.act) return null;
      const n = ACTS[s.act].items.length;
      if (s.phase === 'reveal' && s.k > 0) return bump(s, { k: s.k - 1 });
      if (s.phase === 'mapReveal') {
        if (s.i > 0) return bump(s, { i: s.i - 1 });
        if (s.o === 1) return bump(s, { o: 0, i: n - 1 });
      }
      return null;
    }
    default:
      return null;
  }
}

/** Who presents at reveal step k: alternates who goes first on each item. */
export function revealTurn(k: number) {
  const idx = Math.floor(k / 2);
  const presenter = (k + idx) % 2;
  return { idx, presenter, listener: 1 - presenter };
}

/** Number of reveal steps: match games reveal both picks at once; others alternate presenters. */
export function revealSteps(act: Activity) {
  return act.kind === 'match' ? act.items.length : act.items.length * 2;
}
