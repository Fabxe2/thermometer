import { City } from "./cities";

export type MarketBucket = {
  label: string; low: number|null; high: number|null; question: string;
  conditionId: string; yesTokenId: string; yesPrice: number; noPrice: number; isCurrent: boolean;
};

export type PolymarketData = { eventSlug: string; eventUrl: string; buckets: MarketBucket[]; error?: string; };

function getTodaySlugParts(timezone: string): { month: string; day: number; year: number } {
  const now = new Date();
  const local = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  return { month: months[local.getMonth()], day: local.getDate(), year: local.getFullYear() };
}

export async function fetchPolymarketData(city: City, currentTempDisplay: number): Promise<PolymarketData> {
  const { month, day, year } = getTodaySlugParts(city.timezone);
  const dateStr = `${month}-${day}-${year}`;
  const eventSlug = `${city.polymarketSlug}-${dateStr}`;
  const eventUrl = `https://polymarket.com/event/${eventSlug}`;

  // Try multiple approaches to find today's event
  const attempts = [
    `https://gamma-api.polymarket.com/events?slug=${eventSlug}`,
    `https://gamma-api.polymarket.com/events?slug=${eventSlug}&active=true`,
  ];

  for (const url of attempts) {
    try {
      const res = await fetch(url, {
        next: { revalidate: 60 },
        headers: { "User-Agent": "thermometer-app/1.0" }
      });
      if (!res.ok) continue;
      const events = await res.json();
      if (!Array.isArray(events) || events.length === 0) continue;

      const event = events[0];
      const markets: Array<{
        conditionId: string; question: string; clobTokenIds: string[];
        outcomePrices: string[]; outcomes: string[];
      }> = event.markets ?? [];

      if (markets.length === 0) continue;

      const buckets: MarketBucket[] = markets.map(m => {
        const q = m.question ?? "";
        let low: number|null = null, high: number|null = null;
        const between = q.match(/between\s+([-\d.]+)[\u2013\-]([-\d.]+)/i);
        const orBelow = q.match(/([-\d.]+)[°℃℉FC]\s+or\s+below/i);
        const orAbove = q.match(/([-\d.]+)[°℃℉FC]\s+or\s+above/i);
        if (between) { low = parseFloat(between[1]); high = parseFloat(between[2]); }
        else if (orBelow) { high = parseFloat(orBelow[1]); }
        else if (orAbove) { low = parseFloat(orAbove[1]); }
        const prices = (m.outcomePrices ?? ["0","1"]).map(Number);
        const yesPrice = prices[0] ?? 0;
        const noPrice = prices[1] ?? 1 - yesPrice;
        const isCurrent = (low == null || currentTempDisplay >= low) && (high == null || currentTempDisplay <= high);
        let label = "";
        if (between) label = `${Math.round(low!)}-${Math.round(high!)}°`;
        else if (orBelow) label = `≤${Math.round(high!)}°`;
        else if (orAbove) label = `≥${Math.round(low!)}°`;
        else label = q.substring(0, 15);
        return {
          label, low, high, question: q,
          conditionId: m.conditionId,
          yesTokenId: m.clobTokenIds?.[0] ?? "",
          yesPrice, noPrice, isCurrent
        };
      });

      buckets.sort((a, b) => (a.low ?? -Infinity) - (b.low ?? -Infinity));
      return { eventSlug, eventUrl, buckets };
    } catch { continue; }
  }

  // Fallback: search by keyword
  try {
    const cityName = city.name.toLowerCase().replace(/ /g, '-').replace(/ã|á|â/g, 'a').replace(/é|ê/g, 'e').replace(/ó|ô/g, 'o');
    const searchUrl = `https://gamma-api.polymarket.com/events?tag=Daily+Temperature&limit=20`;
    const res = await fetch(searchUrl, {
      next: { revalidate: 300 },
      headers: { "User-Agent": "thermometer-app/1.0" }
    });
    if (res.ok) {
      const events = await res.json();
      if (Array.isArray(events)) {
        const todayEvent = events.find((e: { slug?: string }) =>
          e.slug?.includes(cityName) && e.slug?.includes(dateStr)
        );
        if (todayEvent?.markets?.length > 0) {
          return fetchPolymarketData(city, currentTempDisplay); // retry with correct slug
        }
      }
    }
  } catch { /* ignore */ }

  return { eventSlug, eventUrl, buckets: [], error: `No market found for ${eventSlug}` };
}