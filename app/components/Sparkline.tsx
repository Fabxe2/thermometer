"use client";
import { LineChart, Line, YAxis, ResponsiveContainer } from "recharts";

export type ChartPoint = {
  hour: number;
  observed?: number;  // real obs — solid bright white line
  forecast?: number;  // forecast — dashed dim line  
};

type Props = {
  data: ChartPoint[];
  height?: number;
};

export default function Sparkline({ data, height = 180 }: Props) {
  if (!data || data.length === 0) return null;
  const vals = data.flatMap(d => [d.observed, d.forecast].filter((v): v is number => v != null));
  if (vals.length === 0) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = (max - min) * 0.1 || 1;
  const domain: [number, number] = [min - pad, max + pad];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
        <YAxis domain={domain} hide />
        {/* Forecast — dashed dim — full 24h */}
        <Line
          type="monotone"
          dataKey="forecast"
          stroke="var(--color-text-secondary)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
          connectNulls={true}
          isAnimationActive={false}
        />
        {/* Observed — solid bright white — real obs only */}
        <Line
          type="monotone"
          dataKey="observed"
          stroke="var(--color-data)"
          strokeWidth={1.5}
          dot={false}
          connectNulls={true}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}