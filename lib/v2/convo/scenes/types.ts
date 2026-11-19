/** Scene path index (batch-rp-2). */

export type ScenePathEntry = {
  n: number;
  id: string;
  round: number;
  emoji: string;
  title_tl: string;
  title_ar: string;
  recommended_day: number;
};

export type SceneIndex = {
  target_lang: string;
  path: ScenePathEntry[];
};
