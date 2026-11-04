import mongoose from 'mongoose';
import { connectMongo } from '@/lib/mongo';
import { V2JobModel } from '@/lib/v2/mongo/models';
import { inputHash } from '@/lib/v2/generation/lesson/hash';
import type { ConvoOutline } from './outlineSchema';
import { convoPackIdFor } from './save';

/**
 * After convo_outline: one convo_items job per group, then stub
 * critic → lang_check → assemble (handlers filled in T5.3).
 */
export async function expandConvoItemJobs(opts: {
  day: number;
  targetLang: string;
  version: number;
  outline: ConvoOutline;
  outlineJobId: string;
}): Promise<{ itemJobIds: string[] }> {
  await connectMongo();
  const lesson_id = convoPackIdFor(opts.day, opts.targetLang);
  const Job = V2JobModel();

  await Job.deleteMany({
    lesson_id,
    version: opts.version,
    kind: {
      $in: [
        'convo_items',
        'convo_critic',
        'convo_lang_check',
        'convo_assemble',
      ],
    },
  });

  const outlineOid = new mongoose.Types.ObjectId(opts.outlineJobId);
  const itemIds: mongoose.Types.ObjectId[] = [];

  for (const [gi, group] of opts.outline.groups.entries()) {
    const id = new mongoose.Types.ObjectId();
    itemIds.push(id);
    await Job.create({
      _id: id,
      kind: 'convo_items',
      lesson_id,
      day: opts.day,
      target_lang: opts.targetLang,
      version: opts.version,
      page_index: gi,
      page_id: group.id,
      status: 'queued',
      depends_on: [outlineOid],
      input_hash: inputHash({
        kind: 'convo_items',
        day: opts.day,
        group_id: group.id,
        item_ids: group.item_ids,
      }),
    });
  }

  const criticId = new mongoose.Types.ObjectId();
  const langId = new mongoose.Types.ObjectId();
  const assembleId = new mongoose.Types.ObjectId();

  await Job.insertMany([
    {
      _id: criticId,
      kind: 'convo_critic',
      lesson_id,
      day: opts.day,
      target_lang: opts.targetLang,
      version: opts.version,
      status: 'queued',
      depends_on: itemIds,
      input_hash: inputHash({
        kind: 'convo_critic',
        day: opts.day,
        v: opts.version,
      }),
    },
    {
      _id: langId,
      kind: 'convo_lang_check',
      lesson_id,
      day: opts.day,
      target_lang: opts.targetLang,
      version: opts.version,
      status: 'queued',
      depends_on: [criticId],
      input_hash: inputHash({
        kind: 'convo_lang_check',
        day: opts.day,
        v: opts.version,
      }),
    },
    {
      _id: assembleId,
      kind: 'convo_assemble',
      lesson_id,
      day: opts.day,
      target_lang: opts.targetLang,
      version: opts.version,
      status: 'queued',
      depends_on: [langId],
      input_hash: inputHash({
        kind: 'convo_assemble',
        day: opts.day,
        v: opts.version,
      }),
    },
  ]);

  return { itemJobIds: itemIds.map(String) };
}
