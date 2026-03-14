"use client";
import type { MarketBucket } from "@/lib/polymarket";
type Props = { buckets: MarketBucket[]; eventUrl: string; };

export default function MarketChart({ buckets, eventUrl }: Props) {
  if (!buckets || buckets.length === 0) return (
    <div style={{ fontSize:11, color:"var(--color-text-tertiary)", padding:"16px 0" }}>No market data available</div>
  );
  const maxPrice = Math.max(...buckets.map(b => b.yesPrice), 0.01);
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
        <h2 style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.15em", color:"var(--color-text-tertiary)", margin:0, fontWeight:400 }}>Market</h2>
        <a href={eventUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:"var(--color-text-tertiary)", textDecoration:"none" }} title="View on Polymarket">↗</a>
      </div>
      <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:80 }}>
        {buckets.map(bucket => {
          const pct = (bucket.yesPrice / maxPrice) * 100;
          return (
            <a key={bucket.conditionId || bucket.label} href={eventUrl} target="_blank" rel="noopener noreferrer"
              style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-end", flex:1, height:"100%", textDecoration:"none" }}
              title={`${bucket.question}\n${Math.round(bucket.yesPrice*100)}¢`}>
              <div style={{ width:"100%", height:`${Math.max(pct,2)}%`, background: bucket.isCurrent ? "var(--color-accent)" : "var(--color-text-tertiary)", opacity: bucket.isCurrent ? 1 : 0.5, borderRadius:"1px 1px 0 0" }} />
            </a>
          );
        })}
      </div>
      <div style={{ display:"flex", gap:2, marginTop:4 }}>
        {buckets.map(bucket => (
          <div key={bucket.conditionId || bucket.label} style={{ flex:1, textAlign:"center", fontSize:9, color: bucket.isCurrent ? "var(--color-accent)" : "var(--color-text-tertiary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {bucket.label}
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:2, marginTop:2 }}>
        {buckets.map(bucket => (
          <div key={(bucket.conditionId || bucket.label)+"p"} style={{ flex:1, textAlign:"center", fontSize:9, color: bucket.isCurrent ? "var(--color-accent)" : "var(--color-text-tertiary)" }}>
            {Math.round(bucket.yesPrice*100)}¢
          </div>
        ))}
      </div>
    </div>
  );
}