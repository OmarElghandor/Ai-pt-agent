import { Icon } from '@/components/v2/Icon';

export type ImageSlotVariant =
  | 'thumb'
  | 'flashcard'
  | 'tile'
  | 'deckRow'
  | 'cover'
  | 'avatar';

type Props = {
  variant: ImageSlotVariant;
  src?: string | null;
  alt?: string;
  /** Avatar diameter only (32 / 40 / 56). Ignored for other variants. */
  size?: 32 | 40 | 56;
  className?: string;
  /** Overlay content (e.g. lock icon) instead of the default image glyph. */
  placeholderIcon?: string;
};

const VARIANT: Record<
  Exclude<ImageSlotVariant, 'avatar'>,
  { box: string; radius: string }
> = {
  thumb: {
    box: 'aspect-square w-full',
    radius: 'rounded-[16px]',
  },
  flashcard: {
    box: 'aspect-[4/3] w-full max-h-[280px]',
    radius: 'rounded-[20px]',
  },
  tile: {
    box: 'h-14 w-14 shrink-0',
    radius: 'rounded-[14px]',
  },
  deckRow: {
    box: 'h-16 w-16 shrink-0',
    radius: 'rounded-[14px]',
  },
  cover: {
    box: 'aspect-video w-full',
    radius: 'rounded-[20px]',
  },
};

/**
 * Fixed-aspect image box. Real images use object-fit cover; the placeholder
 * uses the exact same box so layout never jumps (05 · Images: fixed sizes).
 */
export function ImageSlot({
  variant,
  src,
  alt = '',
  size = 40,
  className,
  placeholderIcon = 'image',
}: Props) {
  if (variant === 'avatar') {
    const box =
      size === 32 ? 'h-8 w-8' : size === 56 ? 'h-14 w-14' : 'h-10 w-10';
    return (
      <div
        className={[
          'relative shrink-0 overflow-hidden rounded-full bg-v2-paper-deep',
          box,
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-v2-ink-muted">
            <Icon name={placeholderIcon} size={20} />
          </span>
        )}
      </div>
    );
  }

  const conf = VARIANT[variant];
  return (
    <div
      className={[
        'relative overflow-hidden bg-v2-paper-deep text-v2-ink-muted',
        conf.box,
        conf.radius,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden={!src}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <Icon name={placeholderIcon} size={24} />
        </span>
      )}
    </div>
  );
}
