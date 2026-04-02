import { CITIES, getLocalTime } from "../lib/cities";
import { fetchWeatherData } from "../lib/weather";
import { fetchPolymarketData } from "../lib/polymarket";

export const dynamic = "force-dynamic";

async function CityRow({ city }: { city: typeof CITIES[0] }) {
  let tempDisplay: number | null = null;
  let maxDisplay: string = "--";
  let topPrice: number | null = null;
  try {
    const w = await fetchWeatherData(city);
    tempDisplay = w.current?.tempDisplay ?? null;
    if (w.forecast) {
      const hi = Math.round(w.forecast.maxDisplay);
      const lo = Math.round(w.forecast.minDisplay);
      maxDisplay = hi === lo ? hi + "deg" + city.unit : hi + "-" + (hi+1) + "deg" + city.unit;
    }
    if (tempDisplay !== null) {
      const poly = await fetchPolymarketData(city, tempDisplay);
      if (poly.buckets.length) {
        const top = poly.buckets.reduce((a, b) => b.yesPrice > a.yesPrice ? b : a, poly.buckets[0]);
        topPrice = Math.round(top.yesPrice * 100);
      }
    }
  } catch { /* skip */ }

  const localTime = getLocalTime(city.timezone, city.tzAbbr);

  return (
    <a href={"/city/" + city.slug} style={{ display:"grid", gridTemplateColumns:"1fr auto auto auto", alignItems:"center", gap:"0 24px", padding:"10px 0", borderTop:"1px solid var(--color-rule)", textDecoration:"none", color:"inherit" }}>
      <div>
        <span style={{ fontSize:14, color:"var(--color-text-primary)" }}>{city.name}</span>
        <span style={{ fontSize:11, fontFamily:"monospace", color:"var(--color-text-tertiary)", marginLeft:8 }}>{localTime}</span>
      </div>
      <span style={{ fontSize:13, fontFamily:"monospace", color:"var(--color-text-tertiary)" }}>{maxDisplay}</span>
      {topPrice !== null && <span style={{ fontSize:12, fontFamily:"monospace", color:"var(--color-accent)", fontWeight:500 }}>{topPrice}c</span>}
      {topPrice === null && <span />}
      <span style={{ fontSize:22, fontFamily:"monospace", fontWeight:300, color:"var(--color-data)", minWidth:52, textAlign:"right" }}>
        {tempDisplay !== null ? tempDisplay + "deg" + city.unit : "--"}
      </span>
    </a>
  );
}

export default function Home() {
  const us = CITIES.filter(c => c.region === 'us');
  const intl = CITIES.filter(c => c.region === 'intl');
  return (
    <main style={{ maxWidth:720, margin:"0 auto", padding:"32px 24px 64px" }}>
      <div style={{ marginBottom:40 }}>
        <h1 style={{ fontSize:18, fontWeight:400, letterSpacing:"0.02em", color:"var(--color-text-primary)" }}>thermometer</h1>
      </div>
      <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.15em", color:"var(--color-text-tertiary)", marginBottom:4 }}>United States</div>
      {us.map(c => <CityRow key={c.slug} city={c} />)}
      <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.15em", color:"var(--color-text-tertiary)", margin:"32px 0 4px" }}>International</div>
      {intl.map(c => <CityRow key={c.slug} city={c} />)}
    </main>
  );
}