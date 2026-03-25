import { notFound } from "next/navigation";
import Link from "next/link";
import { getCityBySlug, getLocalTime, cToF } from "@/lib/cities";
import { fetchWeatherData } from "@/lib/weather";
import { fetchPolymarketData } from "@/lib/polymarket";
import Sparkline, { ChartPoint } from "../../components/Sparkline";
import MarketChart from "../../components/MarketChart";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const city = getCityBySlug(slug);
  if (!city) return {};
  return { title: `${city.name} – thermometer` };
}

function toDisplay(tempC: number, unit: "F"|"C"): number {
  return unit === "F" ? cToF(tempC) : Math.round(tempC * 10) / 10;
}
function getHour(iso: string): number {
  const m = iso.match(/T(\d{2}):/); return m ? parseInt(m[1], 10) : -1;
}
function getDate(iso: string): string { return iso.substring(0, 10); }

export default async function CityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const city = getCityBySlug(slug);
  if (!city) notFound();
  const safeCity = city!;
  const unit = safeCity.unit;

  const weatherData = await fetchWeatherData(safeCity);
  const tempDisplay = weatherData.current?.tempDisplay ?? 0;
  const polyData = await fetchPolymarketData(safeCity, tempDisplay);
  const current = weatherData.current;
  const forecast = weatherData.forecast;
  const time = getLocalTime(safeCity.timezone, safeCity.tzAbbr);
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: safeCity.timezone });

  // forecastHourly → punteada (backdrop)
  const fcastMap = new Map<number, number>();
  for (const pt of weatherData.forecastHourly) {
    const h = getHour(pt.time);
    if (h < 0) continue;
    if (!fcastMap.has(h)) fcastMap.set(h, toDisplay(pt.tempC, unit));
  }

  // obsHourly → sólida (observaciones reales)
  const obsMap = new Map<number, number>();
  for (const pt of weatherData.obsHourly) {
    if (getDate(pt.time) !== todayStr) continue;
    const h = getHour(pt.time);
    if (h < 0) continue;
    if (!obsMap.has(h)) obsMap.set(h, toDisplay(pt.tempC, unit));
  }

  const chartData: ChartPoint[] = Array.from({ length: 24 }, (_, h) => {
    const point: ChartPoint = { hour: h };
    if (fcastMap.has(h)) point.forecast = fcastMap.get(h);
    if (obsMap.has(h)) point.observed = obsMap.get(h);
    return point;
  });

  // Eje Y temperatura
  const allY = chartData.flatMap(d => [d.observed, d.forecast].filter((v): v is number => v != null));
  const yMin = allY.length ? Math.min(...allY) : 0;
  const yMax = allY.length ? Math.max(...allY) : 0;
  const yStep = Math.ceil((yMax - yMin) / 4 / 2) * 2 || 2;
  const yStart = Math.floor(yMin / yStep) * yStep;
  const yTicks = Array.from({ length: 6 }, (_, i) => yStart + i * yStep)
    .filter(v => v >= yMin - yStep && v <= yMax + yStep).slice(0, 6);

  const topBucket = polyData.buckets.length > 0
    ? polyData.buckets.reduce((a, b) => b.yesPrice > a.yesPrice ? b : a, polyData.buckets[0])
    : null;

  function labelWithUnit(label: string): string {
    if (!label || label.includes("°F") || label.includes("°C")) return label;
    if (label.includes("°")) return label.replace("°", `°${unit}`);
    return label;
  }

  const wunderUrl = `https://www.wunderground.com/history/daily/${safeCity.wundergroundSlug}`;

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px", minHeight: "100vh" }}>
      <Link href="/" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-text-tertiary)", textDecoration: "none" }}>← All Cities</Link>

      <header style={{ marginTop: 24, marginBottom: 32, paddingBottom: 24, borderBottom: "1px solid var(--color-rule)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
          <h1 style={{ fontSize: 22, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-primary)", margin: 0, fontWeight: 400 }}>{safeCity.name}</h1>
          <span style={{ fontSize: 13, fontFamily: "monospace", color: "var(--color-text-tertiary)" }}>{safeCity.station}</span>
          <span style={{ fontSize: 13, fontFamily: "monospace", color: "var(--color-text-tertiary)" }}>{time}</span>
        </div>
        <div style={{ fontFamily: "monospace", fontSize: "clamp(64px,9vw,88px)", lineHeight: 1, fontWeight: 300, color: "var(--color-data)", marginTop: 12 }}>
          {current ? current.tempDisplay : "—"}
          <span style={{ fontSize: "clamp(28px,4vw,42px)", color: "var(--color-text-secondary)" }}>°{unit}</span>
        </div>
        {current && (
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 6 }}>
            <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--color-text-tertiary)" }}>observed at {current.observedAt}</span>
            {topBucket && (
              <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--color-accent)", fontWeight: 500 }}>
                {labelWithUnit(topBucket.label)} {Math.round(topBucket.yesPrice * 100)}¢
              </span>
            )}
          </div>
        )}
      </header>

      {/* ── Gráfico de temperatura — full width ── */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--color-text-tertiary)", fontWeight: 400, marginBottom: 12, margin: "0 0 12px 0" }}>Temperature</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {/* Eje Y */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 32, textAlign: "right", paddingBottom: 28 }}>
            {[...yTicks].reverse().map(t => (
              <span key={t} style={{ fontSize: 10, fontFamily: "monospace", color: "var(--color-text-tertiary)", lineHeight: 1 }}>{Math.round(t)}</span>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Sparkline data={chartData} height={300} unit={unit} />
          </div>
        </div>
      </section>

      {/* ── Gráfico de mercado — full width ── */}
      <section style={{ marginBottom: 40 }}>
        <MarketChart buckets={polyData.buckets} eventUrl={polyData.eventUrl} unit={unit} />
      </section>

      {/* ── Stats del día ── */}
      {forecast && (
        <div style={{ paddingTop: 24, display: "flex", gap: 32, borderTop: "1px solid var(--color-rule)", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--color-text-tertiary)", marginBottom: 4 }}>Today High</div>
            <div style={{ fontFamily: "monospace", fontSize: 28, fontWeight: 300, color: "var(--color-data)" }}>{Math.round(forecast.maxDisplay)}°{unit}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--color-text-tertiary)", marginBottom: 4 }}>Today Low</div>
            <div style={{ fontFamily: "monospace", fontSize: 28, fontWeight: 300, color: "var(--color-data)" }}>{Math.round(forecast.minDisplay)}°{unit}</div>
          </div>
          {current?.rawMetar && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--color-text-tertiary)", marginBottom: 4 }}>Raw METAR</div>
              <div style={{ fontSize: 10, fontFamily: "monospace", color: "var(--color-text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current.rawMetar}</div>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 32 }}>
        <a href={wunderUrl} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, fontFamily: "monospace", color: "var(--color-text-tertiary)", textDecoration: "none" }}>
          history on wunderground ↗
        </a>
      </div>
    </main>
  );
}