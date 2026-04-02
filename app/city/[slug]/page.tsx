import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getCityBySlug, getLocalTime, CITIES } from '../../../lib/cities';
import { getWeatherData } from '../../../lib/weather';
import { getCityMarkets } from '../../../lib/polymarket';
import Sparkline from '../../components/Sparkline';
import MarketChart from '../../components/MarketChart';

export async function generateStaticParams() {
  return CITIES.map(c => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const city = getCityBySlug(slug);
  return { title: city ? city.name + ' – thermometer' : 'thermometer' };
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 720, margin: '0 auto', padding: '24px 16px 48px' },
  back: { display: 'inline-block', marginBottom: 20, fontSize: 13, color: 'var(--muted)', textDecoration: 'none' },
  header: { marginBottom: 24 },
  cityName: { fontSize: 28, fontWeight: 600, letterSpacing: -0.5 },
  meta: { fontSize: 13, color: 'var(--muted)', marginTop: 2 },
  tempRow: { display: 'flex', alignItems: 'baseline', gap: 10, margin: '12px 0 4px' },
  currentTemp: { fontSize: 52, fontWeight: 300, lineHeight: 1 },
  unit: { fontSize: 20, color: 'var(--muted)' },
  obsLabel: { fontSize: 12, color: 'var(--muted)' },
  statRow: { display: 'flex', gap: 20, fontSize: 13, color: 'var(--muted)', marginBottom: 24 },
  section: { marginBottom: 32 },
  sectionLabel: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 },
  rawMetar: { fontFamily: 'monospace', fontSize: 11, color: 'var(--faint)', marginTop: 16, wordBreak: 'break-all' },
  wunderLink: { fontSize: 12, color: 'var(--muted)', marginTop: 8, display: 'inline-block' },
};

export default async function CityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const city = getCityBySlug(slug);
  if (!city) notFound();

  const [weather, { markets }] = await Promise.all([
    getWeatherData(city),
    getCityMarkets(city.name, city.station),
  ]);

  const localTime = getLocalTime(city.timezone, city.tzAbbr);

  // Hora actual decimal local para la línea vertical del chart
  const nowDate = new Date();
  const timeParts = nowDate.toLocaleString('en-US', {
    timeZone: city.timezone, hour: '2-digit', minute: '2-digit', hour12: false
  }).split(':').map(Number);
  const currentHour = timeParts[0] + timeParts[1] / 60;

  return (
    <main style={S.page}>
      <a href="/" style={S.back}>← All Cities</a>

      <div style={S.header}>
        <div style={S.cityName}>{city.name}</div>
        <div style={S.meta}>{city.station} · {localTime}</div>

        <div style={S.tempRow}>
          <span style={S.currentTemp}>{weather.currentTemp}</span>
          <span style={S.unit}>°{city.unit}</span>
          <span style={S.obsLabel}>observed at {localTime}</span>
        </div>

        <div style={S.statRow}>
          <span>High <strong style={{ color: '#fff' }}>{weather.highToday}°{city.unit}</strong></span>
          <span>Low <strong style={{ color: '#fff' }}>{weather.lowToday}°{city.unit}</strong></span>
          <span>Spread <strong style={{ color: '#fff' }}>{weather.spread}°C</strong></span>
          <span>Wind <strong style={{ color: '#fff' }}>{weather.windKt}kt</strong></span>
          <span style={{ color: weather.confidence >= 70 ? '#4ade80' : weather.confidence >= 45 ? '#facc15' : '#f87171' }}>
            Conf {weather.confidence}%
          </span>
        </div>
      </div>

      {/* Sparkline — Fases 1+2 */}
      <div style={S.section}>
        <div style={S.sectionLabel}>Temperature</div>
        <Sparkline
          obsPoints={weather.obsPoints}
          forecastPoints={weather.forecastPoints}
          unit={city.unit}
          projectedMax={weather.projectedMax}
          projectedMaxHour={weather.projectedMaxHour}
          confidence={weather.confidence}
          sigma={weather.sigma}
          currentHour={currentHour}
        />
      </div>

      {/* Mercados Polymarket */}
      {markets.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionLabel}>Market ↗</div>
          {markets.slice(0, 3).map(m => (
            <MarketChart key={m.id} tokens={m.tokens} question={m.question} link={m.link} />
          ))}
        </div>
      )}

      {/* METAR raw */}
      <div style={S.rawMetar}>
        Raw METAR<br />{weather.rawMetar}
      </div>
      <a
        href={`https://www.wunderground.com/forecast/${city.station}`}
        target="_blank" rel="noreferrer" style={S.wunderLink}
      >
        history on wunderground ↗
      </a>
    </main>
  );
}