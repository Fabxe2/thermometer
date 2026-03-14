"use client";

export type ChartPoint = { x: number; y: number };

type Props = {
  history: ChartPoint[];  // full day obs from tgftp cycles — DASHED dimmer line
  current: ChartPoint[];  // current observed point(s) — SOLID bright line
  height?: number;
};

export default function Sparkline({ history, current, height = 180 }: Props) {
  const allY = [...history, ...current].map(p => p.y);
  if (allY.length === 0) return null;

  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);
  const range = maxY - minY || 1;
  const pad = range * 0.12;
  const lo = minY - pad;
  const hi = maxY + pad;
  const span = hi - lo;
  const W = 500;
  const H = height;

  function toSVG(pts: ChartPoint[]): string {
    if (pts.length < 1) return "";
    if (pts.length === 1) {
      // Single point — draw a small horizontal tick
      const x = (pts[0].x * W).toFixed(1);
      const y = (H - ((pts[0].y - lo) / span * H)).toFixed(1);
      return `M${parseFloat(x) - 10},${y} L${parseFloat(x) + 10},${y}`;
    }
    return pts.map((p, i) => {
      const x = (p.x * W).toFixed(1);
      const y = (H - ((p.y - lo) / span * H)).toFixed(1);
      return (i === 0 ? "M" : "L") + x + "," + y;
    }).join(" ");
  }

  const histPath    = toSVG(history);
  const currentPath = toSVG(current);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ width:"100%", height:"100%", overflow:"visible" }}>
      {/* History — dashed, dimmer — full day */}
      {histPath && (
        <path d={histPath} fill="none"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          strokeLinecap="round" strokeLinejoin="round" />
      )}
      {/* Current — solid white — marks where we are now */}
      {currentPath && (
        <path d={currentPath} fill="none"
          stroke="var(--color-data)"
          strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}