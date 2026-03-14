"use client";
import type { MarketBucket } from "@/lib/polymarket";

type Props = { buckets: MarketBucket[]; eventUrl: string; unit: "F" | "C" };

export default function MarketChart({ buckets, eventUrl, unit }: Props) {
  if (!buckets || buckets.length === 0) return (
    <div style={{ fontSize:11, color:"var(--color-text-tertiary)", padding:"16px 0" }}>No market data available</div>
  );

  // Top bucket = highest yesPrice
  const topBucket = buckets.reduce((a, b) => b.yesPrice > a.yesPrice ? b : a, buckets[0]);
  const chartH = 120;
  // Y axis: 0, 25, 50, 75, 100¢
  const yTicks = [100, 75, 50, 25, 0];

  // Add unit to label if not already there
  function labelWithUnit(label: string): string {
    if (!label) return label;
    // Already has °F or °C
    if (label.includes('°F') || label.includes('°C')) return label;
    // Add unit before the degree sign if present
    if (label.includes('°')) return label.replace('°', `°${unit}`);
    return label;
  }

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
        <h2 style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.15em", color:"var(--color-text-tertiary)", margin:0, fontWeight:400 }}>Market</h2>
        <a href={eventUrl} target="_blank" rel="noopener noreferrer"
          style={{ fontSize:11, color:"var(--color-text-tertiary)", textDecoration:"none" }}>↗</a>
      </div>

      <div style={{ display:"flex", gap:8 }}>
        {/* Y axis */}
        <div style={{ display:"flex", flexDirection:"column", justifyContent:"space-between", paddingBottom:20, minWidth:28, textAlign:"right" }}>
          {yTicks.map(t => (
            <span key={t} style={{ fontSize:9, fontFamily:"monospace", color:"var(--color-text-tertiary)", lineHeight:1 }}>{t}¢</span>
          ))}
        </div>

        {/* Chart */}
        <div style={{ flex:1, minWidth:0 }}>
          {/* Bars */}
          <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:chartH, position:"relative", borderBottom:"1px solid var(--color-rule)" }}>
            {/* Grid lines */}
            {yTicks.filter(t => t > 0).map(t => (
              <div key={t} style={{
                position:"absolute", left:0, right:0,
                bottom:`${(t/100)*chartH}px`,
                borderTop:"1px solid rgba(255,255,255,0.04)"
              }} />
            ))}
            {buckets.map(bucket => {
              const isTop = bucket.conditionId === topBucket.conditionId;
              const barH  = Math.max((bucket.yesPrice) * chartH, 1);
              return (
                <a key={bucket.conditionId || bucket.label}
                  href={eventUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-end", flex:1, height:"100%", textDecoration:"none" }}
                  title={`${bucket.question}\n${Math.round(bucket.yesPrice*100)}¢`}>
                  <div style={{
                    width:"100%", height:`${barH}px`,
                    background: isTop ? "var(--color-accent)" : "var(--color-text-tertiary)",
                    opacity: isTop ? 1 : 0.4,
                    borderRadius:"1px 1px 0 0"
                  }} />
                </a>
              );
            })}
          </div>

          {/* X labels */}
          <div style={{ display:"flex", gap:2, marginTop:4 }}>
            {buckets.map(bucket => {
              const isTop = bucket.conditionId === topBucket.conditionId;
              return (
                <div key={(bucket.conditionId||bucket.label)+"l"}
                  style={{ flex:1, textAlign:"center", fontSize:9, fontFamily:"monospace",
                    color: isTop ? "var(--color-accent)" : "var(--color-text-tertiary)",
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                    fontWeight: isTop ? 600 : 400
                  }}>
                  {labelWithUnit(bucket.label)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}