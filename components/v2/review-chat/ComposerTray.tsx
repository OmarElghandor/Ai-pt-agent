'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { ComposerKind } from '@/lib/v2/review-chat/types';
import { AudioPrompt } from './AudioPrompt';
import { ChipRow } from './ChipRow';
import { ChoiceSheet } from './ChoiceSheet';
import { ImageGrid } from './ImageGrid';
import { MicComposer } from './MicComposer';
import { SelfRating } from './SelfRating';
import { TextComposer } from './TextComposer';
import { TileTray } from './TileTray';

type Option = { id: string; label: string; ar?: boolean };

type ImageCell = {
  id: string;
  label: string;
  url?: string | null;
  state?: 'idle' | 'correct' | 'wrong';
};

type Props = {
  composerKind: ComposerKind;
  promptAudio: string;
  imageCells: ImageCell[];
  options: Option[];
  chips: Option[];
  selectedOption: string | null;
  setSelectedOption: (id: string | null) => void;
  closedChipsImmediate: boolean;
  onChipPick: (id: string) => void;
  composerText: string;
  setComposerText: (text: string) => void;
  submitText: (text: string) => void | Promise<void>;
  submitOption: (index: number) => void | Promise<void>;
  requestHint: () => void;
  tiles: string[];
  tileOrder: number[];
  setTileOrder: Dispatch<SetStateAction<number[]>>;
  submitTiles: () => void;
  onCantSpeak: () => void;
  onMicRecorded: () => void;
  selfRateNote: string;
  onSelfRate: (rating: 'said_correct' | 'near' | 'still') => void;
  advance: () => void;
  nextLabel: string;
  footer: string;
};

export function ComposerTray({
  composerKind,
  promptAudio,
  imageCells,
  options,
  chips,
  selectedOption,
  setSelectedOption,
  closedChipsImmediate,
  onChipPick,
  composerText,
  setComposerText,
  submitText,
  submitOption,
  requestHint,
  tiles,
  tileOrder,
  setTileOrder,
  submitTiles,
  onCantSpeak,
  onMicRecorded,
  selfRateNote,
  onSelfRate,
  advance,
  nextLabel,
  footer,
}: Props) {
  return (
    <section className="shrink-0 rounded-t-[24px] border-t border-v2-line bg-v2-paper/95 px-4 pb-safe pt-3 shadow-lg backdrop-blur-md">
      {composerKind === 'image_grid' ? (
        <div className="space-y-3">
          {promptAudio ? <AudioPrompt text={promptAudio} /> : null}
          <ImageGrid
            cells={imageCells.map(({ id, label, url, state }) => ({
              id,
              label,
              url,
              state,
            }))}
            onPick={(_, index) => void submitOption(index)}
          />
        </div>
      ) : null}

      {composerKind === 'choice' ? (
        <ChoiceSheet
          options={options.map((o) => ({
            id: o.id,
            label: o.label,
            tl: !o.ar,
          }))}
          selected={selectedOption}
          onSelect={setSelectedOption}
          onConfirm={() => {
            if (selectedOption != null) {
              void submitOption(Number(selectedOption));
            }
          }}
        />
      ) : null}

      {composerKind === 'chips' ? (
        <ChipRow
          chips={chips.map((c) => ({ id: c.id, label: c.label }))}
          selected={selectedOption}
          onSelect={(id) => {
            setSelectedOption(id);
            if (closedChipsImmediate) onChipPick(id);
          }}
        />
      ) : null}

      {composerKind === 'text' ? (
        <TextComposer
          value={composerText}
          onChange={setComposerText}
          onSubmit={() => void submitText(composerText)}
          onHint={() => requestHint()}
        />
      ) : null}

      {composerKind === 'tiles' ? (
        <TileTray
          tiles={tiles}
          selected={tileOrder}
          onToggle={(i) =>
            setTileOrder((prev) =>
              prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
            )
          }
          onClear={() => setTileOrder([])}
          onConfirm={() => submitTiles()}
          onHint={() => undefined}
        />
      ) : null}

      {composerKind === 'mic' ? (
        <MicComposer
          onCantSpeak={onCantSpeak}
          onRecorded={onMicRecorded}
          note={selfRateNote}
        />
      ) : null}

      {composerKind === 'self_rate' ? (
        <SelfRating onRate={onSelfRate} />
      ) : null}

      {composerKind === 'next' ? (
        <button
          type="button"
          onClick={advance}
          className="mb-2 w-full rounded-2xl bg-v2-primary py-3.5 font-[family-name:var(--font-v2-arabic)] text-base font-bold text-v2-on-primary"
        >
          {nextLabel}
        </button>
      ) : null}

      {composerKind !== 'session_end' && composerKind !== 'round_end' ? (
        <p className="mt-2 text-center font-[family-name:var(--font-v2-arabic)] text-[11px] text-v2-meta">
          {footer}
        </p>
      ) : null}
    </section>
  );
}
