import { notFound } from 'next/navigation';
import {
  AudioButton,
  CalloutBar,
  CaptionBar,
  Chip,
  CompareColumns,
  ExampleRow,
  NoteCard,
  Panel,
  PrimaryButton,
  ProgressBar,
  ProgressDots,
  RichText,
  RuleRow,
  SecondaryButton,
  SkillChip,
  TitleBlock,
} from '@/components/v2';
import { BlockGallery } from '@/components/v2/blocks/gallery';
import { FIXTURE_VERB_IDS } from '@/components/v2/blocks/fixtures';
import { isV2DevAllowed, isV2Enabled } from '@/lib/v2/flags';
import { buildFormMap } from '@/lib/v2/render/forms';

export default function V2DevPage() {
  if (!isV2Enabled() || !isV2DevAllowed()) {
    notFound();
  }

  const forms = buildFormMap(FIXTURE_VERB_IDS);

  return (
    <main className="flex flex-1 flex-col gap-8 overflow-y-auto px-4 py-6 pb-28">
      <header className="space-y-1">
        <h1 className="font-[family-name:var(--font-v2-display-ar)] text-3xl text-v2-primary">
          v2-dev
        </h1>
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          معرض المكوّنات — Warm Editorial · مرجع: O MEU · A MINHA
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-v2-ui)] text-sm font-semibold text-v2-ink-muted">
          TitleBlock
        </h2>
        <TitleBlock
          pill="القواعد"
          title="O MEU · A MINHA"
          subtitle="الملكية — بتاعي وبتاعتها"
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-v2-ui)] text-sm font-semibold text-v2-ink-muted">
          RichText
        </h2>
        <p dir="rtl" className="rounded-v2-row border border-v2-line bg-v2-card p-3 text-start text-lg">
          <RichText
            segments={[
              { text: 'الجبنة', lang: 'ar' },
              { text: ' = ', lang: 'tl' },
              { text: 'o queijo', lang: 'tl', group: 'm', bold: true },
            ]}
          />
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-v2-ui)] text-sm font-semibold text-v2-ink-muted">
          CompareColumns · Panel · RuleRow · ExampleRow
        </h2>
        <CompareColumns>
          <Panel title="SER" group="a" pill="ثابت" countLabel="٣ قواعد">
            <RuleRow
              n={1}
              icon="badge"
              title="الهوية والوصف الثابت"
              body="مين أنت، منين، إيه شغلك."
              active
            />
            <RuleRow
              n={2}
              icon="public"
              title="الأصل والجنسية"
              body="منين أنت، لغتك."
              dimmed
            />
            <p className="mb-1 mt-2 font-[family-name:var(--font-v2-arabic)] text-[11px] font-semibold text-v2-ink">
              أمثلة
            </p>
            <div className="space-y-1.5">
              <ExampleRow
                tl="Eu sou egípcio."
                ar="أنا مصري."
                highlight="sou"
                highlightGroup="verb"
                active
              />
              <ExampleRow
                tl="Ela é portuguesa."
                ar="هي برتغالية."
                highlight="é"
                highlightGroup="verb"
                dimmed
              />
            </div>
          </Panel>

          <Panel title="ESTAR" group="b" pill="مؤقت" countLabel="٣ قواعد">
            <RuleRow
              n={1}
              icon="location_on"
              title="الحالة والمكان"
              body="فين أنت دلوقتي، عامل إيه."
              active
            />
            <RuleRow
              n={2}
              icon="mood"
              title="شعور مؤقت"
              body="تعبان، مبسوط، مستعجل."
              dimmed
            />
            <p className="mb-1 mt-2 font-[family-name:var(--font-v2-arabic)] text-[11px] font-semibold text-v2-ink">
              أمثلة
            </p>
            <div className="space-y-1.5 opacity-20">
              <ExampleRow
                tl="Estou em Lisboa."
                ar="أنا في لشبونة."
                highlight="Estou"
                highlightGroup="verb"
              />
            </div>
          </Panel>
        </CompareColumns>
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-v2-ui)] text-sm font-semibold text-v2-ink-muted">
          Chips · Skills · NoteCard · CalloutBar
        </h2>
        <div className="flex flex-wrap gap-2">
          <Chip group="a">SER</Chip>
          <Chip group="b">ESTAR</Chip>
          <Chip group="verb">sou</Chip>
          <Chip group="m">o</Chip>
          <Chip group="f">a</Chip>
          <SkillChip skill="listening" />
          <SkillChip skill="speaking" />
          <SkillChip skill="reading" />
          <SkillChip skill="writing" />
        </div>
        <NoteCard skill="speaking">صحّح الغلطة دي وبس — صيغة الفعل.</NoteCard>
        <CalloutBar chip="-amos">الصيغة دي للجماعة: نحن.</CalloutBar>
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-v2-ui)] text-sm font-semibold text-v2-ink-muted">
          AudioButton · ProgressDots · ProgressBar · Buttons
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <AudioButton text="Bom dia." lang="pt" showSlow />
          <ProgressDots
            dots={[
              { skill: 'listening', state: 'done' },
              { skill: 'speaking', state: 'current' },
              { skill: 'reading', state: 'todo' },
              { skill: 'writing', state: 'todo' },
            ]}
          />
        </div>
        <ProgressBar value={0.45} label="التقدّم" />
        <div className="flex flex-wrap gap-2">
          <PrimaryButton>ابدأ</PrimaryButton>
          <SecondaryButton>الصفحة كلها</SecondaryButton>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-v2-ui)] text-sm font-semibold text-v2-ink-muted">
          CaptionBar
        </h2>
        <div className="overflow-hidden rounded-v2-card bg-v2-card shadow-[var(--shadow-v2-soft)]">
          <CaptionBar
            tipEg="ESTAR = مؤقت: إنت عامل إيه دلوقتي، وفين."
            chapters={[
              { id: 'ser', label: 'SER', progress: 1 },
              { id: 'estar', label: 'ESTAR', active: true, progress: 0.55 },
              { id: 'ex', label: 'أمثلة' },
              { id: 'rule', label: 'القاعدة' },
            ]}
            speedLabel="1×"
          />
        </div>
      </section>

      <BlockGallery forms={forms} />
    </main>
  );
}
