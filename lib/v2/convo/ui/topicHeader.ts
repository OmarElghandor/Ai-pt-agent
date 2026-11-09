import { OPEN_TOPIC, isOpenTopicId } from '@/lib/v2/convo/topics/openTopic';

const OPEN_TITLE_TL = OPEN_TOPIC.title_tl;
const OPEN_TITLE_AR = OPEN_TOPIC.title_ar;

function isOpenCatalogTitle(titleTl: string, titleAr: string): boolean {
  const tl = titleTl.trim();
  const ar = titleAr.trim();
  if (tl === OPEN_TITLE_TL || ar === OPEN_TITLE_AR) return true;
  if (tl === 'Qualquer coisa' || ar === 'أي حاجة') return true;
  return false;
}

/**
 * Header / chip topic line for free talk (v4 V1).
 * Once a real topic title is set, never show «أي حاجة» / Qualquer coisa.
 */
export function freeTalkTopicHeaderLine(opts: {
  lessonDay?: number | null;
  openMode: boolean;
  topicId?: string | null;
  titleTl?: string | null;
  titleAr?: string | null;
}): string {
  const day =
    typeof opts.lessonDay === 'number' && opts.lessonDay > 0
      ? opts.lessonDay
      : null;
  const titleTl = (opts.titleTl ?? '').trim();
  const titleAr = (opts.titleAr ?? '').trim();
  const titlesLine =
    titleTl && titleAr
      ? `${titleTl} · ${titleAr}`
      : titleTl || titleAr || '';

  if (day != null) {
    return titlesLine || `يوم ${day}`;
  }

  const locked =
    titlesLine.length > 0 && !isOpenCatalogTitle(titleTl, titleAr);
  if (locked) return titlesLine;

  const stillOpen =
    opts.openMode || isOpenTopicId(opts.topicId ?? null);
  if (stillOpen) return OPEN_TITLE_AR;

  return titlesLine || OPEN_TITLE_AR;
}
