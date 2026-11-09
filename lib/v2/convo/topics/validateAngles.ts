import {
  findBrazilianLeak,
  findEnglishLeak,
  wordCount,
} from '@/lib/v2/convo/output/checks';
import type {
  AngleCheckIssue,
  TopicAngle,
  TopicAnglesDoc,
  ValidateAnglesResult,
} from './freeTypes';

/** Free-chat angle questions may be a short invitation (09 §9). */
export const ANGLE_MAX_WORDS = 12;
export const ANGLE_MIN_COUNT = 8;
export const ANGLE_MAX_COUNT = 12;

function isAngle(v: unknown): v is TopicAngle {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.tl === 'string' &&
    Array.isArray(o.item_hints) &&
    o.item_hints.every((h) => typeof h === 'string')
  );
}

/**
 * Validate a topic-angles document like character lines:
 * Brazilian / English / length, 8–12 angles, unique ids.
 */
export function validateTopicAngles(raw: unknown): ValidateAnglesResult {
  const issues: AngleCheckIssue[] = [];

  if (!raw || typeof raw !== 'object') {
    return {
      ok: false,
      issues: [
        {
          path: '',
          rule: 'shape',
          message: 'expected object',
        },
      ],
      doc: null,
    };
  }

  const o = raw as Record<string, unknown>;
  if (typeof o.target_lang !== 'string' || !o.target_lang.trim()) {
    issues.push({
      path: 'target_lang',
      rule: 'shape',
      message: 'target_lang required',
    });
  }
  if (typeof o.topic_id !== 'string' || !o.topic_id.trim()) {
    issues.push({
      path: 'topic_id',
      rule: 'shape',
      message: 'topic_id required',
    });
  }
  if (!Array.isArray(o.angles)) {
    issues.push({
      path: 'angles',
      rule: 'shape',
      message: 'angles must be an array',
    });
    return { ok: false, issues, doc: null };
  }

  const n = o.angles.length;
  if (n < ANGLE_MIN_COUNT || n > ANGLE_MAX_COUNT) {
    issues.push({
      path: 'angles',
      rule: 'count',
      message: `expected ${ANGLE_MIN_COUNT}–${ANGLE_MAX_COUNT} angles, got ${n}`,
    });
  }

  const seen = new Set<string>();
  const angles: TopicAngle[] = [];
  for (let i = 0; i < o.angles.length; i++) {
    const a = o.angles[i];
    const path = `angles[${i}]`;
    if (!isAngle(a)) {
      issues.push({
        path,
        rule: 'shape',
        message: 'angle needs id, tl, item_hints[]',
      });
      continue;
    }
    if (!a.id.trim() || !a.tl.trim()) {
      issues.push({
        path,
        rule: 'shape',
        message: 'id and tl must be non-empty',
      });
    }
    if (seen.has(a.id)) {
      issues.push({
        path: `${path}.id`,
        rule: 'id',
        message: `duplicate id ${a.id}`,
      });
    }
    seen.add(a.id);

    const br = findBrazilianLeak(a.tl);
    if (br) {
      issues.push({
        path: `${path}.tl`,
        rule: 'brazilian',
        message: `brazilian:${br}`,
      });
    }
    const en = findEnglishLeak(a.tl);
    if (en) {
      issues.push({
        path: `${path}.tl`,
        rule: 'english',
        message: `english:${en}`,
      });
    }
    if (wordCount(a.tl) > ANGLE_MAX_WORDS) {
      issues.push({
        path: `${path}.tl`,
        rule: 'length',
        message: `more than ${ANGLE_MAX_WORDS} words`,
      });
    }
    angles.push({
      id: a.id,
      tl: a.tl,
      item_hints: [...a.item_hints],
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues, doc: null };
  }

  const doc: TopicAnglesDoc = {
    target_lang: String(o.target_lang),
    topic_id: String(o.topic_id),
    angles,
    ...(typeof o.version === 'number' ? { version: o.version } : {}),
  };
  return { ok: true, issues: [], doc };
}

/**
 * Drop angles that fail Brazilian / English / length; keep if ≥8 remain.
 * Used by the topic_angles job after one model retry.
 */
export function filterValidAngles(
  angles: TopicAngle[],
): { kept: TopicAngle[]; dropped: string[] } {
  const kept: TopicAngle[] = [];
  const dropped: string[] = [];
  for (const a of angles) {
    const br = findBrazilianLeak(a.tl);
    const en = findEnglishLeak(a.tl);
    const long = wordCount(a.tl) > ANGLE_MAX_WORDS;
    if (br || en || long || !a.id.trim() || !a.tl.trim()) {
      dropped.push(a.id || a.tl.slice(0, 24));
      continue;
    }
    kept.push(a);
  }
  return { kept, dropped };
}
