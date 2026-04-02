'use client';
// Sparkline.tsx — Fase 2
// Línea sólida: observaciones reales METAR
// Línea punteada: modelo DTC recalibrado
// Banda gris: incertidumbre ±sigma
// Línea vertical: hora actual
// Marcador: pico proyectado con confidence

import {
  ComposedChart, Line, Area, ReferenceLine, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import type { ObsPoint, ForecastPoint } from '../lib/weather';

type Props = {
  obsPoints: ObsPoint[];
  forecastPoints: ForecastPoint[];
  unit: 'F' | 'C';
  projectedMax: number;
  projectedMaxHour: number;
  confidence: number;
  sigma: number;
  currentHour: number;
};

const HOUR_LABELS: Record<number, string> = {
  0:'12a', 3:'3a', 6:'6a', 9:'9a', 12:'12p', 15:'3p', 18:'6p', 21:'9p',
};

type ChartEntry = {
  hour: number;
  obs?: number;
  dtc?: number;
  upper?: number;
  lower?: number;
};

export default function Sparkline({
  obsPoints, forecastPoints, unit,
  projectedMax, projectedMaxHour,
  confidence, sigma, currentHour,
}: Props) {

  // Unificar puntos en un array indexado por hora
  const byHour: Record<number, ChartEntry> = {};

  for (const p of obsPoints) {
    const h = Math.round(p.hour * 2) / 2; // redondear a 0.5h
    if (!byHour[h]) byHour[h] = { hour: h };
    byHour[h].obs = p.temp;
  }
  for (const p of forecastPoints) {
    const h = Math.round(p.hour * 2) / 2;
    if (!byHour[h]) byHour[h] = { hour: h };
    byHour[h].dtc   = p.temp;
    byHour[h].upper = p.upper;
    byHour[h].lower = p.lower;
  }

  const data = Object.values(byHour).sort((a, b) => a.hour - b.hour);

  // Rango Y: min lower - padding / max upper + padding
  const allVals = data.flatMap(d => [d.obs, d.upper, d.lower, d.dtc].filter((v): v is number => v != null));
  const yMin = Math.floor(Math.min(...allVals)) - 1;
  const yMax = Math.ceil(Math.max(...allVals)) + 1;

  // Ticks X cada 3 horas
  const xTicks = data.map(d => d.hour).filter(h => h % 3 === 0);

  // Color del confidence
  const confColor = confidence >= 70 ? '#4ade80' : confidence >= 45 ? '#facc15' : '#f87171';

  return (
    <div style={{ width: '100%' }}>
      {/* Header métricas */}
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '8px', fontSize: '11px', color: 'var(--muted)' }}>
        <span>
          Pico proyectado: <strong style={{ color: '#fff', fontSize: '13px' }}>
            {projectedMax}°{unit}
          </strong> ~{projectedMaxHour}h
        </span>
        <span>
          Confianza: <strong style={{ color: confColor }}>{confidence}%</strong>
        </span>
        <span style={{ color: 'var(--faint)' }}>
          ±{sigma}°{unit}
        </span>
      </div>

      {/* Leyenda */}
      <div style={{ display: 'flex', gap: '1.2rem', marginBottom: '6px', fontSize: '10px', color: 'var(--muted)' }}>
        <span><span style={{ color: '#fff', fontWeight: 700 }}>——</span> Observado (METAR)</span>
        <span><span style={{ color: 'rgba(255,255,255,.55)' }}>- - -</span> Modelo DTC</span>
        <span><span style={{ background: 'rgba(255,255,255,.15)', padding: '0 6px', borderRadius: 2 }}>  </span> ±sigma</span>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>

          {/* Banda de incertidumbre ±sigma */}
          <Area
            dataKey="upper" stroke="none"
            fill="rgba(255,255,255,0.07)" fillOpacity={1}
            dot={false} activeDot={false} legendType="none"
            connectNulls
          />
          <Area
            dataKey="lower" stroke="none"
            fill="var(--bg)" fillOpacity={1}
            dot={false} activeDot={false} legendType="none"
            connectNulls
          />

          {/* Línea DTC (punteada) */}
          <Line
            dataKey="dtc"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            activeDot={false}
            connectNulls
          />

          {/* Línea observaciones (sólida blanca) */}
          <Line
            dataKey="obs"
            stroke="#ffffff"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 3, fill: '#fff' }}
            connectNulls
          />

          {/* Línea vertical hora actual */}
          <ReferenceLine
            x={Math.round(currentHour * 2) / 2}
            stroke="rgba(255,255,255,0.25)"
            strokeDasharray="3 3"
            strokeWidth={1}
          />

          {/* Marcador pico proyectado */}
          <ReferenceLine
            x={projectedMaxHour}
            stroke={confColor}
            strokeWidth={1}
            strokeDasharray="2 4"
            label={{ value: `${projectedMax}°`, position: 'top', fill: confColor, fontSize: 10 }}
          />

          <XAxis
            dataKey="hour"
            type="number"
            domain={[0, 24]}
            ticks={xTicks}
            tickFormatter={h => HOUR_LABELS[h] ?? ''}
            tick={{ fill: 'var(--muted)', fontSize: 10 }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            domain={[yMin, yMax]}
            tickCount={6}
            tick={{ fill: 'var(--muted)', fontSize: 10 }}
            axisLine={false} tickLine={false}
          />
          <Tooltip
            contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,.1)', borderRadius: 6, fontSize: 11 }}
            labelFormatter={h => {
              const hh = Math.floor(Number(h));
              const mm = (Number(h) % 1) * 60;
              return `${String(hh).padStart(2,'0')}:${mm === 0 ? '00' : '30'}`;
            }}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = { obs: 'Obs', dtc: 'DTC', upper: '+σ', lower: '−σ' };
              return [`${value}°${unit}`, labels[name] ?? name];
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}