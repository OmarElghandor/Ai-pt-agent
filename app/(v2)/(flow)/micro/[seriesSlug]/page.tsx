import { Suspense } from 'react';
import { ScreenLoading } from '@/components/v2/ScreenLoading';
import { MicroSeriesPlayer } from '@/components/v2/micro/MicroSeriesPlayer';

export default function MicroSeriesPage() {
  return (
    <Suspense fallback={<ScreenLoading label="بيحمّل اللقطة…" />}>
      <MicroSeriesPlayer />
    </Suspense>
  );
}
