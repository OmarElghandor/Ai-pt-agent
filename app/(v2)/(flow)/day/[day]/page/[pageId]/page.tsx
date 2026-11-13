import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ItemViewer } from '@/components/v2/player/ItemViewer';
import { PagePlayer } from '@/components/v2/player/PagePlayer';
import { RealWorldPlayer } from '@/components/v2/player/RealWorldPlayer';
import { SectionsPage } from '@/components/v2/player/SectionsPage';
import { StoryPlayer } from '@/components/v2/player/StoryPlayer';
import { VocabFlowPlayer } from '@/components/v2/player/VocabFlowPlayer';
import {
  getLatestLessonPack,
  getPublishedLesson,
} from '@/lib/v2/content/getPublishedLesson';
import { findImageStepVisible } from '@/lib/v2/findImage/buildRounds';
import { getStoryById } from '@/lib/v2/generation/lesson/storySave';
import { buildPlayerLesson } from '@/lib/v2/render/forms';

export default async function LessonPlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ day: string; pageId: string }>;
  searchParams: Promise<{ dev?: string }>;
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

  const withDev = (href: string) => {
    if (!dev) return href;
    return href.includes('?') ? `${href}&dev=1` : `${href}?dev=1`;
  };

  // After intro → first detail; after last detail → find-image (if shown) → questions
  let nextHref: string | null = null;
  if (nextPage && nextPage.role !== 'test') {
    nextHref = withDev(`/day/${day}/page/${nextPage.id}`);
  } else if (findImageStepVisible(view.items)) {
    nextHref = withDev(`/day/${day}/find-image`);
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
        situationEg={situationEg}
        titleTl={titleTl}
        nextHref={nextHref}
        story={storyDoc}
        storyId={storyId}
      />
    );
  }

  if (page.preset === 'real_world') {
    return (
      <RealWorldPlayer
        day={view.day}
        page={page}
        items={view.items}
        situationEg={situationEg}
        titleTl={titleTl}
        nextHref={nextHref}
      />
    );
  }

  if (
    page.preset === 'vocab_flow' &&
    page.mode === 'static' &&
    page.blocks.some((b) => b.type === 'cards')
  ) {
    return (
      <VocabFlowPlayer
        day={view.day}
        page={page}
        items={view.items}
        situationEg={situationEg}
        titleTl={titleTl}
        nextHref={nextHref}
        story={storyDoc}
      />
    );
  }

  const useItemViewer =
    page.mode === 'static' &&
    (page.preset === 'dictionary' || page.preset === 'phrases') &&
    page.blocks.some((b) => b.type === 'cards');

  if (useItemViewer) {
    return (
      <ItemViewer
        day={view.day}
        page={page}
        items={view.items}
        situationEg={situationEg}
        titleTl={titleTl}
        nextHref={nextHref}
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
    />
  );
}
