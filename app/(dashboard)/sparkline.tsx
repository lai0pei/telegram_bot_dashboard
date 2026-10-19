/**
 * A minimal inline trend line for a stat tile: one series, no axes/legend
 * (the tile's own label names it), 2px stroke per the mark spec, a 4px
 * rounded end-cap on the last point so the current value reads as "now".
 */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const width = 100;
  const height = 28;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;

  const points = values.map((v, i) => [i * step, height - ((v - min) / range) * (height - 4) - 2]);
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = points[points.length - 1] ?? [0, height / 2];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={2.5} fill="var(--primary)" />
    </svg>
  );
}
