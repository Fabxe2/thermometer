"use client";

export type ChartPoint = { x: number; y: number }; // x: 0..1 (position in 24h day), y: temp

type Props = {
  obs: ChartPoint[];
  forecast: ChartPoint[];
  height?: number;
};

export default function Sparkline({ obs, forecast, height = 160 }: Props) {
  const allY = [...obs, ...forecast].map(p => p.y);
  if (allY.length === 0) return null;

  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);
  const range = maxY - minY || 1;
  const pad = range * 0.1;
  const lo = minY - pad;
  const hi = maxY + pad;
  const span = hi - lo;

  const W = 500;
  const H = height;

  function toSVG(pts: ChartPoint[]): string {
    if (pts.length < 2) return "";
    return pts.map((p, i) => {
      const x = (p.x * W).toFixed(1);
      const y = (H - ((p.y - lo) / span * H)).toFixed(1);
      return (i === 0 ? "M" : "L") + x + "," + y;
    }).join(" ");
  }

  const obsPath   = toSVG(obs);
  const fcastPath = toSVG(forecast);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ width:"100%", height:"100%", overflow:"visible" }}>
      {/* Forecast — dashed, slightly dimmer */}
      {fcastPath && (
        <path d={fcastPath} fill="none"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          strokeLinecap="round" strokeLinejoin="round" />
      )}
      {/* Observations — solid white, on top */}
      {obsPath && (
        <path d={obsPath} fill="none"
          stroke="var(--color-data)"
          strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}