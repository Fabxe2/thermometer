// app/components/ObsLog.tsx
// Lista compacta de observaciones METAR de las ultimas 24h
// Muestra: hora local | temperatura | barra proporcional | indicador live/METAR

import type { HourlyPoint } from "../../lib/weather";
import { cToF } from "../../lib/cities";

type Props = {
  obsHourly: HourlyPoint[];
  unit: "F" | "C";
  timezone: string;
  currentTemp: number | null;  // tempC del METAR actual
  currentTime: string;         // observedAt del METAR actual
};

function toDisplay(tempC: number, unit: "F" | "C"): number {
  return unit === "F" ? cToF(tempC) : Math.round(tempC);
}

export default function ObsLog({ obsHourly, unit, timezone, currentTemp, currentTime }: Props) {
  if (!obsHourly.length && currentTemp === null) return null;

  // Construir lista: METAR actual + historial, mas reciente primero
  type Entry = { time: string; tempC: number; isLive: boolean };
  const entries: Entry[] = [];

  if (currentTemp !== null && currentTime) {
    entries.push({ time: currentTime, tempC: currentTemp, isLive: true });
  }

  // Historial: convertir a hora local legible, mas reciente primero
  const hist = [...obsHourly].reverse();
  for (const pt of hist) {
    try {
      const isoStr = pt.time.includes('Z') || pt.time.includes('+')
        ? pt.time
        : pt.time + 'Z'; // asumir UTC si no hay offset
      const date = new Date(isoStr);
      const localTime = date.toLocaleTimeString('en-US', {
        timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true
      });
      entries.push({ time: localTime, tempC: pt.tempC, isLive: false });
    } catch {
      // ignorar entradas malformadas
    }
  }

  if (!entries.length) return null;

  // Rango para las barras proporcionales
  const allTemps = entries.map(e => toDisplay(e.tempC, unit));
  const minT = Math.min(...allTemps);
  const maxT = Math.max(...allTemps);
  const range = maxT - minT || 1;

  const ROW: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 12,
    padding: "6px 0",
    borderBottom: "0.5px solid rgba(255,255,255,0.06)",
  };
  const TIME: React.CSSProperties = {
    fontSize: 11, fontFamily: "monospace",
    color: "rgba(255,255,255,0.35)", minWidth: 60, flexShrink: 0,
  };
  const TEMP: React.CSSProperties = {
    fontSize: 13, fontWeight: 500, fontFamily: "monospace",
    color: "#fff", minWidth: 46, flexShrink: 0,
  };
  const BAR_WRAP: React.CSSProperties = {
    flex: 1, height: 3, background: "rgba(255,255,255,0.08)",
    borderRadius: 2, overflow: "hidden",
  };

  return (
    <div>
      <div style={{
        fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em",
        color: "rgba(255,255,255,0.3)", marginBottom: 12, fontFamily: "monospace",
      }}>
        Observaciones METAR
      </div>
      <div>
        {entries.slice(0, 12).map((e, i) => {
          const disp = toDisplay(e.tempC, unit);
          const barPct = Math.round(((disp - minT) / range) * 100);
          return (
            <div key={i} style={{ ...ROW, borderBottom: i === entries.slice(0,12).length-1 ? "none" : ROW.borderBottom }}>
              <span style={TIME}>{e.time}</span>
              <span style={TEMP}>{disp}°{unit}</span>
              <div style={BAR_WRAP}>
                <div style={{
                  height: "100%", width: barPct + "%",
                  background: e.isLive ? "#fff" : "rgba(255,255,255,0.45)",
                  borderRadius: 2,
                  minWidth: 4,
                }} />
              </div>
              {e.isLive
                ? <span style={{ fontSize: 10, color: "#4ade80", fontFamily: "monospace", flexShrink: 0 }}>&#9679; live</span>
                : <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "monospace", flexShrink: 0 }}>METAR</span>
              }
            </div>
          );
        })}
      </div>
    </div>
  );
}