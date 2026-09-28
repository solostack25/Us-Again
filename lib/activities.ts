export type ActId =
  | 'thisthat' | 'quiz' | 'hits' | 'draft' | 'dreams'
  | 'museum' | 'map' | 'choose' | 'thennow' | 'thanks';
export type Kind = 'private' | 'map' | 'draft' | 'match';
export type Mood = 'light' | 'deep';

export interface Prompt { t: string; h?: string; a?: string; b?: string }
export interface Activity {
  title: string;
  kind: Kind;
  mood: Mood;
  emoji: string;
  tint: string;
  time: string;
  blurb: string;
  items: Prompt[];
  stem?: boolean;
  badge?: string;
}

export const MOODS: { id: Mood; label: string; note: string }[] = [
  { id: 'light', label: 'Light and playful', note: 'Warm-ups, laughs, and the good old days.' },
  { id: 'deep', label: 'Close and tender', note: 'Slower, softer, and a little braver.' },
];

export const ACT_ORDER: ActId[] = ['thisthat', 'quiz', 'hits', 'draft', 'dreams', 'museum', 'map', 'choose', 'thennow', 'thanks'];

const p = (t: string, h?: string): Prompt => ({ t, h });

export const ACTS: Record<ActId, Activity> = {
  // Light and playful
  thisthat: {
    title: 'This or that', kind: 'match', mood: 'light', emoji: '💞', tint: '#E0457B', time: '10 to 15 minutes', badge: 'A good warm-up',
    blurb: 'Eight quick either-or picks, made in secret. See where you match, and hear why when you don’t.',
    items: [
      { t: 'A free Friday night', a: 'Stay in with takeout', b: 'Go somewhere new' },
      { t: 'A perfect morning', a: 'Sleep in together', b: 'Up early for a walk' },
      { t: 'A getaway', a: 'Beach and nothing to do', b: 'A city with a packed plan' },
      { t: 'Dinner tonight', a: 'Cook together', b: 'Someone else cooks for us' },
      { t: 'Celebrating a big win', a: 'A party with everyone', b: 'Just the two of us' },
      { t: 'Getting there', a: 'Road trip, snacks, playlist', b: 'Plane, and we’re there' },
      { t: 'After a hard day, I want', a: 'To talk it through', b: 'Quiet company' },
      { t: 'If we could time travel', a: 'Relive our first year', b: 'Peek five years ahead' },
    ],
  },
  quiz: {
    title: 'Pop quiz: you', kind: 'map', mood: 'light', emoji: '🎯', tint: '#F2A93B', time: '15 to 25 minutes',
    blurb: 'How well do you know the everyday version of each other right now? Guess the small stuff, then get graded.',
    items: [
      '{n}’s go-to comfort food lately', 'The song {n} puts on after a long day', 'What {n} would do with a free afternoon',
      'What {n} orders at our usual spot', 'What’s made {n} laugh hardest recently', 'A small thing that instantly makes {n}’s day better',
      'Something {n} wants but won’t buy for themselves', 'Who {n} would text first with good news',
    ].map((t) => p(t)),
  },
  hits: {
    title: 'Our greatest hits', kind: 'draft', mood: 'light', emoji: '🎶', tint: '#9B7BE0', time: '15 to 25 minutes',
    blurb: 'Take turns naming the classics of your relationship. If your partner names one you both treasure, steal it.',
    items: [
      'Best meal we’ve ever shared', 'Our most “us” inside joke', 'The song that’s ours', 'Best day trip or getaway',
      'Most chaotic moment we laughed about later', 'Coziest night in', 'Best gift either of us gave', 'The time we laughed until we cried',
    ].map((t) => p(t)),
  },
  draft: {
    title: 'Our relationship draft', kind: 'draft', mood: 'light', emoji: '🏆', tint: '#2BA89A', time: '20 to 30 minutes',
    blurb: 'Draft memories into categories like picking a team, from the funniest moments to the hardest thing you survived.',
    items: [
      'Funniest moment', 'Best spontaneous day', 'The moment I felt most loved by you', 'The hardest thing we survived together',
      'Most underrated memory', 'A moment I was really proud of you', 'Something we used to do that I want back',
      'A place I want us to return to', 'Something we haven’t experienced together yet',
    ].map((t) => p(t)),
  },
  dreams: {
    title: 'Dream board', kind: 'private', mood: 'light', emoji: '🌅', tint: '#F26B5B', time: '20 to 30 minutes',
    blurb: 'Each of you pins five hopes for the life ahead, in private. Then reveal them and see where your dreams overlap.',
    items: [
      p('A trip I want us to take', 'Somewhere specific, and what we’d do on the first day.'),
      p('A tradition I want us to start', 'Weekly, yearly, silly or sacred. Anything that becomes ours.'),
      p('Something I want us to learn together', 'A skill, a language, a recipe, a hobby.'),
      p('An ordinary Saturday, five years from now', 'Walk through it, starting from the morning.'),
      p('Something I want us to build together', 'A home, a garden, a business, a family habit.'),
    ],
  },

  // Close and tender
  museum: {
    title: 'The Museum of Us', kind: 'private', mood: 'deep', emoji: '🖼️', tint: '#E0457B', time: '30 to 45 minutes', badge: 'A lovely first deep one',
    blurb: 'Each of you privately curates five exhibits about your relationship. Then you take turns giving the tour.',
    items: [
      p('The moment I realized you were different', 'One specific memory. It doesn’t have to be when you knew you loved them.'),
      p('A tiny moment nobody else would understand', 'Something that looks insignificant from the outside but means something to you.'),
      p('A version of you I miss', 'Keep it affectionate. “I miss the version of you who used to…”'),
      p('Something about you I hope never changes', 'A trait, a habit, an expression, the way they treat people.'),
      p('An exhibit from our future', 'Five or ten years from now, what photo, object or memory is on display from the life you built?'),
    ],
  },
  map: {
    title: 'Build my current world', kind: 'map', mood: 'deep', emoji: '🗺️', tint: '#4A9FE0', time: '25 to 40 minutes',
    blurb: 'Each of you maps what you think fills the other’s mind right now. Then the person being mapped says what you got right and what you missed.',
    items: [
      'What {n} is worried about', 'What {n} is looking forward to', 'What is exhausting {n}', 'What {n} wishes people understood',
      'What {n} needs more of', 'What {n} misses', 'What {n} is proud of', 'What {n} is quietly hoping changes',
    ].map((t) => p(t)),
  },
  choose: {
    title: 'I’d choose you here', kind: 'private', mood: 'deep', emoji: '🤍', tint: '#9B7BE0', stem: true, time: '20 to 30 minutes',
    blurb: 'Five unfinished sentences, answered separately and read aloud together. A quiet way to find what’s still worth protecting.',
    items: [
      p('If we met for the first time today, I think I would notice…'),
      p('If I could relive one ordinary day with you, I would choose…'),
      p('If someone asked me what people misunderstand about you, I would tell them…'),
      p('If everything external disappeared (jobs, money, responsibilities, stress), the part of us I would want to keep is…'),
      p('If our relationship entered a new chapter tomorrow, something from our old chapter I would insist we bring is…'),
    ],
  },
  thennow: {
    title: 'Then and now', kind: 'private', mood: 'deep', emoji: '⏳', tint: '#2BA89A', time: '20 to 30 minutes',
    blurb: 'Look at how you’ve grown, together and apart. Answer five prompts privately, then trade them.',
    items: [
      p('Something you did early on that made me feel chosen'),
      p('Something you do now that I don’t thank you for enough'),
      p('How you’ve grown since we met', 'Be specific. Name a moment you noticed it.'),
      p('How I think I’ve grown because of you'),
      p('Something from back then I’d love to bring back', 'Keep it warm, not a complaint.'),
    ],
  },
  thanks: {
    title: 'Notes I never sent', kind: 'private', mood: 'deep', emoji: '💌', tint: '#F26B5B', stem: true, time: '15 to 25 minutes',
    blurb: 'Five unfinished sentences of gratitude. Write them quietly, then read them to each other.',
    items: [
      p('Thank you for the time you…'),
      p('I never told you how much it meant when you…'),
      p('I notice when you…'),
      p('I’m proud of the way you…'),
      p('I don’t say it enough, but…'),
    ],
  },
};

export const RULES = {
  base: ['Put other phones away. Only these two are in play.', 'Nothing said here becomes ammunition later.'],
  private: 'When it’s your turn to listen, don’t correct, explain, defend or argue about details. Only ask questions like the ones on your phone.',
  map: 'When your answers are being guessed, don’t say “that’s wrong.” Say what they got right, what’s close, and what they didn’t know.',
  draft: 'If your partner drafts a memory you had too, you can steal it. Arguing about the details is half the fun.',
  match: 'Pick fast, explain slow. When you don’t match, get curious about why instead of convincing each other.',
} as const;

export const LISTEN = ['Tell me more about that.', 'What did that mean to you?', 'I didn’t realize you remembered that.'];
export const MAPR = ['You got this right', 'You’re close on this', 'Here’s something you didn’t know'];

export function itemText(act: Activity, idx: number, aboutName: string): string {
  return act.items[idx].t.replace('{n}', aboutName);
}
