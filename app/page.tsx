import Link from "next/link";
import { CITIES, getLocalTime } from "@/lib/cities";
import { fetchWeatherData } from "@/lib/weather";

export const revalidate = 300;

async function CityCard({ city }: { city: (typeof CITIES)[0] }) {
  const data = await fetchWeatherData(city);
  const current = data.current;
  const forecast = data.forecast;
  let rangeStr = "—";
  if (forecast) rangeStr = `${Math.round(forecast.minDisplay)}–${Math.round(forecast.maxDisplay)}°${city.unit}`;
  const time = getLocalTime(city.timezone, city.tzAbbr);
  return (
    <Link href={`/city/${city.slug}`} style={{ display:"block", textDecoration:"none", color:"inherit" }}>
      <div style={{ padding:"16px 0", borderBottom:"1px solid var(--color-rule)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:4 }}>
          <span style={{ fontSize:13, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--color-text-secondary)" }}>{city.name}</span>
          <span style={{ fontSize:11, fontFamily:"monospace", color:"var(--color-text-tertiary)" }}>{time}</span>
        </div>
        <div style={{ fontFamily:"monospace", fontSize:32, lineHeight:1, fontWeight:300, color:"var(--color-data)" }}>
          {current ? current.tempDisplay : "—"}
          <span style={{ fontSize:16, color:"var(--color-text-secondary)" }}>°{city.unit}</span>
        </div>
        <div style={{ marginTop:8 }}>
          <span style={{ fontSize:11, fontFamily:"monospace", color:"var(--color-text-tertiary)" }}>{rangeStr}</span>
        </div>
      </div>
    </Link>
  );
}

export default function Home() {
  const usCities = CITIES.filter(c => c.region === "us");
  const intlCities = CITIES.filter(c => c.region === "intl");
  return (
    <main style={{ maxWidth:1200, margin:"0 auto", padding:"32px 24px", minHeight:"100vh" }}>
      <header style={{ marginBottom:40 }}>
        <h1 style={{ fontSize:15, textTransform:"uppercase", letterSpacing:"0.15em", color:"var(--color-text-secondary)", fontWeight:400, margin:0 }}>thermometer</h1>
      </header>
      <div style={{ display:"flex", flexDirection:"column", gap:40 }}>
        <section>
          <h2 style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.15em", color:"var(--color-text-tertiary)", marginBottom:8, fontWeight:400 }}>United States</h2>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap:"0 32px" }}>
            {usCities.map(city => <CityCard key={city.slug} city={city} />)}
          </div>
        </section>
        <section>
          <h2 style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.15em", color:"var(--color-text-tertiary)", marginBottom:8, fontWeight:400 }}>International</h2>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap:"0 32px" }}>
            {intlCities.map(city => <CityCard key={city.slug} city={city} />)}
          </div>
        </section>
      </div>
    </main>
  );
}