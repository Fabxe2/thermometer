"use client";
import type { MarketBucket } from "@/lib/polymarket";

type Props = { buckets: MarketBucket[]; eventUrl: string; };

export default function MarketChart({ buckets, eventUrl }: Props) {
  if (!buckets || buckets.length === 0) return (
    <div style={{ fontSize:11, color:"var(--color-text-tertiary)", padding:"16px 0" }}>No market data available</div>
  );

  const maxPrice  = Math.max(...buckets.map(b => b.yesPrice), 0.01);
  // Top bucket = highest yesPrice (most likely outcome)
  const topBucket = buckets.reduce((a, b) => b.yesPrice > a.yesPrice ? b : a, buckets[0]);

  // Y axis ticks: 0, 20, 40, 60, 80 cents
  const yTicks = [80, 60, 40, 20, 0];
  const chartH = 120;
  const chartW = "100%";

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
        <h2 style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.15em", color:"var(--color-text-tertiary)", margin:0, fontWeight:400 }}>Market</h2>
        <a href={eventUrl} target="_blank" rel="noopener noreferrer"
          style={{ fontSize:11, color:"var(--color-text-tertiary)", textDecoration:"none" }}
          title="View on Polymarket">↗</a>
      </div>

      {/* Chart area with Y axis */}
      <div style={{ display:"flex", gap:8 }}>
        {/* Y axis labels */}
        <div style={{ display:"flex", flexDirection:"column", justifyContent:"space-between", paddingBottom:20, minWidth:24 }}>
          {yTicks.map(t => (
            <span key={t} style={{ fontSize:9, fontFamily:"monospace", color:"var(--color-text-tertiary)", lineHeight:1 }}>{t}¢</span>
          ))}
        </div>

        {/* Bars + X labels */}
        <div style={{ flex:1, minWidth:0 }}>
          {/* Bars */}
          <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:chartH, position:"relative", borderBottom:"1px solid var(--color-rule)" }}>
            {/* Y grid lines */}
            {yTicks.map(t => (
              <div key={t} style={{
                position:"absolute", left:0, right:0,
                bottom:`${(t/100)*chartH}px`,
                borderTop: t === 0 ? "none" : "1px solid rgba(255,255,255,0.05)"
              }} />
            ))}
            {buckets.map(bucket => {
              const isTop   = bucket.conditionId === topBucket.conditionId;
              const barH    = Math.max((bucket.yesPrice / 1) * chartH, 1);
              return (
                <a key={bucket.conditionId || bucket.label}
                  href={eventUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-end", flex:1, height:"100%", textDecoration:"none" }}
                  title={`${bucket.question}\n${Math.round(bucket.yesPrice*100)}¢`}>
                  <div style={{
                    width:"100%",
                    height:`${barH}px`,
                    background: isTop ? "var(--color-accent)" : "var(--color-text-tertiary)",
                    opacity: isTop ? 1 : 0.45,
                    borderRadius:"1px 1px 0 0",
                    transition:"opacity 0.15s"
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
                <div key={(bucket.conditionId || bucket.label)+"l"}
                  style={{ flex:1, textAlign:"center", fontSize:9, fontFamily:"monospace",
                    color: isTop ? "var(--color-accent)" : "var(--color-text-tertiary)",
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                    fontWeight: isTop ? 600 : 400
                  }}>
                  {bucket.label}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}