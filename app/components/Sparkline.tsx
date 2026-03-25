"use client";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine } from "recharts";

export type ChartPoint = {
  hour: number;
  observed?: number;
  forecast?: number;
};

type Props = {
  data: ChartPoint[];
  height?: number;
  unit?: "F" | "C";
};

const X_LABELS: Record<number, string> = {
  0: "12a", 3: "3a", 6: "6a", 9: "9a", 12: "12p", 15: "3p", 18: "6p", 21: "9p"
};

export default function Sparkline({ data, height = 300, unit = "C" }: Props) {
  if (!data || data.length === 0) return null;
  const vals = data.flatMap(d => [d.observed, d.forecast].filter((v): v is number => v != null));
  if (vals.length === 0) return null;

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = (max - min) * 0.15 || 2;
  const domain: [number, number] = [min - pad, max + pad];

  // Hora actual = último punto con observed
  const lastObsHour = data.reduce((acc, d) => d.observed != null ? d.hour : acc, -1);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
        <YAxis domain={domain} hide />
        <XAxis
          dataKey="hour"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fontFamily: "monospace", fill: "var(--color-text-tertiary)" }}
          tickFormatter={(h) => X_LABELS[h] ?? ""}
          interval={0}
        />
        {/* Línea vertical en la hora actual */}
        {lastObsHour >= 0 && (
          <ReferenceLine
            x={lastObsHour}
            stroke="var(--color-text-tertiary)"
            strokeDasharray="2 4"
            strokeWidth={1}
            strokeOpacity={0.4}
          />
        )}
        {/* Forecast — punteada, tenue */}
        <Line
          type="monotone"
          dataKey="forecast"
          stroke="var(--color-text-secondary)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
        {/* Observed — sólida, brillante */}
        <Line
          type="monotone"
          dataKey="observed"
          stroke="var(--color-data)"
          strokeWidth={2}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
