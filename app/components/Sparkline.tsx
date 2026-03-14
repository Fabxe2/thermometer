"use client";
import { LineChart, Line, YAxis, ResponsiveContainer } from "recharts";

export type ChartPoint = {
  hour: number;        // 0-23 — hora local del día
  observed?: number;  // temp observada (historia) — línea punteada
  current?: number;   // temp actual — línea sólida
};

type Props = {
  data: ChartPoint[];
  height?: number;
};

export default function Sparkline({ data, height = 180 }: Props) {
  if (!data || data.length === 0) return null;
  
  const vals = data.flatMap(d => [d.observed, d.current].filter((v): v is number => v != null));
  if (vals.length === 0) return null;
  
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = (max - min) * 0.1 || 1;
  const domain: [number, number] = [min - pad, max + pad];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
        <YAxis domain={domain} hide />
        {/* Historia del día — punteada, igual que el original */}
        <Line
          type="monotone"
          dataKey="observed"
          stroke="var(--color-text-secondary)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
          connectNulls={true}
          animationDuration={0}
          isAnimationActive={false}
        />
        {/* Punto actual — sólida blanca */}
        <Line
          type="monotone"
          dataKey="current"
          stroke="var(--color-data)"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
          animationDuration={0}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}