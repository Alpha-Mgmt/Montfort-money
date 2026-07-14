export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="mf-g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="var(--grad-from)" />
          <stop offset="1" stopColor="var(--grad-to)" />
        </linearGradient>
      </defs>
      <path
        d="M7 34 L16.5 18 L24 29 L31.5 18 L41 34"
        stroke="url(#mf-g)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="36.5" r="1.9" fill="var(--mint)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="font-display font-semibold tracking-tight text-lg">
        Montfort <span className="text-grad">Money</span>
      </span>
    </span>
  );
}
