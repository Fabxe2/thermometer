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

// outcomePrices can come as string[] OR as a JSON string like '["0.5","0.5"]'
function parsePrices(raw: unknown): number[] {
  if (!raw) return [0, 1];
  let arr: unknown = raw;
  if (typeof arr === "string") {
    try { arr = JSON.parse(arr); } catch { return [0, 1]; }
  }
  if (!Array.isArray(arr)) return [0, 1];
  return (arr as unknown[]).map(v => parseFloat(String(v)) || 0);
}

type RawMarket = {
  conditionId: string;
  question: string;
  clobTokenIds?: string[];
  outcomePrices?: unknown;
};

async function tryFetchEvent(slug: string): Promise<{ markets: RawMarket[] } | null> {
  try {
    const res = await fetch(
      `https://gamma-api.polymarket.com/events?slug=${slug}`,
      { next: { revalidate: 60 } as RequestInit["next"], headers: { "User-Agent": "thermometer/1.0" } }
    );
    if (!res.ok) return null;
    const events = await res.json();
    if (!Array.isArray(events) || events.length === 0) return null;
    const event = events[0];
    if (!event?.markets?.length) return null;
    return event;
  } catch { return null; }
}

function parseBuckets(markets: RawMarket[], currentTempDisplay: number): MarketBucket[] {
  const buckets: MarketBucket[] = markets.map(m => {
    const q = m.question ?? "";
    let low: number|null = null, high: number|null = null;
    const between = q.match(/between\s+([-\d.]+)[\u2013\-]([-\d.]+)/i);
    const orBelow  = q.match(/([-\d.]+)[°℃℉FC]\s+or\s+below/i);
    const orAbove  = q.match(/([-\d.]+)[°℃℉FC]\s+or\s+above/i);
    if (between)      { low = parseFloat(between[1]); high = parseFloat(between[2]); }
    else if (orBelow) { high = parseFloat(orBelow[1]); }
    else if (orAbove) { low  = parseFloat(orAbove[1]); }

    const prices   = parsePrices(m.outcomePrices);
    const yesPrice = prices[0] ?? 0;
    const noPrice  = prices[1] ?? (1 - yesPrice);
    const isCurrent = (low == null || currentTempDisplay >= low) && (high == null || currentTempDisplay <= high);

    let label = "";
    if (between)      label = `${Math.round(low!)}-${Math.round(high!)}°`;
    else if (orBelow) label = `≤${Math.round(high!)}°`;
    else if (orAbove) label = `≥${Math.round(low!)}°`;
    else              label = q.substring(0, 12);

    return {
      label, low, high, question: q,
      conditionId: m.conditionId,
      yesTokenId: m.clobTokenIds?.[0] ?? "",
      yesPrice, noPrice, isCurrent
    };
  });
  buckets.sort((a, b) => (a.low ?? -Infinity) - (b.low ?? -Infinity));
  return buckets;
}

export async function fetchPolymarketData(city: City, currentTempDisplay: number): Promise<PolymarketData> {
  const now = new Date();

  // Try today in city timezone, then yesterday and tomorrow
  // (Vercel runs UTC; city may be behind or ahead)
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
  return {
    eventSlug,
    eventUrl: `https://polymarket.com/event/${eventSlug}`,
    buckets: [],
    error: "No Polymarket event found"
  };
}