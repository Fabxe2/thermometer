import { City } from "./cities";

export type MarketBucket = {
  label: string; low: number|null; high: number|null; question: string;
  conditionId: string; yesTokenId: string; yesPrice: number; noPrice: number; isCurrent: boolean;
};

export type PolymarketData = {
  eventSlug: string; eventUrl: string; buckets: MarketBucket[]; error?: string;
};

const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];

function dateToSlug(d: Date, timezone: string): string {
  const local = new Date(d.toLocaleString("en-US", { timeZone: timezone }));
  return `${MONTHS[local.getMonth()]}-${local.getDate()}-${local.getFullYear()}`;
}

function parsePrices(raw: unknown): number[] {
  if (!raw) return [0, 1];
  let arr: unknown = raw;
  if (typeof arr === "string") { try { arr = JSON.parse(arr); } catch { return [0, 1]; } }
  if (!Array.isArray(arr)) return [0, 1];
  return (arr as unknown[]).map(v => parseFloat(String(v)) || 0);
}

type RawMarket = { conditionId: string; question: string; clobTokenIds?: string[]; outcomePrices?: unknown; };

function parseQuestion(q: string): { low: number|null; high: number|null; label: string } {
  const between = q.match(/between\s+([-\d.]+)[\u2013\-]([-\d.]+)/i);
  const orBelow  = q.match(/([-\d.]+)[°℃℉FCfc]\s+or\s+below/i);
  const orAbove  = q.match(/([-\d.]+)[°℃℉FCfc]\s+or\s+above/i);
  const exact    = q.match(/be\s+([-\d.]+)[°℃℉FCfc]\s+on/i);
  const beOr     = q.match(/be\s+([-\d.]+)[°℃℉FCfc]\s+or/i);
  if (between) { const l = parseFloat(between[1]), h = parseFloat(between[2]); return { low:l, high:h, label:`${Math.round(l)}-${Math.round(h)}°` }; }
  if (orBelow) { const h = parseFloat(orBelow[1]); return { low:null, high:h, label:`≤${Math.round(h)}°` }; }
  if (orAbove) { const l = parseFloat(orAbove[1]); return { low:l, high:null, label:`≥${Math.round(l)}°` }; }
  if (exact)   { const v = parseFloat(exact[1]);   return { low:v, high:v, label:`${Math.round(v)}°` }; }
  if (beOr)    { const v = parseFloat(beOr[1]);    return { low:v, high:v, label:`${Math.round(v)}°` }; }
  const num = q.match(/([-\d.]+)[°℃℉FCfc]/);
  if (num) { const v = parseFloat(num[1]); return { low:v, high:v, label:`${Math.round(v)}°` }; }
  return { low:null, high:null, label:q.substring(0,8) };
}

async function tryFetchEvent(slug: string): Promise<{ markets: RawMarket[] }|null> {
  try {
    const res = await fetch(
      `https://gamma-api.polymarket.com/events?slug=${slug}`,
      { next: { revalidate: 30 } as RequestInit["next"], headers: { "User-Agent": "thermometer/1.0" } }
    );
    if (!res.ok) return null;
    const events = await res.json();
    if (!Array.isArray(events) || !events.length) return null;
    const event = events[0];
    if (!event?.markets?.length) return null;
    return event;
  } catch { return null; }
}

function parseBuckets(markets: RawMarket[], currentTempDisplay: number): MarketBucket[] {
  const buckets: MarketBucket[] = markets.map(m => {
    const q = m.question ?? "";
    const { low, high, label } = parseQuestion(q);
    const prices   = parsePrices(m.outcomePrices);
    const yesPrice = prices[0] ?? 0;
    const noPrice  = prices[1] ?? (1 - yesPrice);
    const isCurrent = (low == null || currentTempDisplay >= low - 0.5) && (high == null || currentTempDisplay <= high + 0.5);
    return { label, low, high, question: q, conditionId: m.conditionId, yesTokenId: m.clobTokenIds?.[0] ?? "", yesPrice, noPrice, isCurrent };
  });
  buckets.sort((a, b) => (a.low ?? -Infinity) - (b.low ?? -Infinity));
  return buckets;
}

export async function fetchPolymarketData(city: City, currentTempDisplay: number): Promise<PolymarketData> {
  const now = new Date();
  const datesToTry = [
    dateToSlug(now, city.timezone),
    dateToSlug(new Date(now.getTime() - 86400000), city.timezone),
    dateToSlug(new Date(now.getTime() + 86400000), city.timezone),
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
  const todaySlug = dateToSlug(now, city.timezone);
  const eventSlug = `${city.polymarketSlug}-${todaySlug}`;
  return { eventSlug, eventUrl: `https://polymarket.com/event/${eventSlug}`, buckets: [], error: "No Polymarket event found" };
}