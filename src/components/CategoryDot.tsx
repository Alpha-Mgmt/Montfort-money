/**
 * Modern replacement for emoji icons: a small colored dot per category.
 * Color is deterministic from the name — same category, same color,
 * nothing to configure. Muted accents that sit well on both themes.
 */

const PALETTE = [
  "#2bd396", // mint
  "#5aa9e6", // blue
  "#b78af0", // purple
  "#f4b955", // amber
  "#ef8fb5", // pink
  "#53c8c4", // teal
  "#f0925a", // orange
  "#9fb2c4", // slate
];

export function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}

export function CategoryDot({
  name,
  size = 8,
}: {
  name: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: colorFor(name),
      }}
    />
  );
}
