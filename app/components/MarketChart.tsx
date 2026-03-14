"use client";
import type { MarketBucket } from "@/lib/polymarket";
type Props = { buckets: MarketBucket[]; eventUrl: string; };
export default function MarketChart({ buckets, eventUrl }: Props) {
  if (!buckets || buckets.length === 0) return <div style={{ color:"var(--color-text-tertiary)" }} className="text-[11px] py-4">No market data available</div>;
  const maxPrice = Math.max(...buckets.map(b => b.yesPrice), 0.01);
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-[11px] uppercase tracking-[0.15em]" style={{ color:"var(--color-text-tertiary)" }}>Market</h2>
        <a href={eventUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] transition-colors" style={{ color:"var(--color-text-tertiary)" }} title="View on Polymarket">↗</a>
      </div>
      <div className="flex items-end gap-[2px]" style={{ height:80 }}>
        {buckets.map(bucket => {
          const pct = (bucket.yesPrice / maxPrice) * 100;
          return (
            <a key={bucket.conditionId||bucket.label} href={eventUrl} target="_blank" rel="noopener noreferrer"
              className="flex flex-col items-center justify-end flex-1" style={{ height:"100%" }}
              title={`${bucket.question}\n${Math.round(bucket.yesPrice*100)}¢`}>
              <div style={{ width:"100%", height:`${Math.max(pct,2)}%`, background: bucket.isCurrent ? "var(--color-accent)" : "var(--color-text-tertiary)", opacity: bucket.isCurrent ? 1 : 0.5, borderRadius:"1px 1px 0 0" }} />
            </a>
          );
        })}
      </div>
      <div className="flex gap-[2px] mt-1">
        {buckets.map(bucket => (
          <div key={bucket.conditionId||bucket.label} className="flex-1 text-center" style={{ fontSize:"9px", color: bucket.isCurrent ? "var(--color-accent)" : "var(--color-text-tertiary)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
            {bucket.label}
          </div>
        ))}
      </div>
      <div className="flex gap-[2px] mt-1">
        {buckets.map(bucket => (
          <div key={bucket.conditionId||bucket.label} className="flex-1 text-center" style={{ fontSize:"9px", color: bucket.isCurrent ? "var(--color-accent)" : "var(--color-text-tertiary)" }}>
            {Math.round(bucket.yesPrice*100)}¢
          </div>
        ))}
      </div>
    </div>
  );
}