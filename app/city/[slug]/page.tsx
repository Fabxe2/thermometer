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

// Extrae la hora local (0-23) de un timestamp ISO
// Maneja tanto UTC+offset ("2026-03-14T04:51:00+00:00") como local ("2026-03-14T09:00")
function tsToLocalHour(isoTime: string, timezone: string): number | null {
  const hasOffset = /Z$|[+-]\d{2}:\d{2}$/.test(isoTime);
  if (hasOffset) {
    const d = new Date(isoTime);
    if (isNaN(d.getTime())) return null;
    const local = d.toLocaleString("en-US", {
      timeZone: timezone, hour12: false, hour: "2-digit", minute: "2-digit"
    });
    const m = local.match(/(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    return h >= 24 ? 0 : h;
  } else {
    const m = isoTime.match(/T(\d{2}):/);
    if (!m) return null;
    return parseInt(m[1], 10);
  }
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

  // Construir array de 24 horas para el gráfico (índices 0-23)
  // Cada entry: { hour, observed?, current? }
  const chartMap = new Map<number, ChartPoint>();
  for (let h = 0; h < 24; h++) chartMap.set(h, { hour: h });

  // Historia de observaciones → campo "observed" (línea punteada)
  for (const pt of weatherData.obsHourly) {
    const h = tsToLocalHour(pt.time, safeCity.timezone);
    if (h === null) continue;
    const entry = chartMap.get(h) ?? { hour: h };
    entry.observed = toDisplay(pt.tempC, unit);
    chartMap.set(h, entry);
  }

  // Temperatura actual → campo "current" solo en la hora actual (línea sólida)
  if (current) {
    const h = tsToLocalHour(current.observedISO, safeCity.timezone);
    if (h !== null) {
      const entry = chartMap.get(h) ?? { hour: h };
      entry.current = tempDisplay;
      chartMap.set(h, entry);
    }
  }

  const chartData: ChartPoint[] = Array.from(chartMap.values()).sort((a, b) => a.hour - b.hour);

  // Y axis ticks desde los datos del gráfico
  const allY = chartData.flatMap(d => [d.observed, d.current].filter((v): v is number => v != null));
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
            {/* Y axis labels */}
            <div style={{ display:"flex", flexDirection:"column", justifyContent:"space-between", minWidth:28, textAlign:"right", paddingBottom:20 }}>
              {[...yTicks].reverse().map(t => (
                <span key={t} style={{ fontSize:10, fontFamily:"monospace", color:"var(--color-text-tertiary)", lineHeight:1 }}>{Math.round(t)}</span>
              ))}
            </div>
            {/* Chart */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ height:chartH }}>
                <Sparkline data={chartData} height={chartH} />
              </div>
              {/* X axis labels: 8 labels for 24h, one every 3 hours */}
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