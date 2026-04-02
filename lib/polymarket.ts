// lib/polymarket.ts
export type Market = {
  id: string; question: string; slug: string;
  tokens: { outcome: string; price: number }[];
  volume: number; liquidity: number; endDate: string; link: string;
};

export type CityMarkets = { markets: Market[]; matchedStation?: string };

const GAMMA = 'https://gamma-api.polymarket.com';

function matchesStation(question: string, city: string, station: string): boolean {
  const q = question.toLowerCase();
  const c = city.toLowerCase();
  const s = station.toLowerCase();
  return q.includes(s) || q.includes(c) || (c === 'new york' && q.includes('lga')) ||
    (c === 'buenos aires' && (q.includes('ezeiza') || q.includes('saez')));
}

export async function getCityMarkets(city: string, station: string): Promise<CityMarkets> {
  try {
    const res = await fetch(`${GAMMA}/markets?closed=false&limit=50&tag=weather`, { next: { revalidate: 300 } });
    if (!res.ok) return { markets: [] };
    const data = await res.json();
    const markets: Market[] = (data.markets ?? data ?? [])
      .filter((m: Record<string, unknown>) => matchesStation(String(m.question ?? ''), city, station))
      .map((m: Record<string, unknown>) => ({
        id:         String(m.id),
        question:   String(m.question),
        slug:       String(m.slug ?? m.conditionId ?? m.id),
        tokens:     (m.tokens as {outcome:string;price:number}[] ?? []).map(t => ({
          outcome: t.outcome,
          price:   Math.round(Number(t.price) * 100),
        })),
        volume:     Number(m.volume ?? 0),
        liquidity:  Number(m.liquidity ?? 0),
        endDate:    String(m.endDate ?? m.end_date_iso ?? ''),
        link:       'https://polymarket.com/event/' + String(m.slug ?? m.conditionId ?? m.id),
      }));
    return { markets, matchedStation: markets.length ? station : undefined };
  } catch {
    return { markets: [] };
  }
}