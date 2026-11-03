import { planQuestionSlots } from '@/lib/v2/generation/lesson/questionSlots';
import type { Item } from '@/lib/v2/content/items';
import type { OutlineResult } from '@/lib/v2/generation/lesson/stages/types';

const day1Items: Item[] = [
  {
    type: 'phrase',
    id: 'phrase.hello',
    tl: 'Olá!',
    ar: 'أهلاً',
    context_eg: 'تحية',
    cloze: 'Olá',
  },
  {
    type: 'phrase',
    id: 'phrase.good_morning',
    tl: 'Bom dia!',
    ar: 'صباح الخير',
    context_eg: 'صباح',
    cloze: 'Bom',
    variant_group: 'greeting.time_of_day',
  },
  {
    type: 'phrase',
    id: 'phrase.good_afternoon',
    tl: 'Boa tarde!',
    ar: 'مساء الخير',
    context_eg: 'بعد الضهر',
    cloze: 'Boa',
    variant_group: 'greeting.time_of_day',
  },
  {
    type: 'phrase',
    id: 'phrase.good_night',
    tl: 'Boa noite!',
    ar: 'تصبح على خير',
    context_eg: 'ليل',
    cloze: 'noite',
    variant_group: 'greeting.time_of_day',
  },
  {
    type: 'phrase',
    id: 'phrase.my_name_is',
    tl: 'Chamo-me Omar.',
    ar: 'اسمي عمر',
    context_eg: 'تعريف',
    cloze: 'Chamo-me',
  },
  {
    type: 'phrase',
    id: 'phrase.whats_your_name',
    tl: 'Como se chama?',
    ar: 'اسمك إيه',
    context_eg: 'سؤال',
    cloze: 'chama',
  },
  {
    type: 'phrase',
    id: 'phrase.nice_to_meet',
    tl: 'Muito prazer!',
    ar: 'اتشرفنا',
    context_eg: 'تعارف',
    cloze: 'prazer',
    role: 'heard',
  },
  {
    type: 'phrase',
    id: 'phrase.likewise',
    tl: 'Igualmente.',
    ar: 'وأنا كمان',
    context_eg: 'رد',
    cloze: 'Igualmente',
    role: 'said',
    replies_to: 'phrase.nice_to_meet',
  },
  {
    type: 'pattern',
    id: 'pattern.chamo_me',
    tl: 'Chamo-me + اسم',
    ar: 'الضمير بعد الفعل',
    examples: [
      'pattern.chamo_me.ex.1',
      'pattern.chamo_me.ex.2',
      'pattern.chamo_me.ex.3',
    ],
  },
  {
    type: 'phrase',
    id: 'pattern.chamo_me.ex.1',
    tl: 'Chamo-me Omar.',
    ar: 'اسمي عمر',
    context_eg: 'مثال',
    cloze: 'Chamo-me',
  },
  {
    type: 'phrase',
    id: 'pattern.chamo_me.ex.2',
    tl: 'Chamo-me Rita.',
    ar: 'اسمي ريتا',
    context_eg: 'مثال',
    cloze: 'Chamo-me',
  },
  {
    type: 'phrase',
    id: 'pattern.chamo_me.ex.3',
    tl: 'Chamo-me Inês.',
    ar: 'اسمي إينيس',
    context_eg: 'مثال',
    cloze: 'Chamo-me',
  },
];

const outline: OutlineResult = {
  items: day1Items,
  pages: [
    {
      index: 0,
      page_id: 'p0',
      preset: 'story',
      mode: 'static',
      role: 'intro',
      title: 'قصة',
      purpose: 'intro',
      introduces: [],
      assumes: [],
      handoff: '',
    },
    {
      index: 1,
      page_id: 'p1',
      preset: 'phrases',
      mode: 'static',
      title: 'تحيات',
      purpose: 'phrases',
      introduces: day1Items
        .filter((i) => i.type === 'phrase' && !i.id.includes('.ex.'))
        .map((i) => i.id),
      assumes: [],
      handoff: '',
    },
    {
      index: 2,
      page_id: 'p2',
      preset: 'pattern',
      mode: 'sections',
      title: 'Chamo-me',
      purpose: 'pattern',
      introduces: ['pattern.chamo_me'],
      assumes: ['phrase.my_name_is'],
      handoff: '',
    },
  ],
};

const { slots, warnings } = planQuestionSlots({
  outline,
  items: day1Items,
  preferBuildSentenceFor: ['pattern.chamo_me'],
  priorityIds: day1Items
    .filter((i) => !i.id.includes('.ex.'))
    .map((i) => i.id),
});
console.log('count', slots.length, warnings);
console.log(
  slots.map((s) => `${s.slot_id} ${s.type} ${s.tests} ${s.skill}`).join('\n'),
);
