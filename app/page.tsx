import Link from "next/link";
import { CITIES, getLocalTime } from "@/lib/cities";
import { fetchWeatherData } from "@/lib/weather";

export const revalidate = 300;

async function CityCard({ city }: { city: (typeof CITIES)[0] }) {
  const data = await fetchWeatherData(city);
  const current = data.current;
  const forecast = data.forecast;
  const tempStr = current ? `${current.tempDisplay}°${current.unit}` : "—";
  let rangeStr = "—";
  if (forecast) rangeStr = `${Math.round(forecast.minDisplay)}-${Math.round(forecast.maxDisplay)}°${city.unit}`;
  const time = getLocalTime(city.timezone, city.tzAbbr);
  return (
    <Link href={`/city/${city.slug}`} className="group block">
      <div className="py-4 border-b transition-colors" style={{ borderColor:"var(--color-rule)" }}>
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[13px] uppercase tracking-wide" style={{ color:"var(--color-text-secondary)" }}>{city.name}</span>
          <span className="text-[11px] font-mono" style={{ color:"var(--color-text-tertiary)" }}>{time}</span>
        </div>
        <div className="flex items-end gap-3">
          <span className="font-mono text-[32px] leading-none font-light tracking-tight" style={{ color:"var(--color-data)" }}>
            {current ? current.tempDisplay : "—"}
            <span className="text-[16px]" style={{ color:"var(--color-text-secondary)" }}>°{city.unit}</span>
          </span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] font-mono" style={{ color:"var(--color-text-tertiary)" }}>{rangeStr}</span>
        </div>
      </div>
    </Link>
  );
}

export default function Home() {
  const usCities = CITIES.filter(c => c.region === "us");
  const intlCities = CITIES.filter(c => c.region === "intl");
  return (
    <main className="max-w-7xl mx-auto px-6 py-8" style={{ minHeight:"100vh" }}>
      <header className="mb-10">
        <h1 className="text-[15px] uppercase tracking-[0.15em]" style={{ color:"var(--color-text-secondary)" }}>thermometer</h1>
      </header>
      <div className="space-y-10">
        <section>
          <h2 className="text-[11px] uppercase tracking-[0.15em] mb-2" style={{ color:"var(--color-text-tertiary)" }}>United States</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8">
            {usCities.map(city => <CityCard key={city.slug} city={city} />)}
          </div>
        </section>
        <section>
          <h2 className="text-[11px] uppercase tracking-[0.15em] mb-2" style={{ color:"var(--color-text-tertiary)" }}>International</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8">
            {intlCities.map(city => <CityCard key={city.slug} city={city} />)}
          </div>
        </section>
      </div>
    </main>
  );
}