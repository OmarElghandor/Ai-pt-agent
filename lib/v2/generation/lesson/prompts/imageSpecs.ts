import { CORE_PROMPT } from './core';
import { IMAGE_FORBIDDEN } from '@/lib/v2/images/forbidden';
import { INTERACTIONS, SCENE_POSE_AVOID, SPOTS } from '@/lib/v2/images/shotPlan';

/** Lesson-aware IMAGE_SPECS: brief + shot_plan + specs. */
export function buildImageSpecsSystemPrompt(): string {
  return `${CORE_PROMPT}

JOB: IMAGE_SPECS
Same world, different moments: cast/outfits/style stay constant, but NO two images may look alike.

STEP 1 — visual_brief:
- place, cast_outfits, light_by_time, theme_line

STEP 2 — shot_plan (REQUIRED, one row per image key, BEFORE writing specs):
Each row: { key, moment, spot, shot, interaction, emotion, detail_prop, time_of_day }
- moment: distinct beat of the day (arriving with coffee, by the lift after lunch, leaving under street lights…)
- spot: different place within the setting. Prefer: ${SPOTS.join(', ')}
- shot: close_two_shot | over_shoulder | medium | wide. At most ONE wide. Default close_two_shot or medium (waist-up, faces large).
- interaction: different gesture. Prefer: ${INTERACTIONS.join(', ')}
- emotion: different feeling
- detail_prop: one small story prop (visitor badge, coffee cup, umbrella, laptop bag…)
- time_of_day: morning | afternoon | evening | daytime
  - Bom dia → morning; Boa tarde → afternoon; Boa noite → evening (never sleeping)
  - Neutral phrases (Olá, Muito prazer…) → daytime unless their story line says otherwise
- Variety: no two rows share the same (spot + shot + interaction)
- People always interact: eye contact, bodies turned toward each other, readable faces. Never side-by-side facing the camera; never one person just walking past.

STEP 3 — specs (one per key), each MUST use its shot_plan row:
- phrase → type "scene", 4:3; apply that row's spot/shot/interaction/emotion/detail/time for light
- verb → "action"; emotion/adj → "emotion"; noun → "object"; story scene → "scene" 16:9
- Characters: only lesson cast ids; learner = yassin
- intent: one English meaning line for QA

NEVER:
${IMAGE_FORBIDDEN.map((f) => `- ${f}`).join('\n')}
${SCENE_POSE_AVOID.map((f) => `- ${f}`).join('\n')}

REQUIRED OUTPUT JSON:
{
  "visual_brief": {
    "place", "cast_outfits", "light_by_time", "theme_line",
    "shot_plan": [ { "key", "moment", "spot", "shot", "interaction", "emotion", "detail_prop", "time_of_day" } ]
  },
  "specs": [ { "key", "type", "subject", "characters", "pose", "expression", "setting", "framing", "light", "must_show", "must_avoid", "intent" } ]
}
`.trim();
}

export function buildShotPlanRepairPrompt(conflicts: string[]): string {
  return `Your previous shot_plan had variety conflicts: ${conflicts.join('; ')}.
Rewrite ONLY visual_brief.shot_plan for the same keys so that:
- no two rows share (spot, shot, interaction)
- at most one wide shot
- each key keeps a sensible time_of_day for its phrase
Return the full IMAGE_SPECS JSON again (visual_brief with fixed shot_plan + specs updated to match).`;
}
