import { getPublishedLesson } from '@/lib/v2/content/getPublishedLesson';
import { validateConvoPack } from '@/lib/v2/convo/pack/validate';
import type { ConvoPackData } from '@/lib/v2/convo/pack/schema';
import type { JobView } from '@/lib/v2/generation/lesson/graph';
import {
  finishJobFailed,
  finishJobSuccess,
  markJobStarted,
} from '@/lib/v2/generation/lesson/jobs/persist';
import { jobCallContext } from '@/lib/v2/generation/lesson/jobs/call';
import { expandConvoItemJobs } from './expandItems';
import {
  ensureRecapCoverage,
  fixGeneratedItemBanks,
} from './fixItems';
import { surfacesForDay } from './itemSurfaces';
import type { ConvoOutline } from './outlineSchema';
import { runConvoItemsJob } from './runItems';
import { runConvoOutlineJob } from './runOutline';
import {
  getLatestConvoPack,
  setConvoHandoff,
  updateConvoPackDraft,
} from './save';

/**
 * Process one convo_* job. Reuses lesson job persist helpers.
 */
export async function processConvoJob(
  job: JobView,
  _workerId: string,
): Promise<void> {
  await markJobStarted(job.id);
  try {
    await jobCallContext.run(
      {
        jobId: job.id,
        day: job.day,
        version: job.version,
        page_id: job.page_id,
      },
      async () => {
        await processConvoJobBody(job);
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishJobFailed(job.id, message);
    throw err;
  }
}

async function processConvoJobBody(job: JobView): Promise<void> {
  const published = await getPublishedLesson(job.day);
  if (!published) throw new Error(`No published lesson for day ${job.day}`);

  const packDoc = await getLatestConvoPack(job.day, job.target_lang);
  if (!packDoc || packDoc.version !== job.version) {
    throw new Error(`Convo pack draft v${job.version} missing`);
  }

  switch (job.kind) {
    case 'convo_outline': {
      const result = await runConvoOutlineJob({
        day: job.day,
        targetLang: job.target_lang,
        lesson: published.pack,
      });
      if (!result.ok) {
        throw new Error(
          `convo_outline failed validation: ${result.issues
            .filter((i) => i.severity === 'error')
            .map((i) => i.message)
            .join('; ')}`,
        );
      }
      const outline = result.outline;
      const nextData = {
        ...packDoc.data,
        pack_id: packDoc.data.pack_id ?? job.lesson_id,
        day: job.day,
        target_lang: job.target_lang,
        scene: outline.scene,
        visual: outline.visual,
        groups: outline.groups,
        recap: outline.recap,
        items: {},
        ...(outline.opening_tl
          ? { opening: { tl: outline.opening_tl } }
          : {}),
        ...(outline.closing_tl
          ? { closing: { tl: outline.closing_tl } }
          : {}),
        ...(outline.bridge_tl ? { bridge: { tl: outline.bridge_tl } } : {}),
      };
      await updateConvoPackDraft({
        day: job.day,
        targetLang: job.target_lang,
        version: job.version,
        data: nextData,
        mergeMeta: true,
        meta: {
          lesson_version: published.version,
          stale: false,
          issues: result.issues,
        },
      });
      await setConvoHandoff({
        day: job.day,
        targetLang: job.target_lang,
        version: job.version,
        key: 'outline',
        value: outline,
      });
      const expanded = await expandConvoItemJobs({
        day: job.day,
        targetLang: job.target_lang,
        version: job.version,
        outline,
        outlineJobId: job.id,
      });
      await finishJobSuccess({
        jobId: job.id,
        output: { ...outline, expanded_item_jobs: expanded.itemJobIds },
        handoff: {
          groups: outline.groups.map((g) => g.id),
          character_id: outline.scene.character_id,
          visual_type: outline.visual.type,
          item_jobs: expanded.itemJobIds.length,
        },
        tokens: result.tokens,
        over_budget: result.over_budget,
        provider: result.provider,
        model: result.model,
        issues: result.issues,
        timing: result.timing,
      });
      return;
    }
    case 'convo_items': {
      const outline = packDoc.meta?.handoffs?.outline as ConvoOutline | undefined;
      if (!outline?.groups?.length || !outline.visual) {
        throw new Error('convo_items: outline handoff missing');
      }
      const groupId = job.page_id;
      const group =
        outline.groups.find((g) => g.id === groupId) ??
        (job.page_index != null ? outline.groups[job.page_index] : undefined);
      if (!group) {
        throw new Error(
          `convo_items: group not found (page_id=${groupId} index=${job.page_index})`,
        );
      }
      const allIds = outline.groups.flatMap((g) => g.item_ids);
      const generated = await runConvoItemsJob({
        day: job.day,
        lesson: published.pack,
        group,
        visual: outline.visual,
        allGroupItemIds: allIds,
      });

      const surfaces = surfacesForDay(job.day, published.pack);
      const fixedGroupItems = fixGeneratedItemBanks(generated.result.items, {
        itemSurfaces: surfaces,
      });
      const prevItems =
        (packDoc.data.items as ConvoPackData['items'] | undefined) ?? {};
      const mergedItems = { ...prevItems, ...fixedGroupItems };
      const nextData = {
        ...packDoc.data,
        items: mergedItems,
      };
      await updateConvoPackDraft({
        day: job.day,
        targetLang: job.target_lang,
        version: job.version,
        data: nextData,
        mergeMeta: true,
        meta: { lesson_version: published.version },
      });
      await setConvoHandoff({
        day: job.day,
        targetLang: job.target_lang,
        version: job.version,
        key: `items:${group.id}`,
        value: {
          group_id: group.id,
          item_ids: Object.keys(fixedGroupItems),
        },
      });

      // When all groups are present, run pack validator (T5.2 Done when).
      const expected = new Set(allIds);
      const have = Object.keys(mergedItems);
      const complete = [...expected].every((id) => have.includes(id));
      let packIssues: unknown = undefined;
      if (complete) {
        const groups =
          (nextData.groups as ConvoPackData['groups'] | undefined) ??
          outline.groups;
        const packCandidate = {
          ...nextData,
          groups,
          recap: ensureRecapCoverage({
            groups,
            recap: nextData.recap as ConvoPackData['recap'],
          }),
          items: fixGeneratedItemBanks(mergedItems, { itemSurfaces: surfaces }),
          opening: nextData.opening ?? { tl: 'Olá!' },
          closing: nextData.closing ?? { tl: 'Obrigada!' },
          bridge: nextData.bridge ?? { tl: 'Queres continuar?' },
        };
        const validated = validateConvoPack(packCandidate, {
          itemSurfaces: surfaces,
        });
        packIssues = validated.issues;
        await updateConvoPackDraft({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          data: packCandidate,
          mergeMeta: true,
          meta: {
            issues: validated.issues,
            flagged: !validated.ok,
            text_ready: validated.ok,
          },
        });
        await setConvoHandoff({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          key: 'items_validate',
          value: {
            ok: validated.ok,
            error_count: validated.issues.filter((i) => i.severity === 'error')
              .length,
          },
        });
        if (!validated.ok) {
          const msg = validated.issues
            .filter((i) => i.severity === 'error')
            .slice(0, 8)
            .map((i) => `${i.path}: [${i.rule}] ${i.message}`)
            .join('; ');
          throw new Error(`convo groups failed validator: ${msg}`);
        }
      }

      await finishJobSuccess({
        jobId: job.id,
        output: {
          group_id: group.id,
          item_ids: Object.keys(generated.result.items),
          pack_complete: complete,
          pack_issues: packIssues,
        },
        handoff: {
          group_id: group.id,
          items: Object.keys(generated.result.items).length,
        },
        tokens: generated.tokens,
        over_budget: generated.over_budget,
        provider: generated.provider,
        model: generated.model,
        timing: generated.timing,
      });
      return;
    }
    case 'convo_critic':
    case 'convo_lang_check':
    case 'convo_assemble': {
      // T5.3 fills these; soft-success so the DAG can drain after items.
      await setConvoHandoff({
        day: job.day,
        targetLang: job.target_lang,
        version: job.version,
        key: job.kind,
        value: { deferred: true },
      });
      await finishJobSuccess({
        jobId: job.id,
        output: { deferred: true },
        handoff: { deferred: true },
      });
      return;
    }
    default:
      throw new Error(`Unknown convo kind ${job.kind}`);
  }
}
