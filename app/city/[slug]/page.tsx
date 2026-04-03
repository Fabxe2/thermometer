import { notFound } from "next/navigation";
import Link from "next/link";
import { getCityBySlug, getLocalTime, CITIES, cToF } from "@/lib/cities";
import { fetchWeatherData } from "@/lib/weather";
import { fetchPolymarketData } from "@/lib/polymarket";
import Sparkline, { ChartPoint } from "../../components/Sparkline";
import MarketChart from "../../components/MarketChart";

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return CITIES.map(c => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const city = getCityBySlug(slug);
  if (!city) return {};
  return { title: city.name + " – thermometer" };
}

function toDisplay(tempC: number, unit: "F" | "C"): number {
  return unit === "F" ? cToF(tempC) : Math.round(tempC * 10) / 10;
}
function getHour(iso: string): number {
  const m = iso.match(/T(\d{2}):/);
  return m ? parseInt(m[1], 10) : -1;
}
function getDate(iso: string): string { return iso.substring(0, 10); }

export default async function CityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const city = getCityBySlug(slug);
  if (!city) notFound();
  const safeCity = city!;
  const unit = safeCity.unit;

  const weatherData = await fetchWeatherData(safeCity);
  const currentTempDisplay = weatherData.current != null
    ? (weatherData.current.tempDisplay ?? toDisplay(weatherData.current.tempC, unit))
    : null;

  const polyData = await fetchPolymarketData(safeCity, currentTempDisplay ?? 0);
  const current = weatherData.current;
  const forecast = weatherData.forecast;
  const time = getLocalTime(safeCity.timezone, safeCity.tzAbbr);
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: safeCity.timezone });

  const fcastMap = new Map<number, number>();
  for (const pt of weatherData.forecastHourly) {
    const h = getHour(pt.time);
    if (h < 0) continue;
    if (!fcastMap.has(h)) fcastMap.set(h, toDisplay(pt.tempC, unit));
  }

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

  const topBucket = polyData.buckets.length > 0
    ? polyData.buckets.reduce((a, b) => b.yesPrice > a.yesPrice ? b : a, polyData.buckets[0])
    : null;

  const wunderUrl = "https://www.wunderground.com/forecast/" + safeCity.wundergroundSlug;

  return (
    <main style={{ maxWidth:720, margin:"0 auto", padding:"32px 24px", minHeight:"100vh" }}>

      <Link href="/" style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.1em", color:"rgba(255,255,255,0.3)", textDecoration:"none" }}>
        ← All Cities
      </Link>

      <header style={{ marginTop:24, marginBottom:32, paddingBottom:24, borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:12, marginBottom:4 }}>
          <h1 style={{ fontSize:22, textTransform:"uppercase", letterSpacing:"0.05em", color:"#fff", margin:0, fontWeight:400 }}>
            {safeCity.name}
          </h1>
          <span style={{ fontSize:13, fontFamily:"monospace", color:"rgba(255,255,255,0.3)" }}>{safeCity.station}</span>
          <span style={{ fontSize:13, fontFamily:"monospace", color:"rgba(255,255,255,0.3)" }}>{time}</span>
        </div>

        <div style={{ fontFamily:"monospace", fontSize:"clamp(64px,9vw,88px)", lineHeight:1, fontWeight:300, color:"#fff", marginTop:12 }}>
          {currentTempDisplay != null ? currentTempDisplay : "—"}
          <span style={{ fontSize:"clamp(28px,4vw,42px)", color:"rgba(255,255,255,0.5)" }}>°{unit}</span>
        </div>

        {current && (
          <div style={{ display:"flex", alignItems:"center", gap:16, marginTop:6 }}>
            <span style={{ fontSize:11, fontFamily:"monospace", color:"rgba(255,255,255,0.3)" }}>
              observed at {current.observedAt}
            </span>
            {topBucket && (
              <span style={{ fontSize:12, fontFamily:"monospace", color:"#e8b86d", fontWeight:500 }}>
                {topBucket.label} {Math.round(topBucket.yesPrice * 100)}¢
              </span>
            )}
          </div>
        )}
      </header>

      <div style={{ marginBottom:40 }}>
        <div style={{ display:"flex", alignItems:"center", gap:20, marginBottom:12 }}>
          <h2 style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.15em", color:"rgba(255,255,255,0.3)", fontWeight:400, margin:0 }}>
            Temperature
          </h2>
          <span style={{ fontSize:10, fontFamily:"monospace", color:"rgba(255,255,255,0.7)" }}>
            — obs
          </span>
          <span style={{ fontSize:10, fontFamily:"monospace", color:"rgba(255,255,255,0.35)", letterSpacing:2 }}>
            - - forecast
          </span>
          <span style={{ fontSize:10, fontFamily:"monospace", color:"rgba(255,255,255,0.2)" }}>
            hover para ver valores
          </span>
        </div>
        <Sparkline data={chartData} height={300} />
      </div>

      <div style={{ marginBottom:40, minHeight:200 }}>
        <MarketChart buckets={polyData.buckets} eventUrl={polyData.eventUrl} unit={unit} />
      </div>

      {forecast && (
        <div style={{ paddingTop:24, display:"flex", gap:32, borderTop:"1px solid rgba(255,255,255,0.08)", flexWrap:"wrap" }}>
          <div>
            <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.15em", color:"rgba(255,255,255,0.3)", marginBottom:4 }}>Today High</div>
            <div style={{ fontFamily:"monospace", fontSize:28, fontWeight:300, color:"#fff" }}>
              {Math.round(forecast.maxDisplay)}°{unit}
            </div>
          </div>
          <div>
            <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.15em", color:"rgba(255,255,255,0.3)", marginBottom:4 }}>Today Low</div>
            <div style={{ fontFamily:"monospace", fontSize:28, fontWeight:300, color:"#fff" }}>
              {Math.round(forecast.minDisplay)}°{unit}
            </div>
          </div>
          {current?.rawMetar && (
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.15em", color:"rgba(255,255,255,0.3)", marginBottom:4 }}>Raw METAR</div>
              <div style={{ fontSize:10, fontFamily:"monospace", color:"rgba(255,255,255,0.3)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {current.rawMetar}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop:32 }}>
        <a href={wunderUrl} target="_blank" rel="noopener noreferrer"
          style={{ fontSize:11, fontFamily:"monospace", color:"rgba(255,255,255,0.3)", textDecoration:"none" }}>
          history on wunderground ↗
        </a>
      </div>
    </main>
  );
}