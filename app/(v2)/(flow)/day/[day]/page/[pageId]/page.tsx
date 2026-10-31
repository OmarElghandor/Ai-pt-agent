import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ItemViewer } from '@/components/v2/player/ItemViewer';
import { PagePlayer } from '@/components/v2/player/PagePlayer';
import { SectionsPage } from '@/components/v2/player/SectionsPage';
import { StoryPlayer } from '@/components/v2/player/StoryPlayer';
import {
  getLatestLessonPack,
  getPublishedLesson,
} from '@/lib/v2/content/getPublishedLesson';
import { getStoryById } from '@/lib/v2/generation/lesson/storySave';
import { buildPlayerLesson } from '@/lib/v2/render/forms';

export default async function LessonPlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ day: string; pageId: string }>;
  searchParams: Promise<{ mode?: string; dev?: string }>;
}) {
  const { day: raw, pageId } = await params;
  const sp = await searchParams;
  const day = Number(raw);
  if (!Number.isInteger(day) || day < 1) notFound();

  const dev = sp.dev === '1';
  const published =
    (await getPublishedLesson(day)) ?? (await getLatestLessonPack(day));
  if (!published) {
    return (
      <main className="px-4 py-8">
        <Link href={`/day/${day}`} className="text-sm">
          رجوع
        </Link>
        <p className="mt-4 font-[family-name:var(--font-v2-arabic)]">الدرس مش متاح دلوقتي.</p>
      </main>
    );
  }

  const view = buildPlayerLesson(published.pack);
  const pageIndex = view.pages.findIndex((entry) => entry.id === pageId);
  if (pageIndex < 0) notFound();
  const page = view.pages[pageIndex]!;
  const nextPage = view.pages[pageIndex + 1];
  const isLastPage = pageIndex >= view.pages.length - 1;

  const storyIntro = view.pages.find(
    (p) => p.preset === 'story' && p.role !== 'test',
  );
  const storyPage = storyIntro ?? view.pages.find((p) => p.preset === 'story');
  const storyId =
    page.story_id ??
    published.pack.lesson.story_id ??
    storyPage?.story_id ??
    null;
  const storyDoc = storyId ? await getStoryById(storyId) : null;
  const isStory =
    page.preset === 'story' &&
    (Boolean(storyId) || page.blocks.some((b) => b.type === 'dialogue'));
  // Test reuses page 0 via ?mode=test (no separate pack page).
  const storyMode = sp.mode === 'test' ? 'test' : 'intro';

  const withDev = (href: string) => {
    if (!dev) return href;
    return href.includes('?') ? `${href}&dev=1` : `${href}?dev=1`;
  };

  const storyTestHref = storyPage
    ? withDev(`/day/${day}/page/${storyPage.id}?mode=test`)
    : null;

  // After intro → first detail; after last detail → story test (?mode=test); after test → questions
  let nextHref: string | null = null;
  if (isStory && storyMode === 'intro') {
    nextHref = nextPage
      ? withDev(`/day/${day}/page/${nextPage.id}`)
      : withDev(`/day/${day}/questions`);
  } else if (isStory && storyMode === 'test') {
    nextHref = withDev(`/day/${day}/questions`);
  } else if (nextPage && nextPage.role !== 'test') {
    nextHref = withDev(`/day/${day}/page/${nextPage.id}`);
  } else if (storyTestHref && storyPage && page.id !== storyPage.id) {
    nextHref = storyTestHref;
  } else {
    nextHref = withDev(`/day/${day}/questions`);
  }

  const situationEg = published.pack.lesson.situation?.eg;
  const titleTl = published.pack.lesson.situation?.tl;

  if (isStory) {
    return (
      <StoryPlayer
        day={view.day}
        page={page}
        items={view.items}
        mode={storyMode}
        situationEg={situationEg}
        titleTl={titleTl}
        nextHref={nextHref}
        story={storyDoc}
        storyId={storyId}
      />
    );
  }

  const useItemViewer =
    page.mode === 'static' &&
    (page.preset === 'dictionary' || page.preset === 'phrases') &&
    page.blocks.some((b) => b.type === 'cards');

  if (useItemViewer) {
    const embedded =
      storyPage?.blocks.find((b) => b.type === 'dialogue')?.type === 'dialogue'
        ? (
            storyPage.blocks.find((b) => b.type === 'dialogue') as Extract<
              (typeof storyPage.blocks)[number],
              { type: 'dialogue' }
            >
          ).lines
        : [];
    const storyLines =
      storyDoc?.lines.map((l) => ({
        speaker: l.speaker,
        tl: l.tl,
        ar: l.ar,
        ids: l.ids,
      })) ?? embedded;
    return (
      <ItemViewer
        day={view.day}
        page={page}
        items={view.items}
        situationEg={situationEg}
        titleTl={titleTl}
        nextHref={nextHref}
        storyLines={storyLines || []}
      />
    );
  }

  if (page.mode === 'sections') {
    return (
      <SectionsPage
        day={view.day}
        page={page}
        items={view.items}
        questions={view.questions}
        forms={view.forms}
        nextHref={nextHref}
        isLastPage={isLastPage}
      />
    );
  }

  return (
    <PagePlayer
      day={view.day}
      page={page}
      items={view.items}
      questions={view.questions}
      forms={view.forms}
      nextHref={nextHref}
      isLastPage={isLastPage}
    />
  );
}
