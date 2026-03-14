"use client";

type Props = {
  obs: number[];       // observaciones reales — línea sólida blanca
  forecast: number[];  // forecast NWS — línea punteada blanca
  width?: number;
  height?: number;
};

function buildPath(data: number[], minV: number, maxV: number, w: number, h: number): string {
  if (data.length < 2) return "";
  const range = maxV - minV || 1;
  const stepX = w / (data.length - 1);
  return data.map((v, i) => {
    const x = i * stepX;
    const y = h - ((v - minV) / range) * h;
    return (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
  }).join(" ");
}

export default function Sparkline({ obs, forecast, width = 500, height = 120 }: Props) {
  const all = [...obs, ...forecast].filter(v => !isNaN(v));
  if (all.length === 0) return null;

  const minV = Math.min(...all);
  const maxV = Math.max(...all);
  // Add 5% padding
  const pad  = (maxV - minV) * 0.05 || 1;
  const lo   = minV - pad;
  const hi   = maxV + pad;

  const obsPath  = buildPath(obs,      lo, hi, width, height);
  const forePath = buildPath(forecast, lo, hi, width, height);

  // Y axis ticks — 4 nice round values
  const step   = Math.ceil((hi - lo) / 4 / 2) * 2;
  const start  = Math.ceil(lo / step) * step;
  const yTicks = Array.from({ length: 5 }, (_, i) => start + i * step).filter(t => t >= lo && t <= hi);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: "100%", overflow: "visible" }}
    >
      {/* Forecast line — dashed */}
      {forePath && (
        <path
          d={forePath}
          fill="none"
          stroke="var(--color-text-secondary)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {/* Observations line — solid, on top */}
      {obsPath && (
        <path
          d={obsPath}
          fill="none"
          stroke="var(--color-data)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}