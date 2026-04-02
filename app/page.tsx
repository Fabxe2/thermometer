import { CITIES, getLocalTime, cToF } from '../lib/cities';
import { getWeatherData } from '../lib/weather';

async function CityCard({ city }: { city: typeof CITIES[0] }) {
  let temp: number | null = null;
  let proj: number | null = null;
  let conf: number | null = null;
  try {
    const w = await getWeatherData(city);
    temp = w.currentTemp;
    proj = w.projectedMax;
    conf = w.confidence;
  } catch {}

  const localTime = getLocalTime(city.timezone, city.tzAbbr);
  const confColor = conf === null ? 'var(--muted)' : conf >= 70 ? '#4ade80' : conf >= 45 ? '#facc15' : '#f87171';

  return (
    <a
      href={`/city/${city.slug}`}
      style={{
        display: 'block', padding: '14px 16px',
        borderTop: '1px solid var(--rule)',
        textDecoration: 'none', color: 'inherit',
        transition: 'background .15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.03)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: 15 }}>{city.name}</span>
          <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>{city.station}</span>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
          {conf !== null && (
            <span style={{ fontSize: 11, color: confColor }}>conf {conf}%</span>
          )}
          {proj !== null && (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              max <strong style={{ color: '#fff' }}>{proj}°{city.unit}</strong>
            </span>
          )}
          {temp !== null && (
            <span style={{ fontSize: 22, fontWeight: 300 }}>{temp}°{city.unit}</span>
          )}
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 2 }}>{localTime}</div>
    </a>
  );
}

export default function Home() {
  const us   = CITIES.filter(c => c.region === 'us');
  const intl = CITIES.filter(c => c.region === 'intl');

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px 64px' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.5 }}>thermometer</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          Live temperature + DTC forecast for Polymarket markets
        </p>
      </div>

      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>
        United States
      </div>
      {us.map(c => <CityCard key={c.slug} city={c} />)}

      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted)', margin: '24px 0 4px' }}>
        International
      </div>
      {intl.map(c => <CityCard key={c.slug} city={c} />)}
    </main>
  );
}