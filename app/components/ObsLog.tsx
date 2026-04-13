import type { HourlyPoint } from "../../lib/weather";
import { cToF } from "../../lib/cities";
import type React from "react";

type Props = {
  obsHourly: HourlyPoint[];
  unit: "F" | "C";
  timezone: string;
  currentTemp: number | null;
  currentTime: string;
};

function toD(c: number, u: "F"|"C") { return u==="F" ? cToF(c) : Math.round(c); }

export default function ObsLog({ obsHourly, unit, timezone, currentTemp, currentTime }: Props) {
  type E = { time: string; tempC: number; isLive: boolean };
  const entries: E[] = [];

  if (currentTemp !== null && currentTime) {
    entries.push({ time: currentTime, tempC: currentTemp, isLive: true });
  }

  const hist = [...obsHourly].reverse();
  for (const pt of hist) {
    try {
      const iso = pt.time.includes('Z')||pt.time.includes('+') ? pt.time : pt.time+'Z';
      const t = new Date(iso).toLocaleTimeString('en-US',
        {timeZone:timezone, hour:'numeric', minute:'2-digit', hour12:true});
      entries.push({ time: t, tempC: pt.tempC, isLive: false });
    } catch {}
  }

  if (!entries.length) return null;

  const all = entries.map(e => toD(e.tempC, unit));
  const minT = Math.min(...all), maxT = Math.max(...all), range = maxT - minT || 1;

  return (
    <div>
      <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.15em",
        color:"rgba(255,255,255,0.3)", marginBottom:12, fontFamily:"monospace" }}>
        Observaciones METAR
      </div>
      {entries.slice(0, 12).map((e, i) => {
        const d = toD(e.tempC, unit);
        const pct = Math.round(((d - minT) / range) * 100);
        const isLast = i === Math.min(entries.length, 12) - 1;
        return (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"6px 0",
            borderBottom: isLast ? "none" : "0.5px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize:11, fontFamily:"monospace", color:"rgba(255,255,255,0.35)", minWidth:60, flexShrink:0 }}>
              {e.time}
            </span>
            <span style={{ fontSize:13, fontWeight:500, fontFamily:"monospace", color:"#fff", minWidth:46, flexShrink:0 }}>
              {d}°{unit}
            </span>
            <div style={{ flex:1, height:3, background:"rgba(255,255,255,0.08)", borderRadius:2, overflow:"hidden" }}>
              <div style={{ height:"100%", width:pct+"%", minWidth:4, borderRadius:2,
                background: e.isLive ? "#fff" : "rgba(255,255,255,0.45)" }} />
            </div>
            {e.isLive
              ? <span style={{ fontSize:10, color:"#4ade80", fontFamily:"monospace", flexShrink:0 }}>● live</span>
              : <span style={{ fontSize:10, color:"rgba(255,255,255,0.25)", fontFamily:"monospace", flexShrink:0 }}>METAR</span>
            }
          </div>
        );
      })}
    </div>
  );
}