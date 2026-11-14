type TalkieSpinnerProps = {
  /** Width in px; height scales from the 120×100 viewBox (~5:4). Default 96. */
  size?: number;
  className?: string;
  /** When true, hide from AT (parent provides the label). */
  decorative?: boolean;
};

/** Animated A-Z Talkie bubble mark used as the brand loading spinner. */
export function TalkieSpinner({
  size = 96,
  className,
  decorative = false,
}: TalkieSpinnerProps) {
  const height = Math.round((size * 100) / 120);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 100"
      width={size}
      height={height}
      className={className}
      role={decorative ? 'presentation' : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : 'Loading'}
    >
      {/* back (mint) bubble */}
      <g fill="#2FC79A">
        <rect x="26" y="22" width="78" height="56" rx="28" />
        <path
          d="M86 70 L99 86 L99 64 Z"
          stroke="#2FC79A"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </g>

      {/* main (dark) bubble */}
      <g className="azt-spinner-bubble-main" fill="#04524A">
        <rect x="8" y="16" width="86" height="58" rx="29" />
        <path
          d="M22 66 L18 88 L46 72 Z"
          stroke="#04524A"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </g>

      {/* sound wave bars */}
      <rect
        className="azt-spinner-bar azt-spinner-bar-1"
        x="28.5"
        y="40"
        width="5"
        height="10"
        rx="2.5"
      />
      <rect
        className="azt-spinner-bar azt-spinner-bar-2"
        x="38.5"
        y="35"
        width="5"
        height="20"
        rx="2.5"
      />
      <rect
        className="azt-spinner-bar azt-spinner-bar-3"
        x="48.5"
        y="29"
        width="5"
        height="32"
        rx="2.5"
      />
      <rect
        className="azt-spinner-bar azt-spinner-bar-4"
        x="58.5"
        y="35"
        width="5"
        height="20"
        rx="2.5"
      />
      <rect
        className="azt-spinner-bar azt-spinner-bar-5"
        x="68.5"
        y="40"
        width="5"
        height="10"
        rx="2.5"
      />

      {/* sparkle lines */}
      <line
        className="azt-spinner-spark"
        x1="88"
        y1="12"
        x2="91"
        y2="3"
      />
      <line
        className="azt-spinner-spark azt-spinner-spark-2"
        x1="97"
        y1="17"
        x2="105"
        y2="9"
      />
      <line
        className="azt-spinner-spark azt-spinner-spark-3"
        x1="101"
        y1="25"
        x2="111"
        y2="21"
      />
    </svg>
  );
}
