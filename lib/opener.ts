import { dayPart, greetingPt } from './history';
import { lessonById } from './lessons/catalogue';
import type { LearnerFile, OpenerSituation, TypedMessage } from './progressTypes';

export type ComposedOpener = {
  message: TypedMessage;
  situation: OpenerSituation;
  nextCursor: number;
  logLine: string;
};

function timeArabic(hour: number): { ar: string; pronunciation: string } {
  const part = dayPart(hour);
  if (part === 'morning') return { ar: 'صباح الخير!', pronunciation: 'صَبَاح الخِير!' };
  if (part === 'afternoon') return { ar: 'أهلاً بيك!', pronunciation: 'أَهلاً بيك!' };
  return { ar: 'مساء الخير!', pronunciation: 'مَسَاء الخِير!' };
}

const FIRST = [
  {
    pt: 'Olá! Eu sou o teu parceiro de português. Sobre o que falamos hoje?',
    ar: 'أهلاً! أنا شريكك في البرتغالي. نتكلم في إيه النهارده؟',
    pronunciation: 'أَهلاً! أنا شَريكَك في البُرتُغالي. نِتْكَلِّم في إيه النَّهَارْدَه؟',
  },
  {
    pt: 'Olá! Estou aqui para praticarmos juntos. Como foi o teu dia?',
    ar: 'أهلاً! أنا هنا نتعلم سوا. يومك كان عامل إزاي؟',
    pronunciation: 'أَهلاً! أنا هِنا نِتْعَلِّم سَوا. يُومَك كان عامِل إزَّاي؟',
  },
  {
    pt: 'Olá! Queres falar do teu dia, ou escolhemos uma lição?',
    ar: 'أهلاً! تحب تحكي عن يومك، ولا نختار درس؟',
    pronunciation: 'أَهلاً! تِحِبّ تِحْكي عَن يُومَك، وَلا نِخْتار دَرس؟',
  },
];

const RETURNING = [
  {
    pt: 'Olá de novo! Tudo bem? Sobre o que falamos hoje?',
    ar: 'أهلاً تاني! عامل إيه؟ نتكلم في إيه النهارده؟',
    pronunciation: 'أَهلاً تَاني! عامِل إيه؟ نِتْكَلِّم في إيه النَّهَارْدَه؟',
  },
  {
    pt: 'Olá outra vez! Conta-me o teu dia.',
    ar: 'نورت تاني! احكي لي عن يومك.',
    pronunciation: 'نَوَّرت تَاني! اِحْكي لِي عَن يُومَك.',
  },
  {
    pt: 'Olá! Em que queres falar hoje?',
    ar: 'أهلاً بيك! عايز نتكلم في إيه النهارده؟',
    pronunciation: 'أَهلاً بيك! عايِز نِتْكَلِّم في إيه النَّهَارْدَه؟',
  },
];

function everTalked(file: LearnerFile): boolean {
  const talked = [...file.archive, ...file.visible].some((m) => m.role === 'user');
  return talked || Object.values(file.progress.lessons).some((l) => l.practisedAt);
}

export function openerSituation(file: LearnerFile): OpenerSituation {
  const hasPaused = Object.values(file.progress.lessons).some((l) => l.paused);
  if (hasPaused) return 'paused';
  if (file.progress.finishedLastTime) return 'finished';
  if (!everTalked(file)) return 'first';
  return 'returning';
}

function lessonTitle(lessonId: string | null | undefined): string {
  return lessonById(lessonId)?.titleAr ?? 'الدرس';
}

export function composeOpener(file: LearnerFile, hour: number): ComposedOpener {
  const situation = openerSituation(file);
  const cursor = file.progress.openerCursor[situation] ?? 0;
  const greet = greetingPt(hour);
  const hello = timeArabic(hour);

  let pt: string;
  let ar: string;
  let pronunciation: string;
  let count: number;

  if (situation === 'paused') {
    const pausedId = Object.values(file.progress.lessons).find((l) => l.paused)?.lessonId;
    const name = lessonTitle(pausedId);
    const bodies = [
      {
        pt: `${greet} A última vez parámos a meio da lição. Continuamos?`,
        ar: `${hello.ar} المرة اللي فاتت وقفنا في نص ${name}. نكمّله؟`,
        pronunciation: `${hello.pronunciation} المَرَّة اللِّي فَاتِت وِقِفْنا في نُصّ ${name}. نِكَمِّلُه؟`,
      },
      {
        pt: `${greet} Ainda temos a lição em pausa. Queres voltar?`,
        ar: `${hello.ar} لسه عندنا ${name} واقف. نرجعله؟`,
        pronunciation: `${hello.pronunciation} لِسَّه عِنْدِنا ${name} وَاقِف. نِرْجَع لُه؟`,
      },
      {
        pt: `${greet} Parámos na lição. Continuamos de lá?`,
        ar: `${hello.ar} وقفنا في ${name}. نكمّل من هناك؟`,
        pronunciation: `${hello.pronunciation} وِقِفْنا في ${name}. نِكَمِّل مِن هُناك؟`,
      },
    ];
    count = bodies.length;
    const i = cursor % count;
    pt = bodies[i].pt;
    ar = bodies[i].ar;
    pronunciation = bodies[i].pronunciation;
  } else if (situation === 'finished') {
    const name = lessonTitle(file.progress.lastPractisedLessonId);
    const bodies = [
      {
        pt: `${greet} Da última vez praticámos bem. Como foi o teu dia?`,
        ar: `${hello.ar} المرة اللي فاتت اتدربنا على ${name}، برافو. يومك كان إيه؟`,
        pronunciation: `${hello.pronunciation} المَرَّة اللِّي فَاتِت اتْدَرَّبْنا عَلى ${name}، بَرافو. يُومَك كان إيه؟`,
      },
      {
        pt: `${greet} Acabámos a prática. Conta-me o teu dia.`,
        ar: `${hello.ar} خلّصنا تمرين ${name}. احكي لي عن يومك.`,
        pronunciation: `${hello.pronunciation} خَلَّصنا تَمْرين ${name}. اِحْكي لِي عَن يُومَك.`,
      },
      {
        pt: `${greet} Muito bem na lição. O que fizeste hoje?`,
        ar: `${hello.ar} برافو في ${name}. عملت إيه النهارده؟`,
        pronunciation: `${hello.pronunciation} بَرافو في ${name}. عَمَلت إيه النَّهَارْدَه؟`,
      },
    ];
    count = bodies.length;
    const i = cursor % count;
    pt = bodies[i].pt;
    ar = bodies[i].ar;
    pronunciation = bodies[i].pronunciation;
  } else if (situation === 'returning') {
    count = RETURNING.length;
    const i = cursor % count;
    pt = RETURNING[i].pt.replace(/^(Olá[^!]*)!/, `$1! ${greet}`);
    ar = RETURNING[i].ar;
    pronunciation = RETURNING[i].pronunciation;
  } else {
    count = FIRST.length;
    const i = cursor % count;
    pt = FIRST[i].pt.replace('Olá!', `Olá! ${greet}`);
    ar = FIRST[i].ar;
    pronunciation = FIRST[i].pronunciation;
  }

  const message: TypedMessage = {
    id: `opener-${Date.now()}`,
    role: 'assistant',
    type: 'chat',
    at: Date.now(),
    segments: [{ lang: 'pt', text: pt }],
    translation: [{ lang: 'ar', text: ar, pronunciation }],
  };

  return {
    message,
    situation,
    nextCursor: cursor + 1,
    logLine: `Opener · ${situation} · ${pt}`,
  };
}
