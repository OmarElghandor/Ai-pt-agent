import type { CustomItemPos } from './keys';

export type CustomItemStatus = 'custom' | 'official';

export type CustomItemFields = {
  id: string;
  target_lang: string;
  lemma: string;
  pos: CustomItemPos;
  tl: string;
  tl_f?: string;
  gender?: 'm' | 'f' | 'n';
  ar: string;
  eg_note?: string;
  example_tl: string;
  example_ar: string;
  say: string;
  /** English slug for image key; never shown to learners. */
  concept_en?: string;
  image?: { key: string; url: string };
  status: CustomItemStatus;
  reviewed?: boolean;
  deck_ids: string[];
};

export type DeckImagesStatus = 'none' | 'queued' | 'partial' | 'ready';

export type ResolvedItemRef = {
  item_id: string;
  source: 'official' | 'custom';
  created: boolean;
};
