import { Suspense } from 'react';
import { MicroTopicsHome } from '@/components/v2/micro/MicroTopicsHome';
import { ScreenLoading } from '@/components/v2/ScreenLoading';

export default function MicroTabPage() {
  return (
    <main className="flex flex-1 flex-col gap-3 px-1 pb-4">
      <Suspense fallback={<ScreenLoading label="بنحمّل…" />}>
        <MicroTopicsHome />
      </Suspense>
    </main>
  );
}
