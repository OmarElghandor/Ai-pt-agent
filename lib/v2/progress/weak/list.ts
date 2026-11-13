import { V2WeakSpotModel } from '@/lib/v2/mongo/models';
import { getProblem } from '@/lib/v2/progress/problems';
import { MAX_OPEN_SHOWN } from '@/lib/v2/progress/weak/rules';

export type WeakSpotView = {
  problem: string;
  status: 'open' | 'improving' | 'resolved';
  title_tl: string;
  title_ar: string;
  explain_eg: string;
  example: { wrong: string; right: string } | null;
  library_page?: string;
  taught_on_days: number[];
};

export async function listOpenWeakSpots(
  userId: string,
  opts?: { limit?: number; includeImproving?: boolean },
): Promise<WeakSpotView[]> {
  const statuses: WeakSpotView['status'][] = opts?.includeImproving
    ? ['open', 'improving']
    : ['open'];
  const docs = await V2WeakSpotModel()
    .find({
      user_id: userId,
      status: { $in: statuses },
      opened_at: { $ne: null },
    })
    .sort({ last_error_at: -1 })
    .limit(opts?.limit ?? MAX_OPEN_SHOWN)
    .lean();

  return docs.map((d) => {
    const meta = getProblem(d.problem);
    const ex = Array.isArray(d.examples) && d.examples[0]
      ? {
          wrong: String((d.examples[0] as { wrong: string }).wrong),
          right: String((d.examples[0] as { right: string }).right),
        }
      : null;
    return {
      problem: d.problem,
      status: d.status as WeakSpotView['status'],
      title_tl: meta?.title_tl ?? d.problem,
      title_ar: meta?.title_ar ?? d.problem,
      explain_eg: meta?.explain_eg ?? '',
      example: ex,
      library_page: meta?.taught_on.library_page,
      taught_on_days: meta?.taught_on.days ?? [],
    };
  });
}
