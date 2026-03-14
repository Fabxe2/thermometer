import { City, formatPolymarketDate } from "./cities";

export type MarketBucket = {
  label: string; low: number|null; high: number|null; question: string;
  conditionId: string; yesTokenId: string; yesPrice: number; noPrice: number; isCurrent: boolean;
};

export type PolymarketData = { eventSlug: string; eventUrl: string; buckets: MarketBucket[]; error?: string; };

export async function fetchPolymarketData(city: City, currentTempDisplay: number): Promise<PolymarketData> {
  const today = new Date();
  const dateStr = formatPolymarketDate(today, city.timezone);
  const eventSlug = `${city.polymarketSlug}-${dateStr}`;
  const eventUrl = `https://polymarket.com/event/${eventSlug}`;
  try {
    const url = `https://gamma-api.polymarket.com/events?slug=${eventSlug}`;
    const res = await fetch(url, { next: { revalidate: 60 } as RequestInit["next"] });
    if (!res.ok) throw new Error(`gamma api ${res.status}`);
    const events = await res.json();
    if (!Array.isArray(events) || events.length === 0) return { eventSlug, eventUrl, buckets: [], error: "no event found" };
    const event = events[0];
    const markets: Array<{ conditionId:string; question:string; clobTokenIds:string[]; outcomePrices:string[]; outcomes:string[] }> = event.markets ?? [];
    const buckets: MarketBucket[] = markets.map(m => {
      const q = m.question ?? "";
      let low: number|null = null, high: number|null = null;
      const between = q.match(/between\s+([-\d.]+)[\u2013\-]([-\d.]+)/i);
      const orBelow = q.match(/([-\d.]+)[°℃℉F]\s+or\s+below/i);
      const orAbove = q.match(/([-\d.]+)[°℃℉F]\s+or\s+above/i);
      if (between) { low = parseFloat(between[1]); high = parseFloat(between[2]); }
      else if (orBelow) { high = parseFloat(orBelow[1]); }
      else if (orAbove) { low = parseFloat(orAbove[1]); }
      const prices = (m.outcomePrices ?? ["0","1"]).map(Number);
      const yesPrice = prices[0] ?? 0;
      const noPrice = prices[1] ?? 1 - yesPrice;
      const isCurrent = (low == null || currentTempDisplay >= low) && (high == null || currentTempDisplay <= high);
      let label = q;
      if (between) label = `${Math.round(low!)}-${Math.round(high!)}°`;
      else if (orBelow) label = `≤${Math.round(high!)}°`;
      else if (orAbove) label = `≥${Math.round(low!)}°`;
      return { label, low, high, question: q, conditionId: m.conditionId, yesTokenId: m.clobTokenIds?.[0] ?? "", yesPrice, noPrice, isCurrent };
    });
    buckets.sort((a, b) => (a.low ?? -Infinity) - (b.low ?? -Infinity));
    return { eventSlug, eventUrl, buckets };
  } catch(e) { return { eventSlug, eventUrl, buckets: [], error: String(e) }; }
}