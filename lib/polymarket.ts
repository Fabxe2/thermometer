import { City } from "./cities";

export type MarketBucket = {
  label: string; low: number|null; high: number|null; question: string;
  conditionId: string; yesTokenId: string; yesPrice: number; noPrice: number; isCurrent: boolean;
};

export type PolymarketData = {
  eventSlug: string; eventUrl: string; buckets: MarketBucket[]; error?: string;
};

const MONTH_NAMES = ["january","february","march","april","may","june","july","august","september","october","november","december"];

function dateToSlug(d: Date, timezone: string): string {
  // Convert UTC date to local date in the given timezone
  const local = new Date(d.toLocaleString("en-US", { timeZone: timezone }));
  return `${MONTH_NAMES[local.getMonth()]}-${local.getDate()}-${local.getFullYear()}`;
}

async function tryFetchEvent(slug: string): Promise<{ markets: Array<{ conditionId:string; question:string; clobTokenIds:string[]; outcomePrices:string[] }> } | null> {
  try {
    const res = await fetch(
      `https://gamma-api.polymarket.com/events?slug=${slug}`,
      { next: { revalidate: 60 }, headers: { "User-Agent": "thermometer/1.0" } }
    );
    if (!res.ok) return null;
    const events = await res.json();
    if (!Array.isArray(events) || events.length === 0) return null;
    const event = events[0];
    if (!event?.markets?.length) return null;
    return event;
  } catch { return null; }
}

function parseBuckets(markets: Array<{ conditionId:string; question:string; clobTokenIds:string[]; outcomePrices:string[] }>, currentTempDisplay: number): MarketBucket[] {
  const buckets: MarketBucket[] = markets.map(m => {
    const q = m.question ?? "";
    let low: number|null = null, high: number|null = null;
    const between = q.match(/between\s+([-\d.]+)[\u2013\-]([-\d.]+)/i);
    const orBelow  = q.match(/([-\d.]+)[°℃℉FC]\s+or\s+below/i);
    const orAbove  = q.match(/([-\d.]+)[°℃℉FC]\s+or\s+above/i);
    if (between)      { low = parseFloat(between[1]); high = parseFloat(between[2]); }
    else if (orBelow) { high = parseFloat(orBelow[1]); }
    else if (orAbove) { low  = parseFloat(orAbove[1]); }
    const prices    = (m.outcomePrices ?? ["0","1"]).map(Number);
    const yesPrice  = prices[0] ?? 0;
    const noPrice   = prices[1] ?? (1 - yesPrice);
    const isCurrent = (low == null || currentTempDisplay >= low) && (high == null || currentTempDisplay <= high);
    let label = "";
    if (between)      label = `${Math.round(low!)}-${Math.round(high!)}°`;
    else if (orBelow) label = `≤${Math.round(high!)}°`;
    else if (orAbove) label = `≥${Math.round(low!)}°`;
    else              label = q.substring(0, 12);
    return { label, low, high, question: q, conditionId: m.conditionId, yesTokenId: m.clobTokenIds?.[0] ?? "", yesPrice, noPrice, isCurrent };
  });
  buckets.sort((a, b) => (a.low ?? -Infinity) - (b.low ?? -Infinity));
  return buckets;
}

export async function fetchPolymarketData(city: City, currentTempDisplay: number): Promise<PolymarketData> {
  const now = new Date();

  // Try today in city timezone, then yesterday (server may be UTC-ahead)
  const datesToTry = [
    dateToSlug(now, city.timezone),
    dateToSlug(new Date(now.getTime() - 86400000), city.timezone), // yesterday
    dateToSlug(new Date(now.getTime() + 86400000), city.timezone), // tomorrow (just in case)
  ];

  for (const dateStr of datesToTry) {
    const eventSlug = `${city.polymarketSlug}-${dateStr}`;
    const eventUrl  = `https://polymarket.com/event/${eventSlug}`;
    const event = await tryFetchEvent(eventSlug);
    if (event) {
      const buckets = parseBuckets(event.markets, currentTempDisplay);
      if (buckets.length > 0) return { eventSlug, eventUrl, buckets };
    }
  }

  // Last resort: return empty with most likely slug
  const todaySlug = dateToSlug(now, city.timezone);
  const eventSlug = `${city.polymarketSlug}-${todaySlug}`;
  return {
    eventSlug,
    eventUrl: `https://polymarket.com/event/${eventSlug}`,
    buckets: [],
    error: "No Polymarket event found for today"
  };
}