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

// Converts ISO timestamp to x position (0..1) in 24h day
// Handles both UTC-offset stamps (NWS: "2026-03-14T04:51:00+00:00")
// and local stamps (Open-Meteo: "2026-03-14T09:00")
function tsToX(isoTime: string, timezone: string): number | null {
  let h: number, m: number;
  const hasOffset = /Z$|[+-]\d{2}:\d{2}$/.test(isoTime);
  if (hasOffset) {
    const d = new Date(isoTime);
    if (isNaN(d.getTime())) return null;
    const local = d.toLocaleString("en-US", {
      timeZone: timezone, hour12: false, hour: "2-digit", minute: "2-digit"
    });
    const match = local.match(/(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    h = parseInt(match[1], 10); m = parseInt(match[2], 10);
  } else {
    const match = isoTime.match(/T(\d{2}):(\d{2})/);
    if (!match) return null;
    h = parseInt(match[1], 10); m = parseInt(match[2], 10);
  }
  if (h >= 24) h = 0;
  return (h * 60 + m) / (24 * 60);
}

function getDateStr(isoTime: string, timezone: string): string {
  const hasOffset = /Z$|[+-]\d{2}:\d{2}$/.test(isoTime);
  if (hasOffset) return new Date(isoTime).toLocaleDateString("en-CA", { timeZone: timezone });
  return isoTime.substring(0, 10);
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
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: safeCity.timezone });

  // HISTORY (dashed line) = tgftp cycle obs — all hourly readings for the day
  // Dedup by hour slot, keep only today
  const histMap = new Map<number, number>();
  for (const pt of weatherData.obsHourly) {
    const x = tsToX(pt.time, safeCity.timezone);
    if (x === null) continue;
    const slot = Math.round(x * 24);
    if (!histMap.has(slot)) histMap.set(slot, toDisplay(pt.tempC, unit));
  }
  const historyPoints: ChartPoint[] = Array.from(histMap.entries())
    .map(([slot, y]) => ({ x: slot / 24, y }))
    .sort((a, b) => a.x - b.x);

  // CURRENT POINT (solid short line) = just the current observed temperature
  // Placed at the current time of day
  const currentPoints: ChartPoint[] = [];
  if (current) {
    const x = tsToX(current.observedISO, safeCity.timezone);
    if (x !== null) {
      // Create a small 2-point segment around the current time (like the original)
      const prevX = Math.max(0, x - 1/24);
      // Find adjacent history point for smooth join
      const nearbyHist = historyPoints.filter(p => Math.abs(p.x - x) < 2/24);
      if (nearbyHist.length > 0) {
        currentPoints.push(...nearbyHist);
      }
      currentPoints.push({ x, y: tempDisplay });
      currentPoints.sort((a, b) => a.x - b.x);
    }
  }

  // Y axis from all data
  const allY = [...historyPoints, ...currentPoints].map(p => p.y);
  const yMin = allY.length ? Math.min(...allY) : 0;
  const yMax = allY.length ? Math.max(...allY) : 0;
  const yStep  = Math.ceil((yMax - yMin) / 3 / 2) * 2 || 2;
  const yStart = Math.floor(yMin / yStep) * yStep;
  const yTicks = Array.from({ length: 5 }, (_, i) => yStart + i * yStep)
    .filter(v => v >= yMin - yStep && v <= yMax + yStep).slice(0, 5);

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
                <Sparkline history={historyPoints} current={currentPoints} height={chartH} />
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