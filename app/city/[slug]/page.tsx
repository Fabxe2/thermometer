import { notFound } from "next/navigation";
import Link from "next/link";
import { getCityBySlug, getLocalTime, CITIES, cToF } from "@/lib/cities";
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

// Convert ISO timestamp to x position (0..1) within today in the city timezone
function tsToX(isoTime: string, timezone: string): number | null {
  const d = new Date(isoTime);
  if (isNaN(d.getTime())) return null;
  const parts = d.toLocaleString("en-US", {
    timeZone: timezone, hour12: false,
    hour: "2-digit", minute: "2-digit",
    year: "numeric", month: "2-digit", day: "2-digit"
  });
  // format: "MM/DD/YYYY, HH:MM"
  const match = parts.match(/(\d+):(\d+)$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  return (h * 60 + m) / (24 * 60);
}

export default async function CityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const city = getCityBySlug(slug);
  if (!city) notFound();
  const safeCity = city!;
  const unit = safeCity.unit;

  const weatherData = await fetchWeatherData(safeCity);
  const tempDisplay = weatherData.current?.tempDisplay ?? 0;
  const polyData    = await fetchPolymarketData(safeCity, tempDisplay);

  const current  = weatherData.current;
  const forecast = weatherData.forecast;
  const time     = getLocalTime(safeCity.timezone, safeCity.tzAbbr);

  // Obs points (solid line) — real hourly observations
  const obsPoints: ChartPoint[] = weatherData.obsHourly
    .map(pt => {
      const x = tsToX(pt.time, safeCity.timezone);
      if (x === null) return null;
      return { x, y: toDisplay(pt.tempC, unit) };
    })
    .filter((p): p is ChartPoint => p !== null)
    .sort((a, b) => a.x - b.x);

  // Forecast points (dashed line)
  const fcastPoints: ChartPoint[] = weatherData.forecastHourly
    .map(pt => {
      const x = tsToX(pt.time, safeCity.timezone);
      if (x === null) return null;
      return { x, y: toDisplay(pt.tempC, unit) };
    })
    .filter((p): p is ChartPoint => p !== null)
    .sort((a, b) => a.x - b.x);

  // Y axis ticks
  const allY = [...obsPoints, ...fcastPoints].map(p => p.y);
  const yMin = allY.length ? Math.min(...allY) : 0;
  const yMax = allY.length ? Math.max(...allY) : 0;
  const yStep  = Math.ceil((yMax - yMin) / 3 / 2) * 2 || 2;
  const yStart = Math.floor(yMin / yStep) * yStep;
  const yTicks = Array.from({ length: 5 }, (_, i) => yStart + i * yStep)
    .filter(v => v >= yMin - yStep && v <= yMax + yStep)
    .slice(0, 5);

  const topBucket = polyData.buckets.length > 0
    ? polyData.buckets.reduce((a, b) => b.yesPrice > a.yesPrice ? b : a, polyData.buckets[0])
    : null;

  function labelWithUnit(label: string): string {
    if (!label || label.includes('°F') || label.includes('°C')) return label;
    if (label.includes('°')) return label.replace('°', `°${unit}`);
    return label;
  }

  const chartH = 180;
  const xLabels = ["12 AM","3 AM","6 AM","9 AM","12 PM","3 PM","6 PM","9 PM"];
  const wunderUrl = `https://www.wunderground.com/history/daily/${safeCity.wundergroundSlug}`;

  return (
    <main style={{ maxWidth:960, margin:"0 auto", padding:"32px 24px", minHeight:"100vh" }}>
      <Link href="/" style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.1em", color:"var(--color-text-tertiary)", textDecoration:"none" }}>← All Cities</Link>

      <header style={{ marginTop:24, marginBottom:32, paddingBottom:24, borderBottom:"1px solid var(--color-rule)" }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:12, marginBottom:4 }}>
          <h1 style={{ fontSize:22, textTransform:"uppercase", letterSpacing:"0.05em", color:"var(--color-text-primary)", margin:0, fontWeight:400 }}>{safeCity.name}</h1>
          <span style={{ fontSize:13, fontFamily:"monospace", color:"var(--color-text-tertiary)" }}>{safeCity.station}</span>
          <span style={{ fontSize:13, fontFamily:"monospace", color:"var(--color-text-tertiary)" }}>{time}</span>
        </div>
        <div style={{ fontFamily:"monospace", fontSize:"clamp(64px,9vw,88px)", lineHeight:1, fontWeight:300, color:"var(--color-data)", marginTop:12 }}>
          {current ? current.tempDisplay : "—"}
          <span style={{ fontSize:"clamp(28px,4vw,42px)", color:"var(--color-text-secondary)" }}>°{unit}</span>
        </div>
        {current && (
          <div style={{ display:"flex", alignItems:"center", gap:16, marginTop:6 }}>
            <span style={{ fontSize:11, fontFamily:"monospace", color:"var(--color-text-tertiary)" }}>observed at {current.observedAt}</span>
            {topBucket && (
              <span style={{ fontSize:12, fontFamily:"monospace", color:"var(--color-accent)", fontWeight:500 }}>
                {labelWithUnit(topBucket.label)} {Math.round(topBucket.yesPrice * 100)}¢
              </span>
            )}
          </div>
        )}
      </header>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 48px", marginBottom:40 }}>
        <div>
          <h2 style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.15em", color:"var(--color-text-tertiary)", fontWeight:400, marginBottom:12 }}>Temperature</h2>
          <div style={{ display:"flex", gap:8 }}>
            <div style={{ display:"flex", flexDirection:"column", justifyContent:"space-between", minWidth:28, textAlign:"right", paddingBottom:20 }}>
              {[...yTicks].reverse().map(t => (
                <span key={t} style={{ fontSize:10, fontFamily:"monospace", color:"var(--color-text-tertiary)", lineHeight:1 }}>{Math.round(t)}</span>
              ))}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ height:chartH }}>
                <Sparkline obs={obsPoints} forecast={fcastPoints} height={chartH} />
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:6 }}>
                {xLabels.map(l => (
                  <span key={l} style={{ fontSize:10, fontFamily:"monospace", color:"var(--color-text-tertiary)" }}>{l}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div>
          <MarketChart buckets={polyData.buckets} eventUrl={polyData.eventUrl} unit={unit} />
        </div>
      </div>

      {forecast && (
        <div style={{ paddingTop:24, display:"flex", gap:32, borderTop:"1px solid var(--color-rule)", flexWrap:"wrap" }}>
          <div>
            <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.15em", color:"var(--color-text-tertiary)", marginBottom:4 }}>Today High</div>
            <div style={{ fontFamily:"monospace", fontSize:28, fontWeight:300, color:"var(--color-data)" }}>{Math.round(forecast.maxDisplay)}°{unit}</div>
          </div>
          <div>
            <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.15em", color:"var(--color-text-tertiary)", marginBottom:4 }}>Today Low</div>
            <div style={{ fontFamily:"monospace", fontSize:28, fontWeight:300, color:"var(--color-data)" }}>{Math.round(forecast.minDisplay)}°{unit}</div>
          </div>
          {current?.rawMetar && (
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.15em", color:"var(--color-text-tertiary)", marginBottom:4 }}>Raw METAR</div>
              <div style={{ fontSize:10, fontFamily:"monospace", color:"var(--color-text-tertiary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{current.rawMetar}</div>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop:32 }}>
        <a href={wunderUrl} target="_blank" rel="noopener noreferrer"
          style={{ fontSize:11, fontFamily:"monospace", color:"var(--color-text-tertiary)", textDecoration:"none" }}>
          history on wunderground ↗
        </a>
      </div>
    </main>
  );
}