import type { ImageSpec } from '@/lib/v2/generation/images/templates';
import type { JobView } from '@/lib/v2/generation/lesson/graph';
import {
  finishJobFailed,
  finishJobSkipped,
  finishJobSuccess,
  markJobStarted,
} from '@/lib/v2/generation/lesson/jobs/persist';
import {
  generateContentImage,
  getImageByKey,
  loadLessonAndStoryForImages,
  runImageSpecs,
  resolveImageScene,
  specFromAuthoredScene,
  specWithoutKey,
  type ImageJobInput,
} from '@/lib/v2/images';
import { V2ImageModel } from '@/lib/v2/mongo/models';

function usedByFor(
  lesson: { target_lang: string; day: number; version: number } | null,
  story: { id: string; version: number } | null,
  manifestSource: string,
): string[] {
  const out: string[] = [];
  if (manifestSource === 'story_scene' && story) {
    out.push(`story:${story.id}.v${story.version}`);
  }
  if (lesson) {
    out.push(
      `lesson:${lesson.target_lang}.day-${String(lesson.day).padStart(2, '0')}.v${lesson.version}`,
    );
  }
  return out;
}

/** Soft job: write specs onto v2_images; never fails the day. */
export async function processImageSpecsJob(job: JobView): Promise<void> {
  await markJobStarted(job.id);
  try {
    const input = (job.input ?? {}) as { keys?: string[] };
    const { lesson, story } = await loadLessonAndStoryForImages(job.day);
    if (!lesson && !story) {
      await finishJobSkipped({
        jobId: job.id,
        reason: 'no lesson/story',
        output: { skipped: true },
      });
      return;
    }
    const pack = lesson?.pack ?? ({ items: [], pages: [], lesson: {} } as never);
    const keys = input.keys?.length ? input.keys : undefined;
    const result = await runImageSpecs({
      day: job.day,
      pack,
      story,
      keys,
    });

    const Model = V2ImageModel();
    for (const spec of result.specs) {
      await Model.updateOne(
        { key: spec.key },
        {
          $set: {
            spec: specWithoutKey(spec),
            type: spec.type,
            kind: 'content',
          },
          $setOnInsert: {
            key: spec.key,
            status: 'queued',
            cost_usd: 0,
            version: 1,
            used_by: [],
          },
        },
        { upsert: true },
      );
    }

    await finishJobSuccess({
      jobId: job.id,
      output: {
        from_model: result.fromModel,
        keys: result.specs.map((s) => s.key),
        theme_line: result.visual_brief.theme_line,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Soft: dependents still run with stored/default specs.
    await finishJobSkipped({
      jobId: job.id,
      reason: message,
      output: { error: message },
    });
  }
}

/** One content image for a manifest key. */
export async function processImageJob(job: JobView): Promise<void> {
  await markJobStarted(job.id);
  try {
    const input = (job.input ?? {}) as Partial<ImageJobInput>;
    const key = input.key;
    if (!key) {
      await finishJobFailed(job.id, 'image job missing key');
      return;
    }
    const force = Boolean(input.force);
    const { lesson, story } = await loadLessonAndStoryForImages(job.day);
    const manifestSource = input.manifest_source ?? 'word';

    const resolved = await resolveImageScene({
      day: job.day,
      key,
      itemId: input.item_id ?? undefined,
      targetLang: story?.target_lang ?? job.target_lang,
    });

    let spec: ImageSpec | undefined;
    let scenePrompt: string | undefined;
    let promptSource = resolved.source;

    if (resolved.skipSpecs && resolved.scenePrompt) {
      scenePrompt = resolved.scenePrompt;
      spec = specFromAuthoredScene({
        scenePrompt: resolved.scenePrompt,
        characters: resolved.characters,
        ratio: resolved.ratio,
      });
      promptSource = resolved.source;
    } else {
      const existing = await getImageByKey(key);
      if (existing?.spec) {
        spec = existing.spec as ImageSpec;
        promptSource =
          (existing.prompt_source as typeof promptSource) ?? 'generated';
        if (existing.prompt_override?.trim()) {
          scenePrompt = existing.prompt_override;
          promptSource = 'override';
        }
      }
    }

    if (!spec) {
      const pack =
        lesson?.pack ?? ({ items: [], pages: [], lesson: {} } as never);
      const specs = await runImageSpecs({
        day: job.day,
        pack,
        story,
        keys: [key],
      });
      const got = specs.byKey.get(key);
      if (got) {
        spec = specWithoutKey(got);
        promptSource = 'generated';
      }
    }

    if (!spec) {
      if (manifestSource === 'story_scene' && story) {
        spec = {
          type: 'scene',
          subject: `conversation in ${story.setting}`,
          characters: [
            'yassin',
            story.cast.find((c) => c.role === 'character')?.id ?? 'ines',
          ],
          setting: story.setting,
          intent: `two people mid-conversation in ${story.setting}`,
        };
      } else {
        const item = lesson?.pack.items?.find(
          (i) => i.id === (input.item_id ?? key),
        );
        spec = {
          type: item?.type === 'phrase' ? 'scene' : 'object',
          subject:
            item && 'tl' in item && typeof item.tl === 'string'
              ? item.tl
              : key,
          must_avoid: ['text', 'letters', 'numbers'],
        };
      }
      promptSource = 'generated';
    }

    const usedBy = usedByFor(
      lesson
        ? {
            target_lang: lesson.target_lang,
            day: lesson.day,
            version: lesson.version,
          }
        : null,
      story ? { id: story.id, version: story.version } : null,
      manifestSource,
    );

    let result = await generateContentImage({
      key,
      spec,
      usedBy,
      force,
      scenePrompt,
      promptSource,
      ratio: resolved.ratio ?? input.aspect ?? undefined,
    });

    // Lock contention: unlock and retry once with force.
    if (result.skipped) {
      await V2ImageModel().updateOne(
        { key, status: { $in: ['generating', 'queued'] } },
        {
          $set: { status: 'failed', reason: 'reclaimed after lock skip' },
          $unset: { generating_started_at: 1 },
        },
      );
      result = await generateContentImage({
        key,
        spec,
        usedBy,
        force: true,
        scenePrompt,
        promptSource,
        ratio: resolved.ratio ?? input.aspect ?? undefined,
      });
    }

    if (result.skipped) {
      await finishJobSkipped({
        jobId: job.id,
        reason: result.reason ?? 'lock skip',
        output: {
          key,
          status: result.doc.status,
          reason: result.reason ?? result.doc.reason,
          skipped: true,
        },
      });
      return;
    }

    const status = result.doc.status;
    if (status === 'blocked' || status === 'failed') {
      await finishJobSkipped({
        jobId: job.id,
        reason: result.reason ?? status,
        output: {
          key,
          status,
          reason: result.reason ?? result.doc.reason,
          skipped: false,
        },
      });
      return;
    }

    await finishJobSuccess({
      jobId: job.id,
      output: {
        key,
        status,
        url: result.doc.url ?? null,
        cost_usd: result.doc.cost_usd ?? null,
        skipped: false,
        reason: result.reason ?? null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishJobFailed(job.id, message);
  }
}
