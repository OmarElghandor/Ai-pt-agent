import { FreeTopicsScreen } from '@/components/v2/convo';

export default function TalkPracticePage() {
  return (
    <main className="mx-auto flex w-full max-w-[390px] flex-1 flex-col">
      <FreeTopicsScreen backHref="/talk" title="اتكلّم" />
    </main>
  );
}
