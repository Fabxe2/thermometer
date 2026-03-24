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
  const m = iso.match(/T(\d{2}):/);
  return m ? parseInt(m[1], 10) : -1;
}

function getDate(iso: string): string {
  return iso.substring(0, 10);
}

export default async function CityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const city = getCityBySlug(slug);
  if (!city) notFound();
  const safeCity = city!;
  const unit = safeCity.unit;

  const weatherData = await fetchWeatherData(safeCity);

  // tempDisplay: usa tempDisplay si está definido, sino convierte desde tempC
  const currentTempDisplay = weatherData.current != null
    ? (weatherData.current.tempDisplay ?? toDisplay(weatherData.current.tempC, unit))
    : null;

  const polyData = await fetchPolymarketData(safeCity, currentTempDisplay ?? 0);
  const current = weatherData.current;
  const forecast = weatherData.forecast;
  const time = getLocalTime(safeCity.timezone, safeCity.tzAbbr);
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: safeCity.timezone });

  // forecastHourly → proyección diurna (línea punteada)
  const fcastMap = new Map<number, number>();
  for (const pt of weatherData.forecastHourly) {
    const h = getHour(pt.time);
    if (h < 0) continue;
    if (!fcastMap.has(h)) fcastMap.set(h, toDisplay(pt.tempC, unit));
  }

  // obsHourly → historial real de hoy (línea sólida)
  const obsMap = new Map<number, number>();
  for (const pt of weatherData.obsHourly) {
    const dateStr = getDate(pt.time);
    // NWS da timestamps UTC, Open-Meteo da local — aceptamos ambos
    if (dateStr !== todayStr && !pt.time.includes('T')) continue;
    const h = getHour(pt.time);
    if (h < 0) continue;
    if (!obsMap.has(h)) obsMap.set(h, toDisplay(pt.tempC, unit));
  }

  // Array de 24 puntos h=0..23
  const chartData: ChartPoint[] = Array.from({ length: 24 }, (_, h) => {
    const point: ChartPoint = { hour: h };
    if (fcastMap.has(h)) point.forecast = fcastMap.get(h);
    if (obsMap.has(h)) point.observed = obsMap.get(h);
    return point;
  });

  // Eje Y
  const allY = chartData.flatMap(d => [d.observed, d.forecast].filter((v): v is number => v != null));
  const yMin = allY.length ? Math.min(...allY) : 0;
  const yMax = allY.length ? Math.max(...allY) : 0;
  const yStep = Math.ceil((yMax - yMin) / 3 / 2) * 2 || 2;
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

        {/* Temperatura principal — con fallback defensivo */}
        <div style={{ fontFamily:"monospace", fontSize:"clamp(64px,9vw,88px)", lineHeight:1, fontWeight:300, color:"var(--color-data)", marginTop:12 }}>
          {currentTempDisplay != null ? currentTempDisplay : "—"}
          <span style={{ fontSize:"clamp(28px,4vw,42px)", color:"var(--color-text-secondary)" }}>°{unit}</span>
        </div>

        {current && (
          <div style={{ display:"flex", alignItems:"center", gap:16, marginTop:6 }}>
            <span style={{ fontSize:11, fontFamily:"monospace", color:"var(--color-text-tertiary)" }}>
              observed at {current.observedAt}
              {current.dewpoint != null && (
                <span style={{ marginLeft:8, color:"var(--color-text-tertiary)" }}>
                  · dew {Math.round(current.dewpoint)}°{unit}
                </span>
              )}
            </span>
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
                <Sparkline data={chartData} height={chartH} />
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