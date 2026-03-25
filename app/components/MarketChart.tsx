"use client";
import type { MarketBucket } from "@/lib/polymarket";

type Props = { buckets: MarketBucket[]; eventUrl: string; unit: "F" | "C" };

export default function MarketChart({ buckets, eventUrl, unit }: Props) {
  if (!buckets || buckets.length === 0) return (
    <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", padding: "16px 0" }}>
      No market data available
    </div>
  );

  const topBucket = buckets.reduce((a, b) => b.yesPrice > a.yesPrice ? b : a, buckets[0]);
  const chartH = 240;
  const yTicks = [100, 75, 50, 25, 0];

  function labelWithUnit(label: string): string {
    if (!label) return label;
    if (label.includes("°F") || label.includes("°C")) return label;
    if (label.includes("°")) return label.replace("°", `°${unit}`);
    return label;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--color-text-tertiary)", margin: 0, fontWeight: 400 }}>Market</h2>
        <a href={eventUrl} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, color: "var(--color-text-tertiary)", textDecoration: "none" }}>↗</a>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {/* Eje Y */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", paddingBottom: 28, minWidth: 32, textAlign: "right" }}>
          {yTicks.map(t => (
            <span key={t} style={{ fontSize: 10, fontFamily: "monospace", color: "var(--color-text-tertiary)", lineHeight: 1 }}>{t}¢</span>
          ))}
        </div>

        {/* Barras */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: chartH, position: "relative", borderBottom: "1px solid var(--color-rule)" }}>
            {/* Grid lines */}
            {yTicks.filter(t => t > 0).map(t => (
              <div key={t} style={{
                position: "absolute", left: 0, right: 0,
                bottom: `${(t / 100) * chartH}px`,
                borderTop: "1px solid rgba(255,255,255,0.05)"
              }} />
            ))}

            {buckets.map(bucket => {
              const isTop = bucket.conditionId === topBucket.conditionId;
              const pct = Math.round(bucket.yesPrice * 100);
              const barH = Math.max(bucket.yesPrice * chartH, 2);
              return (
                <a key={bucket.conditionId || bucket.label}
                  href={eventUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", flex: 1, height: "100%", textDecoration: "none", position: "relative" }}
                  title={`${bucket.question}\n${pct}¢`}>
                  {/* Precio encima de la barra ganadora */}
                  {isTop && pct > 0 && (
                    <span style={{
                      position: "absolute",
                      bottom: barH + 5,
                      fontSize: 10,
                      fontFamily: "monospace",
                      color: "var(--color-accent)",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}>{pct}¢</span>
                  )}
                  <div style={{
                    width: "100%",
                    height: `${barH}px`,
                    background: isTop ? "var(--color-accent)" : "var(--color-text-tertiary)",
                    opacity: isTop ? 1 : 0.35,
                    borderRadius: "2px 2px 0 0",
                    transition: "opacity 0.15s"
                  }} />
                </a>
              );
            })}
          </div>

          {/* Labels eje X */}
          <div style={{ display: "flex", gap: 3, marginTop: 6 }}>
            {buckets.map(bucket => {
              const isTop = bucket.conditionId === topBucket.conditionId;
              return (
                <div key={(bucket.conditionId || bucket.label) + "l"}
                  style={{
                    flex: 1, textAlign: "center",
                    fontSize: 10, fontFamily: "monospace",
                    color: isTop ? "var(--color-accent)" : "var(--color-text-tertiary)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    fontWeight: isTop ? 700 : 400
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
