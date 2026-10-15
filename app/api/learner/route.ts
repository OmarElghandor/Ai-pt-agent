import { NextResponse } from 'next/server';
import { warmKnownCache } from '@/lib/knownCache';
import { refreshMongoCatalogue } from '@/lib/lessons/catalogue';
import { learnerView } from '@/lib/learnerView';
import type { CefrLevel } from '@/lib/prompts';
import { dismissLearnerUi, openLearner, setLearnerLevel } from '@/lib/store';

export const runtime = 'nodejs';

const VALID_LEVELS: CefrLevel[] = ['A0', 'A1', 'A2', 'B1'];

function hourFrom(value: unknown): number {
  const hour = Number(value);
  if (Number.isInteger(hour) && hour >= 0 && hour <= 23) return hour;
  return new Date().getHours();
}

async function warmCatalogues(id: string): Promise<void> {
  await Promise.all([
    refreshMongoCatalogue().catch(() => 0),
    warmKnownCache(id).catch(() => null),
  ]);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? '';
  const localHour = hourFrom(url.searchParams.get('localHour'));
  const skipOpener =
    url.searchParams.get('skipOpener') === '1' || url.searchParams.get('skipOpener') === 'true';
  try {
    await warmCatalogues(id);
    const file = openLearner(id, localHour, { skipOpener });
    return NextResponse.json(learnerView(file));
  } catch {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    id?: string;
    action?: 'new' | 'dismiss' | 'level';
    localHour?: number;
    level?: string;
    offTopic?: boolean;
    celebration?: boolean;
  };
  const id = body.id ?? '';
  try {
    await warmCatalogues(id);
    if (body.action === 'new') {
      const file = openLearner(id, hourFrom(body.localHour), { forceNew: true });
      return NextResponse.json(learnerView(file));
    }
    if (body.action === 'level') {
      const level = VALID_LEVELS.includes(body.level as CefrLevel)
        ? (body.level as CefrLevel)
        : 'A0';
      return NextResponse.json(learnerView(setLearnerLevel(id, level)));
    }
    const file = dismissLearnerUi(id, {
      offTopic: body.offTopic,
      celebration: body.celebration,
    });
    return NextResponse.json(learnerView(file));
  } catch {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
}
