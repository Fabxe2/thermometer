"use client";
import { Bucket } from "../../lib/polymarket";

type Props = { buckets: Bucket[]; eventUrl: string; unit: "F"|"C"; };

export default function MarketChart({ buckets, eventUrl, unit }: Props) {
  if (!buckets.length) return null;
  const sorted = [...buckets].sort((a, b) => b.yesPrice - a.yesPrice);
  const max = sorted[0];
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <h2 style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.15em", color:"var(--color-text-tertiary)", fontWeight:400, marginBottom:12 }}>
        Market{eventUrl && <a href={eventUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft:6, fontSize:10, color:"var(--color-accent)", textDecoration:"none" }}>&#x2197;</a>}
      </h2>
      <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"space-around", gap:6 }}>
        {sorted.map((b, i) => {
          const pct = Math.round(b.yesPrice * 100);
          const isTop = b === max;
          return (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ fontSize:10, fontFamily:"monospace", color:"var(--color-text-tertiary)", minWidth:52, textAlign:"right", whiteSpace:"nowrap" }}>{b.label}</div>
              <div style={{ flex:1, height:24, background:"rgba(255,255,255,0.06)", borderRadius:2, overflow:"hidden", position:"relative" }}>
                <div style={{ height:"100%", width:pct+"%", background:isTop?"rgba(232,184,109,0.75)":"rgba(255,255,255,0.2)", borderRadius:2 }} />
                <span style={{ position:"absolute", right:6, top:"50%", transform:"translateY(-50%)", fontSize:10, fontFamily:"monospace", color:isTop?"var(--color-accent)":"var(--color-text-secondary)", fontWeight:isTop?600:400 }}>{pct}c</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
