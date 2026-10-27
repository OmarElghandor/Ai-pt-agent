import type { Block } from '@/lib/v2/content/blocks';
import type { Item } from '@/lib/v2/content/items';
import type { Question } from '@/lib/v2/content/lesson';
import type { Page } from '@/lib/v2/content/page';

export const FIXTURE_ITEMS: Item[] = [
  {
    type: 'sentence',
    id: 'sentence.ola',
    tl: 'Olá.',
    ar: 'أهلاً.',
    say: 'أولا',
    marks: [{ text: 'Olá', group: 'a' }],
  },
  {
    type: 'sentence',
    id: 'sentence.tchau',
    tl: 'Tchau.',
    ar: 'باي.',
    speaker: 'Inês',
  },
  {
    type: 'phrase',
    id: 'phrase.bom-dia',
    tl: 'Bom dia.',
    ar: 'صباح الخير.',
    context_eg: 'أول ما تشوف حد الصبح.',
    cloze: 'dia',
  },
  {
    type: 'word',
    id: 'word.casa',
    tl: 'casa',
    ar: 'بيت',
  },
  {
    type: 'word',
    id: 'word.cafe',
    tl: 'café',
    ar: 'قهوة',
  },
  {
    type: 'pattern',
    id: 'pattern.queria',
    slots: [{ tl: 'Queria' }, { name_eg: 'حاجة', group: 'verb', kind: 'word' }],
    examples: ['sentence.queria-cafe'],
  },
  {
    type: 'sentence',
    id: 'sentence.queria-cafe',
    tl: 'Queria um café.',
    ar: 'عايز قهوة.',
  },
];

export const FIXTURE_QUESTION: Question = {
  id: 'q.fix.1',
  type: 'gap',
  skill: 'writing',
  prompt: {
    sentence: [{ text: 'Eu ___ português.', lang: 'tl' }],
    meaning: [{ text: 'أنا بتكلم برتغالي.', lang: 'ar' }],
  },
  options: [
    [{ text: 'falo', lang: 'tl' }],
    [{ text: 'fala', lang: 'tl' }],
  ],
  answer: 0,
  feedback_eg: [{ text: 'eu بياخد o.', lang: 'eg' }],
  why_wrong_eg: [null, [{ text: 'fala لـ ele.', lang: 'eg' }]],
};

const eg = (text: string) => [{ text, lang: 'eg' as const }];
const tl = (text: string) => [{ text, lang: 'tl' as const }];

export const FIXTURE_BLOCKS: { label: string; block: Block }[] = [
  { label: 'heading', block: { id: 'h1', type: 'heading', text: eg('عنوان الصفحة') } },
  {
    label: 'cards',
    block: { id: 'cards1', type: 'cards', cols: 2, numbered: true, items: ['word.casa', 'word.cafe'] },
  },
  {
    label: 'table',
    block: {
      id: 'table1',
      type: 'table',
      split_endings: true,
      cols: [
        { label: tl('ESTAR'), group: 'b' },
        { label: tl('-AR'), group: 'c' },
      ],
      rows: [{ label: tl('eu'), media: { image: 'person.eu' } }],
      cells: [[{ ref: 'verb.estar:pres:eu' }, { ref: 'verb.falar:pres:eu' }]],
    },
  },
  {
    label: 'compare',
    block: {
      id: 'cmp1',
      type: 'compare',
      columns: [
        {
          head: tl('SER'),
          sub: eg('ثابت'),
          group: 'a',
          entries: [
            { label: eg('تحية'), ref: 'sentence.ola' },
            { label: eg('تاني'), ref: 'sentence.tchau' },
          ],
        },
        {
          head: tl('ESTAR'),
          sub: eg('مؤقت'),
          group: 'b',
          entries: [{ label: eg('صباح'), ref: 'phrase.bom-dia' }],
        },
      ],
    },
  },
  {
    label: 'vs_pairs',
    block: {
      id: 'vs1',
      type: 'vs_pairs',
      pairs: [{ left: 'sentence.ola', right: 'sentence.tchau', note: eg('تحية ووداع') }],
    },
  },
  {
    label: 'formula',
    block: { id: 'f1', type: 'formula', pattern: 'pattern.queria', examples: ['sentence.queria-cafe'] },
  },
  {
    label: 'examples',
    block: { id: 'ex1', type: 'examples', items: [{ ref: 'sentence.queria-cafe', media: { icon: 'cafe' } }] },
  },
  {
    label: 'tip',
    block: { id: 'tip1', type: 'tip', kind: 'rule', title: eg('قاعدة'), body: eg('لو هيتغير بكره، يبقى ESTAR.') },
  },
  {
    label: 'rules_list',
    block: { id: 'rules1', type: 'rules_list', items: [eg('ثابت: SER'), eg('مؤقت: ESTAR')] },
  },
  {
    label: 'dialogue',
    block: {
      id: 'dlg1',
      type: 'dialogue',
      lines: [
        { speaker: 'Inês', tl: 'Olá.', ar: 'أهلاً.', ids: ['sentence.ola'] },
        { speaker: 'Inês', tl: 'Tchau.', ar: 'باي.', ids: ['sentence.tchau'] },
      ],
    },
  },
  {
    label: 'scene',
    block: {
      id: 'scene1',
      type: 'scene',
      image: 'cafe.counter',
      hotspots: [{ x: 20, y: 40, ref: 'word.cafe' }],
    },
  },
  {
    label: 'panel',
    block: { id: 'panel1', type: 'panel', image: 'person.ines', lines: ['sentence.ola'] },
  },
  {
    label: 'timeline',
    block: {
      id: 'time1',
      type: 'timeline',
      points: [
        { at: 'past', ref: 'sentence.tchau', label: eg('قبل') },
        { at: 'now', ref: 'sentence.ola' },
        { at: 'future', ref: 'phrase.bom-dia' },
      ],
    },
  },
  {
    label: 'practice',
    block: { id: 'prac1', type: 'practice', questions: ['q.fix.1'] },
  },
];

export const EXPLORE_FIXTURE: Page = {
  id: 'fix-explore',
  preset: 'conjugation',
  mode: 'explore',
  pill: 'التصريف',
  title: tl('النهايات'),
  subtitle: eg('اختار شخص، وبعدين غيّر فعل الـ -ar'),
  blocks: [
    {
      id: 'b1',
      type: 'table',
      split_endings: true,
      cols: [
        { label: tl('-AR'), group: 'c' },
        { label: tl('-ER'), group: 'm' },
        { label: tl('-IR'), group: 'b' },
      ],
      rows: [
        { label: tl('eu') },
        { label: tl('tu') },
        { label: tl('ele') },
      ],
      cells: [
        [
          { ref: 'verb.falar:pres:eu' },
          { ref: 'verb.comer:pres:eu' },
          { ref: 'verb.partir:pres:eu' },
        ],
        [
          { ref: 'verb.falar:pres:tu' },
          { ref: 'verb.comer:pres:tu' },
          { ref: 'verb.partir:pres:tu' },
        ],
        [
          { ref: 'verb.falar:pres:ele' },
          { ref: 'verb.comer:pres:ele' },
          { ref: 'verb.partir:pres:ele' },
        ],
      ],
    },
    {
      id: 'b2',
      type: 'tip',
      kind: 'rule',
      title: eg('بعد ما تشوف كل الأشخاص'),
      body: eg('النهاية بتتغير مع الشخص.'),
    },
  ],
  controls: [
    {
      id: 'c1',
      type: 'reveal_axis',
      target: 'b1',
      axis: 'rows',
      tips: [
        [{ text: 'eu', lang: 'tl', bold: true }, { text: ' بياخد o.', lang: 'eg' }],
        [{ text: 'tu', lang: 'tl', bold: true }, { text: ' آخرها s.', lang: 'eg' }],
        [{ text: 'ele', lang: 'tl', bold: true }, { text: ' من غير s.', lang: 'eg' }],
      ],
    },
    {
      id: 'c2',
      type: 'swap',
      target: 'b1/col:0',
      options: ['falar', 'morar', 'chegar'],
    },
  ],
  locked_until: [{ control: 'c1', blocks: ['b2'] }],
};

export const FIXTURE_VERB_IDS = [
  'verb.estar:pres:eu',
  'verb.falar:pres:eu',
  'verb.falar:pres:tu',
  'verb.falar:pres:ele',
  'verb.comer:pres:eu',
  'verb.comer:pres:tu',
  'verb.comer:pres:ele',
  'verb.partir:pres:eu',
  'verb.partir:pres:tu',
  'verb.partir:pres:ele',
  'verb.morar:pres:eu',
  'verb.morar:pres:tu',
  'verb.morar:pres:ele',
  'verb.chegar:pres:eu',
  'verb.chegar:pres:tu',
  'verb.chegar:pres:ele',
];
