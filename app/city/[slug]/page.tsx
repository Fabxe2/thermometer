import { notFound } from "next/navigation";
import Link from "next/link";
import { getCityBySlug, getLocalTime, CITIES } from "@/lib/cities";
import { fetchWeatherData } from "@/lib/weather";
import { fetchPolymarketData } from "@/lib/polymarket";
import Sparkline from "@/app/components/Sparkline";
import MarketChart from "@/app/components/MarketChart";

export const revalidate = 120;

export async function generateStaticParams() {
  return CITIES.map(c => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const city = getCityBySlug(slug);
  if (!city) return {};
  return { title: `${city.name} – thermometer` };
}

export default async function CityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const city = getCityBySlug(slug);
  if (!city) notFound();

  const weatherData = await fetchWeatherData(city);
  const tempDisplay = weatherData.current?.tempDisplay ?? 0;
  const polyData = await fetchPolymarketData(city, tempDisplay);

  const current = weatherData.current;
  const forecast = weatherData.forecast;
  const time = getLocalTime(city.timezone, city.tzAbbr);
  const hourlyTemps = weatherData.hourly.slice(0,24).map(h =>
    city.unit==="F" ? Math.round((h.tempC*9/5)+32) : Math.round(h.tempC)
  );
  const wunderUrl = `https://www.wunderground.com/history/daily/${city.wundergroundSlug}`;

  return (
    <main className="max-w-5xl mx-auto px-6 py-8" style={{ minHeight:"100vh" }}>
      <Link href="/" className="text-[11px] uppercase tracking-wider transition-colors" style={{ color:"var(--color-text-tertiary)" }}>All Cities</Link>
      <header className="mt-6 mb-8 pb-6" style={{ borderBottom:"1px solid var(--color-rule)" }}>
        <div className="flex items-baseline gap-3 mb-1">
          <h1 className="text-[22px] uppercase tracking-wide" style={{ color:"var(--color-text-primary)" }}>{city.name}</h1>
          <span className="text-[13px] font-mono" style={{ color:"var(--color-text-tertiary)" }}>{city.station}</span>
          <span className="text-[13px] font-mono" style={{ color:"var(--color-text-tertiary)" }}>{time}</span>
        </div>
        <div className="font-mono leading-none font-light tracking-tight mt-3" style={{ fontSize:"clamp(72px,10vw,96px)", color:"var(--color-data)" }}>
          {current ? current.tempDisplay : "—"}
          <span style={{ fontSize:"clamp(32px,4vw,48px)", color:"var(--color-text-secondary)" }}>°{city.unit}</span>
        </div>
        {current && <span className="text-[11px] font-mono mt-1 block" style={{ color:"var(--color-text-tertiary)" }}>observed at {current.observedAt}</span>}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12">
        <div className="flex flex-col">
          <h2 className="text-[11px] uppercase tracking-[0.15em] mb-4" style={{ color:"var(--color-text-tertiary)" }}>Temperature</h2>
          {hourlyTemps.length > 1 ? (
            <div className="relative" style={{ height:120 }}>
              {(() => { const mn=Math.min(...hourlyTemps), mx=Math.max(...hourlyTemps); return (<>
                <span className="absolute left-0 top-0 text-[10px] font-mono" style={{ color:"var(--color-text-tertiary)" }}>{mx}</span>
                <span className="absolute left-0 bottom-5 text-[10px] font-mono" style={{ color:"var(--color-text-tertiary)" }}>{mn}</span>
              </>); })()}
              <div className="pl-6 h-full"><Sparkline data={hourlyTemps} width={500} height={100} /></div>
              <div className="flex justify-between pl-6 mt-1 text-[10px] font-mono" style={{ color:"var(--color-text-tertiary)" }}>
                <span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>9 PM</span>
              </div>
            </div>
          ) : <div className="text-[11px] py-4" style={{ color:"var(--color-text-tertiary)" }}>No hourly data</div>}
        </div>
        <div className="flex flex-col mt-8 lg:mt-0">
          <MarketChart buckets={polyData.buckets} eventUrl={polyData.eventUrl} />
        </div>
      </div>

      {forecast && (
        <div className="mt-10 pt-6 flex gap-8" style={{ borderTop:"1px solid var(--color-rule)" }}>
          <div>
            <div className="text-[11px] uppercase tracking-[0.15em] mb-1" style={{ color:"var(--color-text-tertiary)" }}>Today High</div>
            <div className="font-mono text-[28px] leading-none font-light" style={{ color:"var(--color-data)" }}>{Math.round(forecast.maxDisplay)}°{city.unit}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.15em] mb-1" style={{ color:"var(--color-text-tertiary)" }}>Today Low</div>
            <div className="font-mono text-[28px] leading-none font-light" style={{ color:"var(--color-data)" }}>{Math.round(forecast.minDisplay)}°{city.unit}</div>
          </div>
          {current?.rawMetar && (
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase tracking-[0.15em] mb-1" style={{ color:"var(--color-text-tertiary)" }}>Raw METAR</div>
              <div className="text-[10px] font-mono truncate" style={{ color:"var(--color-text-tertiary)" }}>{current.rawMetar}</div>
            </div>
          )}
        </div>
      )}
      <div className="mt-8">
        <a href={wunderUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-mono" style={{ color:"var(--color-text-tertiary)" }}>history on wunderground ↗</a>
      </div>
    </main>
  );
}