"use client";
import { LineChart, Line, YAxis, XAxis, ReferenceLine, ResponsiveContainer } from "recharts";

export type ChartPoint = {
  hour: number;
  observed?: number;
  forecast?: number;
};

type Props = { data: ChartPoint[]; height?: number; };

export default function Sparkline({ data, height = 300 }: Props) {
  if (!data || data.length === 0) return null;
  const vals = data.flatMap(d => [d.observed, d.forecast].filter((v): v is number => v != null));
  if (vals.length === 0) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = (max - min) * 0.12 || 1;
  const domain: [number, number] = [min - pad, max + pad];
  const range = max - min || 1;
  const step = range <= 4 ? 1 : range <= 10 ? 2 : range <= 20 ? 4 : 5;
  const yStart = Math.floor((min - pad) / step) * step;
  const yTicks: number[] = [];
  for (let v = yStart; v <= max + pad; v += step) yTicks.push(Math.round(v));

  const nowH = new Date().getHours();
  const xTicks = [0,3,6,9,12,15,18,21];
  const xLabels: Record<number,string> = {0:'12a',3:'3a',6:'6a',9:'9a',12:'12p',15:'3p',18:'6p',21:'9p'};

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top:4, right:4, left:0, bottom:0 }}>
        <YAxis domain={domain} ticks={yTicks} tick={{ fill:'var(--color-text-tertiary)', fontSize:10, fontFamily:'monospace' }} axisLine={false} tickLine={false} width={28} />
        <XAxis dataKey="hour" type="number" domain={[0,23]} ticks={xTicks}
          tickFormatter={h => xLabels[h] ?? ''}
          tick={{ fill:'var(--color-text-tertiary)', fontSize:10, fontFamily:'monospace' }}
          axisLine={false} tickLine={false} />
        <ReferenceLine x={nowH} stroke="rgba(255,255,255,0.18)" strokeWidth={1} strokeDasharray="3 3" />
        <Line type="monotone" dataKey="forecast" stroke="var(--color-text-secondary)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} />
        <Line type="monotone" dataKey="observed" stroke="var(--color-data)" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
