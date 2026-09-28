import {
  ACTS, DOODLE_PROMPTS, DOODLE_ROUNDS, MELD_SEEDS, SPECTRUMS, STORY_LINES, STORY_OPENERS, TUNE_ROUNDS,
  type ActId, type Activity,
} from './activities';

export type Phase = 'lobby' | 'menu' | 'rules' | 'write' | 'reveal' | 'mapReveal' | 'draft' | 'play' | 'end';

export interface BeatScore { a: number; b: number; sync: number }

export interface GameState {
  v: number;            // version; phone actions carry it so double taps don't double-advance
  phase: Phase;
  act?: ActId;
  round: number;        // bumps each time an activity starts, so answers from earlier rounds don't count
  k: number;            // reveal index
  o: number; i: number; // map reveal / truths: whose turn, which item
  d: number;            // draft round
  dsub: 'pick' | 'respond';
  // live games
  r: number;            // round within a live game
  sub: string;          // step within a live game
  seed: number;         // random pick into a content list
  target: number;       // tuned in: secret spot 0-100
  prev: string;         // story: the only line the next writer may see
  res: boolean[];       // doodle: whether each drawing was guessed
  pts: number[];        // tuned in: points per round
  beat?: BeatScore;
}

export const initialState: GameState = {
  v: 0, phase: 'lobby', round: 0, k: 0, o: 0, i: 0, d: 0, dsub: 'pick',
  r: 0, sub: '', seed: 0, target: 50, prev: '', res: [], pts: [],
};

export interface Player { slot: number; name: string }
export interface Submitted { slot: number; activity: string; item: number }
export interface Body {
  text?: string; r?: number; steal?: boolean; c?: 'a' | 'b';
  s?: string[]; f?: number;  // truths: statements and which is fake
  g?: number;                // truths: guessed index
  img?: string;              // drawing as data URL
  v?: number;                // tuned in: dial value
}
export interface Answer { slot: number; item: number; body: Body }
export type AnswerMap = Record<string, Answer[]>;
export interface RoomView { code: string; state: GameState; you: 'host' | number; players: Player[]; submitted: Submitted[] }

export type Action =
  | { type: 'choose'; act: ActId }
  | { type: 'start' }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'menu' }
  | { type: 'erase' }
  | { type: 'result'; ok: boolean } // doodle: guessed or not
  | { type: 'go' }                  // heartbeat: start countdown
  | { type: 'again' };              // replay a short game

export const normalize = (s: Partial<GameState> | null | undefined): GameState => ({ ...initialState, ...(s || {}) });
export const akey = (s: GameState, suffix = '') => `${s.act}-${s.round}${suffix}`;
const bump = (s: GameState, patch: Partial<GameState>): GameState => ({ ...s, ...patch, v: s.v + 1 });
const rand = (n: number) => Math.floor(Math.random() * n);
const randTarget = () => 5 + rand(91);

export function countFor(v: RoomView, key: string, slot: number): number {
  return new Set(v.submitted.filter((x) => x.activity === key && x.slot === slot).map((x) => x.item)).size;
}
const has = (v: RoomView, key: string, slot: number, item: number) =>
  v.submitted.some((x) => x.activity === key && x.slot === slot && x.item === item);

export function playerName(v: RoomView, slot: number): string {
  return v.players.find((p) => p.slot === slot)?.name ?? `Player ${slot + 1}`;
}

export function findAnswer(list: Answer[] | undefined, slot: number, item: number): Answer | undefined {
  return list?.find((a) => a.slot === slot && a.item === item);
}

// ---- helpers for specific games ----
export const meldSeed = (s: GameState) => MELD_SEEDS[s.seed % MELD_SEEDS.length];
export const cleanWord = (w?: string) => (w || '').trim().toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ');
export function meldMatched(s: GameState, ans: AnswerMap, r = s.r) {
  const a = cleanWord(findAnswer(ans[akey(s)], 0, r)?.body.text);
  return !!a && a === cleanWord(findAnswer(ans[akey(s)], 1, r)?.body.text);
}
export const storyOpener = (s: GameState) => STORY_OPENERS[s.seed % STORY_OPENERS.length];
export const doodlePrompt = (s: GameState, r = s.r) => DOODLE_PROMPTS[(s.seed + r) % DOODLE_PROMPTS.length];
export const spectrum = (s: GameState, r = s.r) => SPECTRUMS[(s.seed + r) % SPECTRUMS.length];
export function tunePoints(target: number, v: number) {
  const d = Math.abs(target - v);
  return d <= 4 ? 4 : d <= 9 ? 3 : d <= 14 ? 2 : d <= 20 ? 1 : 0;
}
/** How in sync two tap streams are, from 0 to 100. Times are arrival times at the TV, in ms. */
export function beatScore(a: number[], b: number[]): BeatScore {
  const used = new Set<number>();
  let pairs = 0;
  for (const t of a) {
    let best = -1, bestD = 221;
    b.forEach((u, j) => { const d = Math.abs(t - u); if (!used.has(j) && d < bestD) { best = j; bestD = d; } });
    if (best >= 0) { used.add(best); pairs++; }
  }
  const total = a.length + b.length;
  return { a: a.length, b: b.length, sync: total ? Math.round((200 * pairs) / total) : 0 };
}

/** Number of reveal steps: match games reveal both picks at once; others alternate presenters. */
export function revealSteps(act: Activity) {
  return act.kind === 'match' ? act.items.length : act.items.length * 2;
}

function startState(s: GameState, act: Activity): GameState {
  switch (act.kind) {
    case 'draft': return bump(s, { phase: 'draft', d: 0, dsub: 'pick' });
    case 'meld': return bump(s, { phase: 'play', sub: 'write', r: 0, seed: rand(MELD_SEEDS.length) });
    case 'story': return bump(s, { phase: 'play', sub: 'write', r: 0, seed: rand(STORY_OPENERS.length), prev: '' });
    case 'portrait': return bump(s, { phase: 'play', sub: 'draw', r: 0 });
    case 'doodle': return bump(s, { phase: 'play', sub: 'draw', r: 0, seed: rand(DOODLE_PROMPTS.length), res: [] });
    case 'tune': return bump(s, { phase: 'play', sub: 'clue', r: 0, seed: rand(SPECTRUMS.length), target: randTarget(), pts: [] });
    case 'beat': return bump(s, { phase: 'play', sub: 'ready', r: 0, beat: undefined });
    default: return bump(s, { phase: 'write' });
  }
}

/** Transitions the TV makes on its own when conditions are met. */
export function autoAdvance(v: RoomView, ans: AnswerMap): GameState | null {
  const s = v.state;
  if (s.phase === 'lobby' && v.players.length >= 2) return bump(s, { phase: 'menu' });
  if (!s.act) return null;
  const act = ACTS[s.act];
  const key = akey(s);

  if (s.phase === 'write') {
    const n = act.items.length;
    if (countFor(v, key, 0) >= n && countFor(v, key, 1) >= n) {
      if (act.kind === 'truths') return bump(s, { phase: 'play', sub: 'guess', o: 0 });
      return bump(s, { phase: act.kind === 'map' ? 'mapReveal' : 'reveal', k: 0, o: 0, i: 0 });
    }
    return null;
  }
  if (s.phase === 'draft' && s.dsub === 'pick') {
    return has(v, key, s.d % 2, s.d) ? bump(s, { dsub: 'respond' }) : null;
  }
  if (s.phase !== 'play') return null;

  switch (act.kind) {
    case 'meld':
      return s.sub === 'write' && has(v, key, 0, s.r) && has(v, key, 1, s.r) ? bump(s, { sub: 'show' }) : null;
    case 'truths':
      return s.sub === 'guess' && has(v, akey(s, '-g'), 1 - s.o, s.o) ? bump(s, { sub: 'show' }) : null;
    case 'story': {
      if (s.sub !== 'write' || !has(v, key, s.r % 2, s.r)) return null;
      const line = findAnswer(ans[key], s.r % 2, s.r)?.body.text;
      if (line == null) return null; // wait until the TV has loaded it
      return s.r < STORY_LINES - 1 ? bump(s, { r: s.r + 1, prev: line }) : bump(s, { phase: 'end', prev: '' });
    }
    case 'portrait':
      return s.sub === 'draw' && has(v, key, 0, 0) && has(v, key, 1, 0) ? bump(s, { sub: 'show' }) : null;
    case 'tune':
      if (s.sub === 'clue' && has(v, akey(s, '-c'), s.r % 2, s.r)) return bump(s, { sub: 'guess' });
      if (s.sub === 'guess' && has(v, akey(s, '-g'), 1 - (s.r % 2), s.r)) {
        const g = findAnswer(ans[akey(s, '-g')], 1 - (s.r % 2), s.r)?.body.v;
        if (g == null) return null; // wait until the TV has loaded it
        return bump(s, { sub: 'show', pts: [...s.pts.slice(0, s.r), tunePoints(s.target, g)] });
      }
      return null;
    default:
      return null;
  }
}

/** Transitions triggered by a phone (or the TV keyboard). Returns null when the action doesn't apply. */
export function reduce(s: GameState, a: Action, ans: AnswerMap = {}): GameState | null {
  switch (a.type) {
    case 'choose':
      if (s.phase !== 'menu' && s.phase !== 'end' && s.phase !== 'rules') return null;
      return bump(s, { ...initialState, v: s.v, phase: 'rules', act: a.act, round: s.round + 1 });
    case 'menu':
      if (s.phase !== 'end' && s.phase !== 'rules') return null;
      return bump(s, { phase: 'menu' });
    case 'start':
      if (s.phase !== 'rules' || !s.act) return null;
      return startState(s, ACTS[s.act]);
    case 'again':
      if (!s.act || (s.phase !== 'end' && s.phase !== 'play')) return null;
      return startState(bump(s, { round: s.round + 1 }), ACTS[s.act]);
    case 'go':
      return s.phase === 'play' && s.act === 'beat' && s.sub === 'ready' ? bump(s, { sub: 'count' }) : null;
    case 'result':
      if (s.phase !== 'play' || s.act !== 'doodle' || s.sub !== 'draw') return null;
      return bump(s, { sub: 'show', res: [...s.res.slice(0, s.r), a.ok] });
    case 'next': {
      if (!s.act) return null;
      const act = ACTS[s.act];
      const n = act.items.length;
      if (s.phase === 'reveal') return s.k < revealSteps(act) - 1 ? bump(s, { k: s.k + 1 }) : bump(s, { phase: 'end' });
      if (s.phase === 'mapReveal') {
        if (s.i < n - 1) return bump(s, { i: s.i + 1 });
        if (s.o === 0) return bump(s, { o: 1, i: 0 });
        return bump(s, { phase: 'end' });
      }
      if (s.phase === 'draft' && s.dsub === 'respond') {
        return s.d < n - 1 ? bump(s, { d: s.d + 1, dsub: 'pick' }) : bump(s, { phase: 'end' });
      }
      if (s.phase !== 'play' || s.sub !== 'show') return null;
      switch (act.kind) {
        case 'meld': return meldMatched(s, ans) || s.r >= 9 ? bump(s, { phase: 'end' }) : bump(s, { r: s.r + 1, sub: 'write' });
        case 'truths': return s.o === 0 ? bump(s, { o: 1, sub: 'guess' }) : bump(s, { phase: 'end' });
        case 'portrait': return bump(s, { phase: 'end' });
        case 'doodle': return s.r < DOODLE_ROUNDS - 1 ? bump(s, { r: s.r + 1, sub: 'draw' }) : bump(s, { phase: 'end' });
        case 'tune': return s.r < TUNE_ROUNDS - 1 ? bump(s, { r: s.r + 1, sub: 'clue', target: randTarget() }) : bump(s, { phase: 'end' });
        case 'beat': return bump(s, { phase: 'end' });
        default: return null;
      }
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
