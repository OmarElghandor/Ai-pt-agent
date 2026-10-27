import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2JobModel } from '@/lib/v2/mongo/models';
import type { Item } from '@/lib/v2/content/items';
import type { Page } from '@/lib/v2/content/page';
import type { Micro, Question, SpeakPrompt } from '@/lib/v2/content/lesson';
import { buildLessonBrief } from './lesson/brief';
import {
  claimReadyJobs,
  enqueueLessonDag,
  expandPageJobs,
  hashAssembleJob,
  hashContinuityJob,
  hashDailyUseJob,
  hashMicroJob,
  hashOutlineJob,
  hashQuestionsJob,
  itemsAsKnown,
  lessonIdFor,
  listJobsForVersion,
  loadDraftData,
  requeueJob,
  requeueStale,
  type JobView,
} from './lesson/graph';
import {
  buildDayDigest,
  buildItemDigest,
  buildMicroHandoff,
  buildOutlineHandoff,
  buildPageDigest,
  buildQuestionDigest,
  handoffKey,
  neighborStubs,
  newAndRecycleDigest,
  phraseDigest,
  selectKnownForDay,
  type DayDigest,
  type MicroHandoff,
  type PageDigest,
} from './lesson/handoffs';
import { coreTlById } from './lesson/coreItems';
import { getDayPlan } from './lesson/plan';
import { loadKnownItemMap, loadKnownItems } from './lesson/registry';
import { progressFromExtras } from './lesson/tiers';
import {
  getLatestLesson,
  setDraftHandoff,
  updateDraft,
  updateDraftFields,
  updateDraftPage,
} from './lesson/save';
import { runAssembleJob } from './lesson/jobs/runAssemble';
import { runLangCheckJob } from './lesson/jobs/runLangCheck';
import { runContinuityJob } from './lesson/jobs/runContinuity';
import { runCriticJob } from './lesson/jobs/runCritic';
import { runDailyUseJob } from './lesson/jobs/runDailyUse';
import { runItemsJob } from './lesson/jobs/runItems';
import { runMicroJob } from './lesson/jobs/runMicro';
import { runOutlineJob } from './lesson/jobs/runOutline';
import { runPageJob } from './lesson/jobs/runPage';
import { runQuestionsJob } from './lesson/jobs/runQuestions';
import { fixDialoguePage } from './lesson/dialogueChecks';
import {
  finishJobFailed,
  finishJobSuccess,
  markJobStarted,
} from './lesson/jobs/persist';
import { buildInputMeta } from './lesson/jobs/call';
import { printTimingTable, type CallTiming } from './lesson/cost';
import type { OutlineResult } from './lesson/stages/types';
import { assembleLessonPack, pagesMapFromSparse } from './lesson/stages/assemble';

const LEASE_MS = 10 * 60 * 1000;

export type EnqueueResult = {
  jobId: string;
  day: number;
  version: number;
  target_lang: string;
  lesson_id: string;
  jobIds: string[];
};

export async function enqueueGenerateLesson(opts: {
  day: number;
  targetLang?: string;
}): Promise<EnqueueResult> {
  const target_lang = opts.targetLang ?? 'pt-PT';
  const known = await loadKnownItems({ day: opts.day, targetLang: target_lang });
  const dag = await enqueueLessonDag({
    day: opts.day,
    targetLang: target_lang,
    known,
  });
  return {
    jobId: dag.jobIds[0]!,
    day: dag.day,
    version: dag.version,
    target_lang: dag.target_lang,
    lesson_id: dag.lesson_id,
    jobIds: dag.jobIds,
  };
}

export function jobConcurrency(): number {
  const n = Number(process.env.V2_JOB_CONCURRENCY);
  // Default serial (1). Set V2_JOB_CONCURRENCY>1 only for deliberate parallel drains.
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export async function enqueueAndStartGenerateLesson(opts: {
  day: number;
  targetLang?: string;
}): Promise<EnqueueResult> {
  const enqueued = await enqueueGenerateLesson(opts);
  const workerId = `admin-${process.pid}-${Date.now().toString(36)}`;
  void runWorkerUntilIdle(workerId, {
    maxEmptyRounds: 3,
    idleMs: 2000,
    deadlineMs: 280_000,
  }).catch((err) => {
    console.error(
      '[v2-gen] inline worker failed',
      err instanceof Error ? err.message : err,
    );
  });
  return enqueued;
}

async function heartbeat(jobId: string, workerId: string) {
  await V2JobModel().updateOne(
    { _id: jobId, worker_id: workerId, status: 'running' },
    { $set: { lease_expires_at: new Date(Date.now() + LEASE_MS) } },
  );
}

async function loadYesterdayDigest(
  day: number,
  targetLang: string,
): Promise<DayDigest | null> {
  if (day <= 1) return null;
  const prev = await getLatestLesson(day - 1, targetLang);
  const handoffs = (prev?.meta as { handoffs?: Record<string, unknown> } | undefined)
    ?.handoffs;
  const digest = handoffs?.assemble as DayDigest | undefined;
  return digest ?? null;
}

async function loadPrevMicroHandoff(
  day: number,
  targetLang: string,
  series: string | undefined,
): Promise<MicroHandoff | null> {
  if (day <= 1 || !series) return null;
  const prev = await getLatestLesson(day - 1, targetLang);
  const handoffs = (prev?.meta as { handoffs?: Record<string, unknown> } | undefined)
    ?.handoffs;
  const micro = handoffs?.micro as MicroHandoff | undefined;
  if (micro && micro.series === series) return micro;
  return null;
}

export async function runWorkerBatch(
  workerId: string,
  filter?: { day?: number; version?: number; targetLang?: string },
): Promise<number> {
  let processed = 0;
  console.info(
    `[v2-gen:batch] start worker=${workerId} concurrency=${jobConcurrency()}${
      filter?.day != null ? ` day=${filter.day} v=${filter.version ?? '*'}` : ''
    }`,
  );
  for (let round = 0; round < 40; round++) {
    const batch = await claimReadyJobs(workerId, jobConcurrency(), filter);
    console.info(
      `[v2-gen:batch] round=${round} claimed=${batch.length} processed_so_far=${processed}`,
    );
    if (batch.length === 0) break;
    // Sequential: one job at a time so admin step indicator stays clear.
    for (const job of batch) {
      try {
        await processLessonJob(job, workerId);
        processed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[v2-gen] job failed', job.id, job.kind, message);
      }
    }
  }
  console.info(`[v2-gen:batch] end worker=${workerId} processed=${processed}`);
  return processed;
}

/**
 * Drain ready jobs until idle (for admin `after()`). Retries a few empty
 * rounds so dependents that become ready after a finish are claimed without
 * needing a separate `v2:worker` process.
 */
export async function runWorkerUntilIdle(
  workerId: string,
  opts?: { maxEmptyRounds?: number; idleMs?: number; deadlineMs?: number },
): Promise<number> {
  const maxEmpty = opts?.maxEmptyRounds ?? 3;
  const idleMs = opts?.idleMs ?? 2000;
  const deadline =
    opts?.deadlineMs != null ? Date.now() + opts.deadlineMs : null;
  let total = 0;
  let empty = 0;
  console.info(`[v2-gen:drain] start worker=${workerId}`);
  while (empty < maxEmpty) {
    if (deadline != null && Date.now() >= deadline) {
      console.info(`[v2-gen:drain] deadline hit worker=${workerId} total=${total}`);
      break;
    }
    const n = await runWorkerBatch(workerId);
    total += n;
    if (n === 0) {
      empty += 1;
      if (empty < maxEmpty) {
        await new Promise((r) => setTimeout(r, idleMs));
      }
    } else {
      empty = 0;
    }
  }
  console.info(`[v2-gen:drain] end worker=${workerId} total=${total}`);
  return total;
}

export async function processLessonJob(
  job: JobView,
  workerId: string,
): Promise<void> {
  const { jobCallContext, logLastFailedPrompt } = await import(
    './lesson/jobs/call'
  );
  console.info(
    `[v2-gen:job] start id=${job.id} kind=${job.kind} day=${job.day} v=${job.version}${
      job.page_id ? ` page=${job.page_id}` : ''
    }`,
  );

  const heartbeatTimer = setInterval(() => {
    void heartbeat(job.id, workerId);
  }, 60_000);

  try {
    await markJobStarted(job.id);
    await jobCallContext.run(
      {
        jobId: job.id,
        day: job.day,
        version: job.version,
        page_id: job.page_id,
      },
      async () => {
        try {
          await processLessonJobBody(job, workerId);
        } catch (err) {
          logLastFailedPrompt(err);
          throw err;
        }
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishJobFailed(job.id, message);
    throw err;
  } finally {
    clearInterval(heartbeatTimer);
  }
}

async function processLessonJobBody(
  job: JobView,
  _workerId: string,
): Promise<void> {
  const yesterday = await loadYesterdayDigest(job.day, job.target_lang);
    const brief = buildLessonBrief(getDayPlan(job.day), { yesterday });
    await setDraftHandoff({
      day: job.day,
      targetLang: job.target_lang,
      version: job.version,
      key: 'brief',
      value: brief,
    });

    const draft = await loadDraftData(job.day, job.version, job.target_lang);
    const dayPlan = getDayPlan(job.day);
    const gen = dayPlan.generation ?? {};

    switch (job.kind) {
      case 'items': {
        const knownFull = await loadKnownItemMap({
          day: job.day,
          targetLang: job.target_lang,
        });
        const pool = [...knownFull.values()]
          .map((it) => ({
            id: it.id,
            type: it.type,
            tl: 'tl' in it && typeof it.tl === 'string' ? it.tl : '',
          }))
          .filter((r) => r.tl);
        const missingRecycle = brief.recycle_ids.filter(
          (id) => !knownFull.has(id),
        );
        if (missingRecycle.length) {
          brief.warnings.push(
            `recycle_not_in_known: ${missingRecycle.join(', ')}`,
          );
          await setDraftHandoff({
            day: job.day,
            targetLang: job.target_lang,
            version: job.version,
            key: 'brief',
            value: brief,
          });
        }
        const known = selectKnownForDay({
          pool,
          coreWords: brief.core_items_tl,
          earlyChunks: brief.early_chunks_tl,
          recycleIds: brief.recycle_ids,
        });
        const result = await runItemsJob({ brief, known, knownFull });
        if (result.fatals?.length) {
          throw new Error(
            result.fatals.map((f) => `${f.rule}: ${f.message}`).join('; '),
          );
        }
        const knownIds = new Set(known.map((k) => k.id));
        const digest = buildItemDigest({
          items: result.items,
          earlyChunks: brief.early_chunks_tl,
          recycleIds: brief.recycle_ids,
          knownIds,
          coreIds: new Set(brief.core_items.map((c) => c.id)),
          coreTlById: coreTlById(job.day),
        });
        await updateDraftFields({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          fields: { items: result.items },
        });
        await setDraftHandoff({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          key: 'items',
          value: digest,
        });
        const outlineHash = hashOutlineJob(
          brief,
          itemsAsKnown(result.items),
          gen.page_plan ?? [],
        );
        await V2JobModel().updateOne(
          {
            day: job.day,
            target_lang: job.target_lang,
            version: job.version,
            kind: 'outline',
          },
          { $set: { input_hash: outlineHash } },
        );
        await finishJobSuccess({
          jobId: job.id,
          provider: result.provider,
          model: result.model,
          timing: result.timing,
          tokens: result.tokens,
          over_budget: result.over_budget,
          input: buildInputMeta({
            brief,
            userBody: result.userBody,
            systemModules: result.systemModules,
          }),
          output: { items: result.items },
          handoff: digest,
          issues: result.issues,
          attempts: [
            {
              attempt: result.retries + 1,
              finished_at: new Date(),
              output: { items: result.items },
              tokens: result.tokens,
              over_budget: result.over_budget,
              provider: result.provider,
              model: result.model,
              usd_estimate: result.timing.usd_estimate,
            },
          ],
          extraProgress: progressFromExtras({
            fatals: result.fatals ?? [],
            fixes: result.fixes ?? [],
            warnings: result.warnings ?? [],
            flagged: result.flagged ?? result.issues.length > 0,
            retries: result.retries ?? 0,
            auto_fix_count: result.auto_fix_count ?? 0,
          }),
        });
        if (result.flagged) {
          await updateDraft({
            day: job.day,
            targetLang: job.target_lang,
            version: job.version,
            meta: { flagged: true },
            mergeMeta: true,
          });
        }
        break;
      }
      case 'outline': {
        const items = (draft.items ?? []) as Item[];
        const handoffs = (draft.meta as { handoffs?: Record<string, unknown> })
          ?.handoffs;
        const itemDigest =
          (handoffs?.items as { id: string; type: string; tl: string }[]) ??
          itemsAsKnown(items);
        const result = await runOutlineJob({
          brief,
          items: itemDigest.map((i) => ({
            id: i.id,
            type: i.type,
            tl: i.tl,
          })),
        });
        if (result.fatals?.length) {
          throw new Error(
            result.fatals.map((f) => `${f.rule}: ${f.message}`).join('; '),
          );
        }
        const outline: OutlineResult = {
          ...result.outline,
          items,
        };
        const outlineHandoff = buildOutlineHandoff(outline);
        await updateDraft({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          pack: {
            ...draft,
            outline,
            lesson: {
              id: lessonIdFor(job.day, job.target_lang),
              target_lang: job.target_lang,
              day: job.day,
              kind: 'lesson',
              pages: outline.pages.map((p) => p.page_id),
              situation: outline.lesson?.situation,
              can_do: outline.lesson?.can_do,
              phase: outline.lesson?.phase ?? brief.phase,
              week: outline.lesson?.week ?? brief.week,
            },
            pages: outline.pages.map(() => null),
          },
          meta: { outline, regen_round: 0 },
          mergeMeta: true,
        });
        await setDraftHandoff({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          key: 'outline',
          value: outlineHandoff,
        });
        await expandPageJobs({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          outline,
          items,
        });
        await finishJobSuccess({
          jobId: job.id,
          provider: result.provider,
          model: result.model,
          timing: result.timing,
          tokens: result.tokens,
          over_budget: result.over_budget,
          input: buildInputMeta({
            brief,
            userBody: result.userBody,
            systemModules: result.systemModules,
          }),
          output: outline,
          handoff: outlineHandoff,
          issues: result.issues,
        });
        break;
      }
      case 'page': {
        const outline = (draft.outline ??
          (draft.meta as { outline?: OutlineResult } | undefined)?.outline) as
          | OutlineResult
          | undefined;
        if (!outline) throw new Error('Missing outline for page job');
        const entry = outline.pages.find((p) => p.index === job.page_index);
        if (!entry) throw new Error(`Missing outline entry ${job.page_index}`);
        const items = (draft.items ?? []) as Item[];
        const allowedIds = new Set([...entry.introduces, ...entry.assumes]);
        const allowed = items.filter((i) => allowedIds.has(i.id));
        const { prev, next } = neighborStubs(outline.pages, entry.index);
        const metaPage = (draft.meta ?? {}) as {
          critic_notes?: Record<string, string[]>;
          critic_block_targets?: Record<string, string[]>;
        };
        const blockTargets =
          metaPage.critic_block_targets?.[String(entry.index)] ?? [];
        const pagesArr = (draft.pages as (Page | null)[]) ?? [];
        const existingPage = pagesArr[entry.index] ?? undefined;
        // Collect notes for targeted blocks (pageIndex:blockKey) or legacy page key
        const criticNotes: string[] = [];
        if (blockTargets.length) {
          for (const bk of blockTargets) {
            const notes =
              metaPage.critic_notes?.[`${entry.index}:${bk}`] ?? [];
            criticNotes.push(...notes);
          }
        } else {
          criticNotes.push(
            ...(metaPage.critic_notes?.[String(entry.index)] ?? []),
          );
        }
        const result = await runPageJob({
          brief,
          entry,
          allowedItems: allowed,
          allItems: items,
          prev,
          next,
          criticNotes: criticNotes.length ? criticNotes : undefined,
          existingPage:
            blockTargets.length && existingPage ? existingPage : undefined,
          blockTargets: blockTargets.length ? blockTargets : undefined,
        });
        // Clear one-shot block targets after use
        if (blockTargets.length) {
          await updateDraft({
            day: job.day,
            targetLang: job.target_lang,
            version: job.version,
            meta: {
              critic_block_targets: {
                ...(metaPage.critic_block_targets ?? {}),
                [String(entry.index)]: [],
              },
            },
            mergeMeta: true,
          });
        }
        const digest = buildPageDigest({
          index: entry.index,
          page: result.page,
          taught_eg: result.taught_eg,
        });
        await updateDraftPage({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          pageIndex: entry.index,
          page: result.page,
        });
        await setDraftHandoff({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          key: handoffKey('page', entry.index),
          value: digest,
        });
        await finishJobSuccess({
          jobId: job.id,
          provider: result.provider,
          model: result.model,
          timing: result.timing,
          tokens: result.tokens,
          over_budget: result.over_budget,
          input: buildInputMeta({
            brief,
            userBody: result.userBody,
            systemModules: result.systemModules,
            cachedExampleName: result.cachedExampleName,
          }),
          output: { page: result.page, taught_eg: result.taught_eg },
          handoff: digest,
          issues: result.issues,
          attempts: [
            {
              attempt: result.attempts,
              finished_at: new Date(),
              output: { page: result.page, taught_eg: result.taught_eg },
              tokens: result.tokens,
              over_budget: result.over_budget,
              provider: result.provider,
              model: result.model,
              usd_estimate: result.timing.usd_estimate,
            },
          ],
        });
        break;
      }
      case 'critic': {
        const outline = (draft.outline ??
          (draft.meta as { outline?: OutlineResult } | undefined)?.outline) as
          | OutlineResult
          | undefined;
        if (!outline) throw new Error('Missing outline for critic job');
        const entry = outline.pages.find((p) => p.index === job.page_index);
        if (!entry) throw new Error(`Missing outline entry ${job.page_index}`);
        const items = (draft.items ?? []) as Item[];
        const pages = (draft.pages as (Page | null)[]) ?? [];
        const page = pages[entry.index];
        if (!page) throw new Error(`Missing page ${entry.page_id} for critic`);
        const allowedIds = new Set([...entry.introduces, ...entry.assumes]);
        const allowed = items.filter((i) => allowedIds.has(i.id));
        const result = await runCriticJob({
          brief,
          entry,
          page,
          allowedItems: allowed,
          allItems: items,
        });

        const meta = (draft.meta ?? {}) as {
          critic_regen?: Record<string, number>;
          critic_notes?: Record<string, string[]>;
          critic_block_targets?: Record<string, string[]>;
        };
        const { planBlockCriticRerun } = await import('./lesson/blockCritic');
        const plan = planBlockCriticRerun({
          pageIndex: entry.index,
          page,
          highs: result.high,
          critic_notes: meta.critic_notes,
          critic_regen: meta.critic_regen,
        });

        // High + resolvable block path + first pass → block regen; critic waits.
        if (plan.targets.length > 0) {
          await updateDraft({
            day: job.day,
            targetLang: job.target_lang,
            version: job.version,
            meta: {
              critic_notes: plan.meta.critic_notes,
              critic_regen: plan.meta.critic_regen,
              critic_block_targets: {
                ...(meta.critic_block_targets ?? {}),
                [String(entry.index)]: plan.targets,
              },
              flagged: true,
            },
            mergeMeta: true,
          });
          const siblings = await listJobsForVersion(
            job.day,
            job.version,
            job.target_lang,
          );
          const pageJob = siblings.find(
            (j) => j.kind === 'page' && j.page_index === entry.index,
          );
          if (pageJob) {
            await requeueJob(pageJob.id);
          }
          await V2JobModel().updateOne(
            { _id: job.id },
            {
              $set: {
                status: 'queued',
                depends_on: pageJob ? [pageJob.id] : job.depends_on,
                'progress.issues': plan.targets.map(
                  (t) =>
                    `critic:page.${entry.index}:block.${t}:requeue ${(plan.notesByBlock[t] ?? []).join('; ')}`,
                ),
              },
              $unset: { worker_id: 1, lease_expires_at: 1, error: 1 },
            },
          );
          break;
        }

        // After regen (or no block targets): deterministically fix dialogue, then warn.
        let finalIssues = result.issues;
        let pageForStore = page;
        const anyBlockRegen = Object.keys(meta.critic_regen ?? {}).some(
          (k) =>
            k.startsWith(`${entry.index}:`) && (meta.critic_regen?.[k] ?? 0) >= 1,
        );
        const dialogueHighs = result.high.filter((i) =>
          /heard phrase|dialogue id|token "|unknown speaker|max_words|dialogue line/i.test(
            i.message,
          ),
        );
        if (dialogueHighs.length > 0 || anyBlockRegen) {
          const fixed = fixDialoguePage(page, items);
          if (fixed.fixes.length) {
            pageForStore = fixed.page;
            await updateDraftPage({
              day: job.day,
              targetLang: job.target_lang,
              version: job.version,
              pageIndex: entry.index,
              page: pageForStore,
            });
            finalIssues = result.issues.filter(
              (i) =>
                !/heard phrase .+ must not appear on a learner line/i.test(
                  i.message,
                ),
            );
          }
        }

        const criticWarnings = [
          ...finalIssues.map((i) => ({
            path: i.path ?? `page.${entry.index}`,
            rule: 'critic',
            message: i.message,
            tier: 'warning' as const,
          })),
          ...plan.unresolvedHighs.map((i) => ({
            path: i.path ?? `page.${entry.index}`,
            rule: 'critic_no_block',
            message: i.message,
            tier: 'warning' as const,
          })),
        ];
        {
          const { mergeCriticIssues } = await import('./lesson/issueResolve');
          const prevIssues = (
            draft.meta as { critic_issues?: import('./lesson/issueResolve').CriticIssueRecord[] }
          )?.critic_issues;
          const critic_issues = mergeCriticIssues(
            prevIssues,
            entry.index,
            finalIssues.map((i) => ({
              path: i.path,
              message: i.message,
              severity: i.severity,
            })),
          );
          const hasUnresolvedHigh = critic_issues.some(
            (i) => i.severity === 'high' && !i.resolved_by,
          );
          await updateDraft({
            day: job.day,
            targetLang: job.target_lang,
            version: job.version,
            meta: {
              critic_notes: plan.meta.critic_notes,
              critic_regen: plan.meta.critic_regen,
              critic_issues,
              flagged: hasUnresolvedHigh,
            },
            mergeMeta: true,
          });
        }
        await setDraftHandoff({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          key: handoffKey('critic', entry.index),
          value: { issues: finalIssues },
        });
        await finishJobSuccess({
          jobId: job.id,
          provider: result.provider,
          model: result.model,
          timing: result.timing,
          tokens: result.tokens,
          over_budget: result.over_budget,
          input: buildInputMeta({
            brief,
            userBody: result.userBody,
            systemModules: result.systemModules,
          }),
          output: { issues: finalIssues },
          handoff: { issues: finalIssues },
          issues: criticWarnings.map(
            (w) => `${w.rule}: ${w.path}: ${w.message}`,
          ),
          extraProgress: progressFromExtras({
            fatals: [],
            fixes: [],
            warnings: criticWarnings,
            flagged: criticWarnings.length > 0,
            retries: 0,
            auto_fix_count: 0,
          }),
        });
        break;
      }
      case 'questions': {
        const outline = draft.outline as OutlineResult;
        const items = (draft.items ?? []) as Item[];
        if (!outline) throw new Error('Missing outline');
        if (job.page_index == null) {
          throw new Error('questions job missing page_index');
        }
        const handoffs = (draft.meta as { handoffs?: Record<string, unknown> })
          ?.handoffs;
        const outlineHandoff = handoffs?.outline as
          | { plan_summary?: { index: number; title: string; introduces: string[] }[] }
          | undefined;
        const itemDigest = handoffs?.items as
          | { id: string; type: string; tl: string; role?: string }[]
          | undefined;
        const pageId =
          job.page_id ??
          outline.pages.find((p) => p.index === job.page_index)?.page_id ??
          `p${job.page_index}`;
        const result = await runQuestionsJob({
          brief,
          outline: { ...outline, items },
          items,
          pageIndex: job.page_index,
          pageId,
          planSummary: outlineHandoff?.plan_summary,
          itemDigest,
        });
        if (result.fatals?.length) {
          throw new Error(
            result.fatals.map((f) => `${f.rule}: ${f.message}`).join('; '),
          );
        }
        // Merge this page's questions into draft
        const prevQs = ((draft.questions as Question[]) ?? []).filter(
          (q) => q.page_index !== job.page_index,
        );
        const mergedQs = [...prevQs, ...result.questions];
        const qDigest = buildQuestionDigest(mergedQs);
        await updateDraftFields({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          fields: { questions: mergedQs },
        });
        await setDraftHandoff({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          key: handoffKey('questions', job.page_index),
          value: buildQuestionDigest(result.questions),
        });
        await setDraftHandoff({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          key: 'questions',
          value: qDigest,
        });
        await V2JobModel().updateOne(
          { _id: job.id },
          {
            $set: {
              input_hash: hashQuestionsJob(
                brief,
                itemsAsKnown(items),
                outline.pages.filter((p) => p.index === job.page_index),
              ),
            },
          },
        );
        await finishJobSuccess({
          jobId: job.id,
          provider: result.provider,
          model: result.model,
          timing: result.timing,
          tokens: result.tokens,
          over_budget: result.over_budget,
          input: buildInputMeta({
            brief,
            userBody: result.userBody,
            systemModules: result.systemModules,
          }),
          output: { questions: result.questions },
          handoff: qDigest,
          issues: result.issues,
          extraProgress: progressFromExtras({
            fatals: result.fatals ?? [],
            fixes: result.fixes ?? [],
            warnings: result.warnings ?? [],
            flagged: result.flagged ?? false,
            retries: result.retries ?? 0,
            auto_fix_count: result.auto_fix_count ?? 0,
          }),
        });
        if (result.flagged) {
          await updateDraft({
            day: job.day,
            targetLang: job.target_lang,
            version: job.version,
            meta: { flagged: true },
            mergeMeta: true,
          });
        }
        break;
      }
      case 'micro': {
        const items = (draft.items ?? []) as Item[];
        const microStep = gen.micro_step;
        const prevMicro = await loadPrevMicroHandoff(
          job.day,
          job.target_lang,
          microStep?.series,
        );
        const result = await runMicroJob({
          brief,
          items,
          phraseDigest: phraseDigest(items),
          prevMicroHandoff: prevMicro,
        });
        // soft issues only
        const mHandoff = buildMicroHandoff({
          series: microStep?.series ?? 'unknown',
          step: microStep?.step ?? 0,
          micro: result.micro,
        });
        await updateDraftFields({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          fields: { micro: result.micro },
        });
        await setDraftHandoff({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          key: 'micro',
          value: mHandoff,
        });
        await V2JobModel().updateOne(
          { _id: job.id },
          {
            $set: {
              input_hash: hashMicroJob(brief, itemsAsKnown(items), microStep),
            },
          },
        );
        await finishJobSuccess({
          jobId: job.id,
          provider: result.provider,
          model: result.model,
          timing: result.timing,
          tokens: result.tokens,
          over_budget: result.over_budget,
          input: buildInputMeta({
            brief,
            userBody: result.userBody,
            systemModules: result.systemModules,
          }),
          output: { micro: result.micro },
          handoff: mHandoff,
          issues: result.issues,
        });
        break;
      }
      case 'daily_use': {
        const items = (draft.items ?? []) as Item[];
        const digest = newAndRecycleDigest({
          items,
          recycleIds: brief.recycle_ids,
        });
        const result = await runDailyUseJob({
          brief,
          items,
          itemDigest: digest,
        });
        // soft issues only
        const lesson = draft.lesson;
        const fields: Record<string, unknown> = {
          speak_prompts: result.speak_prompts,
        };
        if (lesson) {
          fields.lesson = {
            ...lesson,
            can_do: result.can_do ?? lesson.can_do,
          };
        }
        await updateDraftFields({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          fields,
        });
        await setDraftHandoff({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          key: 'daily_use',
          value: digest,
        });
        await V2JobModel().updateOne(
          { _id: job.id },
          {
            $set: {
              input_hash: hashDailyUseJob(
                brief,
                itemsAsKnown(items),
                brief.recycle_ids,
              ),
            },
          },
        );
        await finishJobSuccess({
          jobId: job.id,
          provider: result.provider,
          model: result.model,
          timing: result.timing,
          tokens: result.tokens,
          over_budget: result.over_budget,
          input: buildInputMeta({
            brief,
            userBody: result.userBody,
            systemModules: result.systemModules,
          }),
          output: {
            speak_prompts: result.speak_prompts,
            can_do: result.can_do,
          },
          handoff: digest,
          issues: result.issues,
        });
        break;
      }
      case 'continuity': {
        const outline = draft.outline as OutlineResult | undefined;
        const items = (draft.items ?? []) as Item[];
        if (!outline) {
          await finishJobSuccess({
            jobId: job.id,
            provider: 'code',
            model: 'n/a',
            timing: {
              label: 'continuity',
              duration_ms: 0,
              input_tokens: 0,
              output_tokens: 0,
              usd_estimate: 0,
            },
            tokens: { system: 0, input: 0, output: 0 },
            issues: ['continuity: missing outline (skipped)'],
            extraProgress: {
              auto_fix_count: 0,
              warnings: [
                {
                  path: 'continuity',
                  rule: 'missing_outline',
                  message: 'skipped',
                  tier: 'warning',
                },
              ],
              retries: 0,
              flagged: true,
            },
          });
          break;
        }
        const handoffs = (draft.meta as { handoffs?: Record<string, unknown> })
          ?.handoffs;
        const pageDigests: PageDigest[] = outline.pages
          .map((p) => handoffs?.[handoffKey('page', p.index)] as PageDigest | undefined)
          .filter((d): d is PageDigest => !!d);
        // Fallback thin digests if missing
        const digests =
          pageDigests.length > 0
            ? pageDigests
            : ((draft.pages as (Page | null)[]) ?? [])
                .map((p, i) =>
                  p
                    ? buildPageDigest({ index: i, page: p, taught_eg: '' })
                    : null,
                )
                .filter((d): d is PageDigest => !!d);

        const regenRound = Number(
          (draft.meta as { regen_round?: number } | undefined)?.regen_round ?? 0,
        );
        const result = await runContinuityJob({
          brief,
          pageDigests: digests,
          regenRound,
        });

        // Continuity notes are WARNING only — never requeue pages.
        if (result.regenerate.length > 0 || (result.notes?.length ?? 0) > 0) {
          await updateDraft({
            day: job.day,
            targetLang: job.target_lang,
            version: job.version,
            meta: {
              flagged: true,
            },
            mergeMeta: true,
          });
        }

        await setDraftHandoff({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          key: 'continuity',
          value: {
            regenerate: [],
            notes: result.notes,
            suggested_regen: result.regenerate,
          },
        });
        await V2JobModel().updateOne(
          { _id: job.id },
          {
            $set: {
              input_hash: hashContinuityJob(brief, digests),
            },
          },
        );
        await finishJobSuccess({
          jobId: job.id,
          provider: result.provider,
          model: result.model,
          timing: result.timing,
          tokens: result.tokens,
          over_budget: result.over_budget,
          input: buildInputMeta({
            brief,
            userBody: result.userBody,
            systemModules: result.systemModules,
          }),
          output: {
            regenerate: result.regenerate,
            notes: result.notes,
          },
          handoff: {
            regenerate: result.regenerate,
            notes: result.notes,
          },
        });
        break;
      }
      case 'assemble': {
        const outline = draft.outline as OutlineResult;
        const items = (draft.items ?? []) as Item[];
        if (!outline) throw new Error('Missing outline');
        const knownPool = await loadKnownItems({
          day: job.day,
          targetLang: job.target_lang,
        });
        const allowedIds = new Set<string>([
          ...brief.core_items.map((c) => c.id),
          ...brief.recycle_ids,
          ...knownPool.map((k) => k.id),
        ]);
        const result = runAssembleJob({
          day: job.day,
          targetLang: job.target_lang,
          outline,
          items,
          pages: (draft.pages as (Page | null)[]) ?? [],
          questions: (draft.questions as Question[]) ?? [],
          micro: draft.micro as Micro | undefined,
          speak_prompts: draft.speak_prompts as SpeakPrompt[] | undefined,
          coreIds: brief.core_items.map((c) => c.id),
          allowedIds,
          recycleIds: brief.recycle_ids,
          chatCharacter: brief.chat_character,
        });
        // Persist fixed pages from assemble dialogue fix
        if (result.pack.pages?.length) {
          for (const [i, p] of result.pack.pages.entries()) {
            await updateDraftPage({
              day: job.day,
              targetLang: job.target_lang,
              version: job.version,
              pageIndex: i,
              page: p,
            });
          }
        }
        const introduced = outline.pages
          .flatMap((p) => p.introduces ?? [])
          .filter((id) => !brief.recycle_ids.includes(id));
        const microStep = gen.micro_step
          ? `${gen.micro_step.series}:${gen.micro_step.step}`
          : null;
        const dayDigest = buildDayDigest({
          items,
          rule: brief.rule_eg,
          micro_step: microStep,
          story_beats: gen.story_outline ?? [],
          introduced_ids: [...new Set(introduced)],
        });
        const jobs = await listJobsForVersion(
          job.day,
          job.version,
          job.target_lang,
        );
        const upstream = jobs
          .filter((j) => j.kind !== 'assemble' && j.input_hash)
          .map((j) => j.input_hash!);
        const allJobsForTiming = await listJobsForVersion(
          job.day,
          job.version,
          job.target_lang,
        );
        const calls: CallTiming[] = [];
        for (const j of allJobsForTiming) {
          const prog = j.progress as { timing?: CallTiming } | null;
          if (prog?.timing) calls.push(prog.timing);
        }
        await updateDraft({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          pack: result.pack,
          meta: {
            flagged: result.flagged,
            issues: result.issues,
            // text_ready gated on lang_check job
            text_ready: false,
            timing: calls,
            regen_round:
              (draft.meta as { regen_round?: number } | undefined)?.regen_round ??
              0,
            outline:
              (draft.outline as OutlineResult | undefined) ??
              (draft.meta as { outline?: OutlineResult } | undefined)?.outline,
          },
          mergeMeta: true,
        });
        await setDraftHandoff({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          key: 'assemble',
          value: dayDigest,
        });
        await V2JobModel().updateOne(
          { _id: job.id },
          { $set: { input_hash: hashAssembleJob(upstream) } },
        );
        const allJobs = allJobsForTiming;
        console.info(
          `\n[v2-gen] Day ${job.day} budget table (per-kind budgets; example_tokens excluded from system)`,
        );
        console.info(
          '| kind | page | status | system | input | output | example | cache_r | cache_w | over | ms |',
        );
        console.info('|---|---|---|---:|---:|---:|---:|---:|---:|---|---:|');
        for (const j of allJobs) {
          const prog = j.progress as {
            timing?: CallTiming;
            tokens?: {
              system?: number;
              input?: number;
              output?: number;
              example_tokens?: number;
              cache_read_input_tokens?: number;
              cache_creation_input_tokens?: number;
            };
            over_budget?: boolean;
          } | null;
          const t = prog?.tokens;
          console.info(
            `| ${j.kind} | ${j.page_id ?? '—'} | ${j.status} | ${t?.system ?? '—'} | ${t?.input ?? '—'} | ${t?.output ?? '—'} | ${t?.example_tokens ?? '—'} | ${t?.cache_read_input_tokens ?? '—'} | ${t?.cache_creation_input_tokens ?? '—'} | ${prog?.over_budget ? 'YES' : 'no'} | ${prog?.timing?.duration_ms ?? '—'} |`,
          );
        }
        if (calls.length) printTimingTable(job.day, calls);
        console.info(
          `[v2-gen] day ${job.day} assemble done flagged=${result.flagged} jobs=${allJobs.length}`,
        );
        await finishJobSuccess({
          jobId: job.id,
          provider: 'anthropic',
          model: 'n/a',
          timing: {
            label: 'assemble',
            duration_ms: 0,
            input_tokens: 0,
            output_tokens: 0,
            usd_estimate: 0,
          },
          tokens: { system: 0, input: 0, output: 0 },
          over_budget: false,
          output: { flagged: result.flagged, issues: result.issues },
          handoff: dayDigest,
          issues: result.issues,
        });
        break;
      }
      case 'lang_check': {
        const items = (draft.items ?? []) as Item[];
        const pages = ((draft.pages as (Page | null)[]) ?? []).filter(
          (p): p is Page => Boolean(p),
        );
        const result = await runLangCheckJob({
          brief,
          pages,
          items,
        });
        const { applyLangCheckPatches } = await import(
          './lesson/langCheckApply'
        );
        const {
          resolveCriticIssuesByPatches,
          recomputeFlaggedAfterLangCheck,
        } = await import('./lesson/issueResolve');
        const applied = applyLangCheckPatches(pages, items, result.patches, {
          max: 5,
        });
        const assembleIssues = (
          draft.meta as { issues?: import('@/lib/v2/content/validate').Issue[] }
        )?.issues;
        const hasDialogueFatal = (assembleIssues ?? []).some(
          (i) => i.rule === 'dialogue_check',
        );
        const discardedHighs = applied.discarded;
        const prevCritic = (
          draft.meta as {
            critic_issues?: import('./lesson/issueResolve').CriticIssueRecord[];
          }
        )?.critic_issues ?? [];
        const critic_issues = resolveCriticIssuesByPatches(
          prevCritic,
          applied.applied.map((p) => p.path),
        );
        const flagged = recomputeFlaggedAfterLangCheck({
          critic_issues,
          discardedCount: discardedHighs.length,
          assembleIssues,
        });
        const ready = discardedHighs.length === 0 && !hasDialogueFatal;
        const handoff = {
          patches: result.patches,
          applied: applied.applied,
          discarded: discardedHighs,
          text_ready: ready,
          resolved_critic: critic_issues.filter(
            (i) => i.resolved_by === 'lang_check',
          ).length,
        };
        if (applied.applied.length > 0) {
          await updateDraftFields({
            day: job.day,
            targetLang: job.target_lang,
            version: job.version,
            fields: {
              pages: applied.pages,
              items: applied.items,
            },
          });
        }
        await updateDraft({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          meta: {
            flagged,
            text_ready: ready,
            critic_issues,
            lang_check: handoff,
          },
          mergeMeta: true,
        });
        await setDraftHandoff({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          key: 'lang_check',
          value: handoff,
        });
        await finishJobSuccess({
          jobId: job.id,
          provider: result.provider,
          model: result.model,
          timing: result.timing,
          tokens: result.tokens,
          over_budget: result.over_budget,
          input: buildInputMeta({
            brief,
            userBody: result.userBody,
            systemModules: result.systemModules,
          }),
          output: handoff,
          handoff,
          issues: [
            ...applied.applied.map(
              (p) => `applied: ${p.path}: ${p.reason_eg}`,
            ),
            ...discardedHighs.map(
              (d) => `high: ${d.path}: ${d.rule} ${d.message}`,
            ),
          ],
          extraProgress: progressFromExtras({
            fatals: [],
            fixes: applied.applied.map((p) => ({
              path: p.path,
              rule: 'lang_check_applied',
              message: p.reason_eg,
              tier: 'fix' as const,
            })),
            warnings: discardedHighs.map((d) => ({
              path: d.path,
              rule: d.rule,
              message: d.message,
              tier: 'warning' as const,
            })),
            flagged,
            retries: 0,
            auto_fix_count: applied.applied.length,
          }),
        });
        break;
      }
      default:
        throw new Error(`Unknown job kind ${job.kind}`);
    }
}

export async function getJob(jobId: string) {
  if (!mongoConfigured()) return null;
  await connectMongo();
  const doc = await V2JobModel().findById(jobId);
  if (!doc) return null;
  const { docToJobView } = await import('./lesson/graph');
  return docToJobView(doc);
}

/** Full job document for admin panels. */
export async function getJobDetail(jobId: string) {
  if (!mongoConfigured()) return null;
  await connectMongo();
  const doc = await V2JobModel().findById(jobId).lean();
  if (!doc) return null;
  return {
    id: String(doc._id),
    kind: doc.kind,
    lesson_id: doc.lesson_id,
    day: doc.day,
    target_lang: doc.target_lang,
    version: doc.version,
    page_index: doc.page_index ?? null,
    page_id: doc.page_id ?? null,
    depends_on: (doc.depends_on ?? []).map((id) => String(id)),
    input_hash: doc.input_hash ?? null,
    status: doc.status,
    progress: doc.progress ?? null,
    error: doc.error ?? null,
    provider: doc.provider ?? null,
    model: doc.model ?? null,
    started_at: doc.started_at ?? null,
    finished_at: doc.finished_at ?? null,
    input: doc.input ?? null,
    output: doc.output ?? null,
    handoff: doc.handoff ?? null,
    attempts: doc.attempts ?? [],
    tokens: doc.tokens ?? null,
    over_budget: doc.over_budget ?? false,
    usd_estimate: doc.usd_estimate ?? null,
    issues: doc.issues ?? null,
  };
}

export async function getLatestJobsForDay(day: number, targetLang = 'pt-PT') {
  if (!mongoConfigured()) return [];
  await connectMongo();
  const latest = await V2JobModel()
    .find({ day, target_lang: targetLang, kind: { $exists: true } })
    .sort({ version: -1 })
    .limit(1);
  if (!latest[0]) return [];
  return listJobsForVersion(day, latest[0].version, targetLang);
}

/** @deprecated use getLatestJobsForDay — kept for old callers */
export async function getLatestJobForDay(day: number, targetLang = 'pt-PT') {
  const jobs = await getLatestJobsForDay(day, targetLang);
  const assemble = jobs.find((j) => j.kind === 'assemble');
  return assemble ?? jobs[0] ?? null;
}

export async function claimNextJob(workerId: string): Promise<JobView | null> {
  const batch = await claimReadyJobs(workerId, 1);
  return batch[0] ?? null;
}

export async function claimJobById(
  jobId: string,
  workerId: string,
): Promise<JobView | null> {
  await connectMongo();
  const lease = new Date(Date.now() + LEASE_MS);
  const updated = await V2JobModel().findOneAndUpdate(
    { _id: jobId, status: 'queued' },
    {
      $set: {
        status: 'running',
        worker_id: workerId,
        lease_expires_at: lease,
      },
    },
    { returnDocument: 'after' },
  );
  if (!updated) return null;
  const { docToJobView } = await import('./lesson/graph');
  return docToJobView(updated);
}

export async function reclaimExpiredLeases(): Promise<number> {
  await connectMongo();
  const res = await V2JobModel().updateMany(
    { status: 'running', lease_expires_at: { $lt: new Date() } },
    { $set: { status: 'queued' }, $unset: { worker_id: 1, lease_expires_at: 1 } },
  );
  return res.modifiedCount ?? 0;
}

/** Alias for processLessonJob (legacy name). */
export const processGenerateJob = processLessonJob;

export function summarizeJobGraph(jobs: JobView[]): {
  status: 'queued' | 'running' | 'done' | 'failed' | 'stale';
  version: number | null;
  text_ready: boolean;
  stale_count: number;
  failed_count: number;
} {
  if (jobs.length === 0) {
    return {
      status: 'queued',
      version: null,
      text_ready: false,
      stale_count: 0,
      failed_count: 0,
    };
  }
  const version = jobs[0]!.version;
  const stale_count = jobs.filter((j) => j.status === 'stale').length;
  const failed_count = jobs.filter((j) => j.status === 'failed').length;
  if (failed_count > 0) {
    return { status: 'failed', version, text_ready: false, stale_count, failed_count };
  }
  if (stale_count > 0) {
    return { status: 'stale', version, text_ready: false, stale_count, failed_count };
  }
  const langCheck = jobs.find((j) => j.kind === 'lang_check');
  const assemble = jobs.find((j) => j.kind === 'assemble');
  if (langCheck?.status === 'done') {
    const out = (langCheck.output ?? langCheck.handoff ?? {}) as {
      text_ready?: boolean;
      discarded?: unknown[];
    };
    const text_ready =
      typeof out.text_ready === 'boolean'
        ? out.text_ready
        : !Array.isArray(out.discarded) || out.discarded.length === 0;
    return {
      status: 'done',
      version,
      text_ready,
      stale_count,
      failed_count,
    };
  }
  // Legacy graphs without lang_check: assemble alone was ready.
  if (!langCheck && assemble?.status === 'done') {
    return { status: 'done', version, text_ready: true, stale_count, failed_count };
  }
  if (jobs.some((j) => j.status === 'running')) {
    return { status: 'running', version, text_ready: false, stale_count, failed_count };
  }
  return { status: 'queued', version, text_ready: false, stale_count, failed_count };
}

export {
  listJobsForVersion,
  requeueJob,
  requeueStale,
  printTimingTable,
  claimReadyJobs,
};
export type { JobView } from './lesson/graph';
export type { LessonPack } from '@/lib/v2/content/lesson';
