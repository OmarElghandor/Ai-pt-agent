import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2CustomDeckModel,
  V2CustomItemModel,
  V2DeckReportModel,
  V2ImageModel,
} from '@/lib/v2/mongo/models';
import { hideImageKey, imageKeyForConcept } from './images';

export type ReportReason =
  | 'wrong_word'
  | 'brazilian'
  | 'offensive'
  | 'other'
  | 'wrong_picture';

const HIDE_AT = 3;

/**
 * One report per user × deck × item_id.
 * Deck-level auto-hide at 3 distinct learners.
 * wrong_picture: 3 distinct reporters on the same image key hide that picture.
 */
export async function reportCustomDeck(opts: {
  user_id: string;
  deck_id: string;
  reason: ReportReason;
  item_id?: string;
}): Promise<
  | {
      ok: true;
      report_count: number;
      hidden: boolean;
      duplicate?: boolean;
      image_hidden?: boolean;
    }
  | { ok: false; reason: string }
> {
  if (!mongoConfigured()) return { ok: false, reason: 'mongo' };
  await connectMongo();

  const deck = await V2CustomDeckModel().findById(opts.deck_id).lean();
  if (!deck) return { ok: false, reason: 'not_found' };

  const item_id =
    opts.reason === 'wrong_picture' ? (opts.item_id ?? '').trim() : '';

  try {
    await V2DeckReportModel().create({
      user_id: opts.user_id,
      deck_id: opts.deck_id,
      reason: opts.reason,
      item_id,
    });
  } catch (e) {
    const code = (e as { code?: number })?.code;
    if (code === 11000) {
      const count = await V2DeckReportModel().countDocuments({
        deck_id: opts.deck_id,
      });
      return {
        ok: true,
        report_count: count,
        hidden: deck.visibility === 'hidden',
        duplicate: true,
      };
    }
    throw e;
  }

  let image_hidden = false;
  if (opts.reason === 'wrong_picture' && item_id) {
    const item = await V2CustomItemModel().findOne({ id: item_id }).lean();
    const key =
      item?.image && typeof item.image === 'object' && 'key' in item.image
        ? String((item.image as { key?: string }).key ?? '')
        : item?.concept_en
          ? imageKeyForConcept(String(item.concept_en))
          : '';
    if (key) {
      const pictureReports = await V2DeckReportModel().distinct('user_id', {
        reason: 'wrong_picture',
        item_id,
      });
      if (pictureReports.length >= HIDE_AT) {
        await hideImageKey(key);
        await V2ImageModel().updateOne(
          { key },
          { $set: { status: 'flagged', reason: 'wrong_picture' } },
        );
        image_hidden = true;
      } else {
        await V2ImageModel().updateOne(
          { key },
          { $set: { reason: 'wrong_picture_report' } },
        );
      }
    }
  }

  const report_count = await V2DeckReportModel().countDocuments({
    deck_id: opts.deck_id,
  });
  let hidden = deck.visibility === 'hidden';
  // Deck-level hide only for non-picture reports (or any reports totaling 3)
  if (opts.reason !== 'wrong_picture') {
    if (report_count >= HIDE_AT && !hidden) {
      await V2CustomDeckModel().updateOne(
        { _id: opts.deck_id },
        { $set: { visibility: 'hidden', report_count } },
      );
      hidden = true;
    } else {
      await V2CustomDeckModel().updateOne(
        { _id: opts.deck_id },
        { $set: { report_count } },
      );
    }
  } else {
    await V2CustomDeckModel().updateOne(
      { _id: opts.deck_id },
      { $set: { report_count } },
    );
  }

  return { ok: true, report_count, hidden, image_hidden };
}

/** Pure count helper for tests. */
export function shouldAutoHide(distinctReports: number): boolean {
  return distinctReports >= HIDE_AT;
}
