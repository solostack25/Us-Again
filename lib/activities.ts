export type ActId = 'museum' | 'map' | 'draft' | 'choose';
export type Kind = 'private' | 'map' | 'draft';

export interface Prompt { t: string; h?: string }
export interface Activity {
  title: string;
  kind: Kind;
  time: string;
  blurb: string;
  items: Prompt[];
  stem?: boolean;
  first?: boolean;
}

export const ACT_ORDER: ActId[] = ['museum', 'map', 'draft', 'choose'];

export const ACTS: Record<ActId, Activity> = {
  museum: {
    title: 'The Museum of Us', kind: 'private', time: '30 to 45 minutes', first: true,
    blurb: 'Each of you privately curates five exhibits about your relationship. Then you take turns giving the tour.',
    items: [
      { t: 'The moment I realized you were different', h: 'One specific memory. It doesn’t have to be when you knew you loved them.' },
      { t: 'A tiny moment nobody else would understand', h: 'Something that looks insignificant from the outside but means something to you.' },
      { t: 'A version of you I miss', h: 'Keep it affectionate. “I miss the version of you who used to…”' },
      { t: 'Something about you I hope never changes', h: 'A trait, a habit, an expression, the way they treat people.' },
      { t: 'An exhibit from our future', h: 'Five or ten years from now, what photo, object or memory is on display from the life you built?' },
    ],
  },
  map: {
    title: 'Build my current world', kind: 'map', time: '25 to 40 minutes',
    blurb: 'Each of you maps what you think fills the other’s mind right now. Then the person being mapped says what you got right and what you missed.',
    items: [
      'What {n} is worried about', 'What {n} is looking forward to', 'What is exhausting {n}', 'What {n} wishes people understood',
      'What {n} needs more of', 'What {n} misses', 'What {n} is proud of', 'What {n} is quietly hoping changes',
    ].map((t) => ({ t })),
  },
  draft: {
    title: 'Our relationship draft', kind: 'draft', time: '20 to 30 minutes',
    blurb: 'Take turns drafting memories into categories, like picking a team. If your partner picks a memory you had too, steal it.',
    items: [
      'Funniest moment', 'Best spontaneous day', 'The moment I felt most loved by you', 'The hardest thing we survived together',
      'Most underrated memory', 'A moment I was really proud of you', 'Something we used to do that I want back',
      'A place I want us to return to', 'Something we haven’t experienced together yet',
    ].map((t) => ({ t })),
  },
  choose: {
    title: 'I’d choose you here', kind: 'private', stem: true, time: '20 to 30 minutes',
    blurb: 'Five unfinished sentences, answered separately and read aloud together. A quiet way to find what’s still worth protecting.',
    items: [
      { t: 'If we met for the first time today, I think I would notice…' },
      { t: 'If I could relive one ordinary day with you, I would choose…' },
      { t: 'If someone asked me what people misunderstand about you, I would tell them…' },
      { t: 'If everything external disappeared (jobs, money, responsibilities, stress), the part of us I would want to keep is…' },
      { t: 'If our relationship entered a new chapter tomorrow, something from our old chapter I would insist we bring is…' },
    ],
  },
};

export const RULES = {
  base: ['Put other phones away. Only these two are in play.', 'Nothing said here becomes ammunition later.'],
  private: 'When it’s your turn to listen, don’t correct, explain, defend or argue about details. Only ask questions like the ones on your phone.',
  map: 'When your world is being shown, don’t say “that’s wrong.” Say what they got right, what’s close, and what they didn’t know.',
  draft: 'If your partner drafts a memory you had too, you can steal it. Arguing about the details is half the fun.',
} as const;

export const LISTEN = ['Tell me more about that.', 'What did that mean to you?', 'I didn’t realize you remembered that.'];
export const MAPR = ['You got this right', 'You’re close on this', 'Here’s something you didn’t know'];

export function itemText(act: Activity, idx: number, aboutName: string): string {
  return act.items[idx].t.replace('{n}', aboutName);
}
