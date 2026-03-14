import { notFound } from "next/navigation";
import Link from "next/link";
import { getCityBySlug, getLocalTime, CITIES, cToF } from "@/lib/cities";
import { fetchWeatherData } from "@/lib/weather";
import { fetchPolymarketData } from "@/lib/polymarket";
import Sparkline from "../../components/Sparkline";
import MarketChart from "../../components/MarketChart";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const city = getCityBySlug(slug);
  if (!city) return {};
  return { title: `${city.name} – thermometer` };
}

function toDisplay(tempC: number, unit: "F"|"C"): number {
  return unit === "F" ? cToF(tempC) : Math.round(tempC);
}

// Build 24h timeline from 12 AM today in city timezone
function buildTimeline(timezone: string): string[] {
  // Get today midnight in city timezone
  const now = new Date();
  const localMidnight = new Date(new Date(now.toLocaleDateString("en-US", { timeZone: timezone })).toLocaleString("en-US", { timeZone: timezone }));
  return Array.from({ length: 24 }, (_, i) => {
    const d = new Date(localMidnight.getTime() + i * 3600000);
    return d.toISOString().substring(0, 13); // "2026-03-14T06"
  });
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

  // Build obs array: map obsHourly to display temps aligned to 24h timeline
  // Use a map of hour -> temp for quick lookup
  const obsMap = new Map<string, number>();
  for (const pt of weatherData.obsHourly) {
    const key = pt.time.substring(0, 13); // "2026-03-14T06"
    obsMap.set(key, toDisplay(pt.tempC, unit));
  }

  // Build forecast array: map forecastHourly to 24h
  const fcastMap = new Map<string, number>();
  for (const pt of weatherData.forecastHourly) {
    const key = pt.time.substring(0, 13);
    fcastMap.set(key, toDisplay(pt.tempC, unit));
  }

  const timeline = buildTimeline(safeCity.timezone);
  // Only include hours that have at least forecast data
  const obsArr    = timeline.map(h => obsMap.get(h) ?? NaN);
  const fcastArr  = timeline.map(h => fcastMap.get(h) ?? NaN);

  // Y axis values from all data
  const allVals = [...obsArr, ...fcastArr].filter(v => !isNaN(v));
  const yMin = allVals.length ? Math.min(...allVals) : 0;
  const yMax = allVals.length ? Math.max(...allVals) : 0;
  // Nice y ticks
  const yStep  = Math.ceil((yMax - yMin) / 4 / 2) * 2 || 2;
  const yStart = Math.floor(yMin / yStep) * yStep;
  const yTicks = Array.from({ length: 5 }, (_, i) => yStart + i * yStep).filter(v => v >= yMin - yStep && v <= yMax + yStep).slice(0, 5);

  // X axis labels every 3 hours: 12 AM, 3 AM, 6 AM...
  const xLabels = ["12 AM","3 AM","6 AM","9 AM","12 PM","3 PM","6 PM","9 PM"];

  const topBucket = polyData.buckets.length > 0
    ? polyData.buckets.reduce((a, b) => b.yesPrice > a.yesPrice ? b : a, polyData.buckets[0])
    : null;

  function labelWithUnit(label: string): string {
    if (!label || label.includes('°F') || label.includes('°C')) return label;
    if (label.includes('°')) return label.replace('°', `°${unit}`);
    return label;
  }

  const chartH = 200; // taller — like the original
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

      {/* Charts row — same proportions as original */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 48px", marginBottom:40 }}>

        {/* Temperature chart */}
        <div>
          <h2 style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.15em", color:"var(--color-text-tertiary)", fontWeight:400, marginBottom:12 }}>Temperature</h2>
          <div style={{ display:"flex", gap:8 }}>
            {/* Y axis */}
            <div style={{ display:"flex", flexDirection:"column", justifyContent:"space-between", minWidth:28, textAlign:"right", paddingBottom:18 }}>
              {[...yTicks].reverse().map(t => (
                <span key={t} style={{ fontSize:10, fontFamily:"monospace", color:"var(--color-text-tertiary)", lineHeight:1 }}>{t}</span>
              ))}
            </div>
            {/* Chart + X axis */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ height:chartH, position:"relative" }}>
                <Sparkline obs={obsArr} forecast={fcastArr} width={500} height={chartH} />
              </div>
              {/* X axis — every 3 hours */}
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
                {xLabels.map(l => (
                  <span key={l} style={{ fontSize:10, fontFamily:"monospace", color:"var(--color-text-tertiary)" }}>{l}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Market chart */}
        <div>
          <MarketChart buckets={polyData.buckets} eventUrl={polyData.eventUrl} unit={unit} />
        </div>
      </div>

      {/* High / Low / METAR */}
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
        <a href={wunderUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize:11, fontFamily:"monospace", color:"var(--color-text-tertiary)", textDecoration:"none" }}>history on wunderground ↗</a>
      </div>
    </main>
  );
}