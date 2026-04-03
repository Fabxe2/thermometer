"use client";
import {
  ComposedChart, Line, XAxis, YAxis, ReferenceLine,
  Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

export type ChartPoint = {
  hour: number;
  observed?: number;
  forecast?: number;
};

type Props = { data: ChartPoint[]; height?: number; unit?: "F" | "C"; };

function CustomTooltip({ active, payload, label, unit }: {
  active?: boolean;
  payload?: { dataKey: string; value: number }[];
  label?: number;
  unit?: "F" | "C";
}) {
  if (!active || !payload?.length) return null;
  const h = Number(label ?? 0);
  const hh = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? "AM" : "PM";
  const sym = unit === "F" ? "°F" : "°C";

  const obs   = payload.find(p => p.dataKey === "observed");
  const fcast = payload.find(p => p.dataKey === "forecast");

  return (
    <div style={{
      background:"rgba(10,10,10,0.95)",
      border:"1px solid rgba(255,255,255,0.12)",
      borderRadius:6, padding:"8px 12px",
      fontSize:11, fontFamily:"monospace", lineHeight:1.9,
      pointerEvents:"none",
    }}>
      <div style={{color:"rgba(255,255,255,0.4)", marginBottom:3}}>
        {hh}:00 {ampm}
      </div>
      {obs && (
        <div style={{color:"#ffffff", display:"flex", justifyContent:"space-between", gap:20}}>
          <span>OBS</span>
          <strong>{obs.value}{sym}</strong>
        </div>
      )}
      {fcast && (
        <div style={{color:"rgba(255,255,255,0.45)", display:"flex", justifyContent:"space-between", gap:20}}>
          <span>FCST</span>
          <span>{fcast.value}{sym}</span>
        </div>
      )}
    </div>
  );
}

export default function Sparkline({ data, height = 300, unit = "C" }: Props) {
  if (!data || data.length === 0) return null;
  const vals = data.flatMap(d => [d.observed, d.forecast].filter((v): v is number => v != null));
  if (vals.length === 0) return null;

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = Math.max((max - min) * 0.15, 1.5);
  const domain: [number, number] = [min - pad, max + pad];

  const range = max - min || 1;
  const step = range <= 4 ? 1 : range <= 10 ? 2 : range <= 20 ? 4 : 5;
  const yStart = Math.floor((min - pad) / step) * step;
  const yTicks: number[] = [];
  for (let v = yStart; v <= max + pad + step; v += step) yTicks.push(Math.round(v));

  const nowH = new Date().getHours();
  const xTicks = [0, 3, 6, 9, 12, 15, 18, 21];
  const xLabels: Record<number, string> = {
    0:"12a", 3:"3a", 6:"6a", 9:"9a", 12:"12p", 15:"3p", 18:"6p", 21:"9p"
  };
  const sym = unit === "F" ? "°F" : "°C";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{top:8, right:12, left:0, bottom:0}}>
        <CartesianGrid horizontal vertical={false} stroke="rgba(255,255,255,0.04)" />
        <YAxis
          domain={domain} ticks={yTicks}
          tickFormatter={v => v + sym}
          tick={{fill:"rgba(255,255,255,0.3)", fontSize:10, fontFamily:"monospace"}}
          axisLine={false} tickLine={false} width={38}
        />
        <XAxis
          dataKey="hour" type="number" domain={[0,23]} ticks={xTicks}
          tickFormatter={h => xLabels[h] ?? ""}
          tick={{fill:"rgba(255,255,255,0.3)", fontSize:10, fontFamily:"monospace"}}
          axisLine={false} tickLine={false}
        />
        <Tooltip
          content={<CustomTooltip unit={unit} />}
          cursor={{stroke:"rgba(255,255,255,0.12)", strokeWidth:1}}
        />
        <ReferenceLine
          x={nowH}
          stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="3 3"
          label={{value:"now", position:"top", fill:"rgba(255,255,255,0.25)", fontSize:9, fontFamily:"monospace"}}
        />
        <Line
          type="monotone" dataKey="forecast"
          stroke="rgba(255,255,255,0.4)" strokeWidth={1.5} strokeDasharray="5 4"
          dot={false}
          activeDot={{r:4, fill:"rgba(255,255,255,0.6)", stroke:"none"}}
          connectNulls isAnimationActive={false}
        />
        <Line
          type="monotone" dataKey="observed"
          stroke="#ffffff" strokeWidth={2.5}
          dot={false}
          activeDot={{r:5, fill:"#ffffff", stroke:"rgba(255,255,255,0.3)", strokeWidth:3}}
          connectNulls isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}