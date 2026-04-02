import { City, cToF } from "./cities";

export type Bucket = { label: string; yesPrice: number; noPrice: number; };
export type PolyData = { buckets: Bucket[]; eventUrl: string; };

const GAMMA = 'https://gamma-api.polymarket.com';

function normalizeLabel(raw: string, unit: "F"|"C"): string {
  raw = raw.trim();
  if (/^\d+$/.test(raw)) return raw + "°" + unit;
  if (/^\d+\.\d+$/.test(raw)) return Math.round(parseFloat(raw)) + "°" + unit;
  raw = raw.replace(/°F/gi, '°F').replace(/°C/gi, '°C');
  if (unit === 'F' && raw.includes('°C')) {
    const m = raw.match(/([\d.]+)°C/);
    if (m) return Math.round(cToF(parseFloat(m[1]))) + '°F';
  }
  return raw;
}

export async function fetchPolymarketData(city: City, currentTemp: number): Promise<PolyData> {
  const station = city.station.toLowerCase();
  const name = city.name.toLowerCase();
  const unit = city.unit;
  try {
    const res = await fetch(
      `${GAMMA}/markets?tag_slug=weather&closed=false&limit=100`,
      { cache: 'no-store' }
    );
    if (!res.ok) return { buckets: [], eventUrl: '' };
    const data = await res.json();
    const markets: Record<string, unknown>[] = Array.isArray(data) ? data : (data.markets ?? []);
    const match = markets.find((m) => {
      const q = String(m.question ?? '').toLowerCase();
      return q.includes(station) || q.includes(name) ||
        (name === 'new york' && q.includes('lga')) ||
        (name === 'buenos aires' && (q.includes('ezeiza') || q.includes('saez')));
    });
    if (!match) return { buckets: [], eventUrl: '' };
    const tokens: { outcome: string; price: string }[] = (match.tokens as { outcome: string; price: string }[]) ?? [];
    const buckets: Bucket[] = tokens.map(t => ({
      label: normalizeLabel(t.outcome, unit),
      yesPrice: parseFloat(t.price),
      noPrice: 1 - parseFloat(t.price),
    }));
    const slug = String(match.slug ?? match.conditionId ?? '');
    return { buckets, eventUrl: `https://polymarket.com/event/${slug}` };
  } catch { return { buckets: [], eventUrl: '' }; }
}
