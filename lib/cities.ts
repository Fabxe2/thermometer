export type City = {
  slug: string; name: string; station: string; lat: number; lon: number;
  timezone: string; tzAbbr: string; unit: "F" | "C";
  polymarketSlug: string; wundergroundSlug: string; region: "us" | "intl";
};

export const CITIES: City[] = [
  { slug:"nyc", name:"New York", station:"KLGA", lat:40.7769, lon:-73.8740, timezone:"America/New_York", tzAbbr:"ET", unit:"F", polymarketSlug:"highest-temperature-in-nyc-on", wundergroundSlug:"us/ny/new-york-city/KLGA", region:"us" },
  { slug:"chicago", name:"Chicago", station:"KORD", lat:41.9742, lon:-87.9073, timezone:"America/Chicago", tzAbbr:"CT", unit:"F", polymarketSlug:"highest-temperature-in-chicago-on", wundergroundSlug:"us/il/chicago/KORD", region:"us" },
  { slug:"dallas", name:"Dallas", station:"KDFW", lat:32.8998, lon:-97.0403, timezone:"America/Chicago", tzAbbr:"CT", unit:"F", polymarketSlug:"highest-temperature-in-dallas-on", wundergroundSlug:"us/tx/dallas/KDFW", region:"us" },
  { slug:"miami", name:"Miami", station:"KMIA", lat:25.7959, lon:-80.2870, timezone:"America/New_York", tzAbbr:"ET", unit:"F", polymarketSlug:"highest-temperature-in-miami-on", wundergroundSlug:"us/fl/miami/KMIA", region:"us" },
  { slug:"seattle", name:"Seattle", station:"KSEA", lat:47.4489, lon:-122.3094, timezone:"America/Los_Angeles", tzAbbr:"PT", unit:"F", polymarketSlug:"highest-temperature-in-seattle-on", wundergroundSlug:"us/wa/seattle/KSEA", region:"us" },
  { slug:"atlanta", name:"Atlanta", station:"KATL", lat:33.6367, lon:-84.4281, timezone:"America/New_York", tzAbbr:"ET", unit:"F", polymarketSlug:"highest-temperature-in-atlanta-on", wundergroundSlug:"us/ga/atlanta/KATL", region:"us" },
  { slug:"london", name:"London", station:"EGLL", lat:51.4775, lon:-0.4614, timezone:"Europe/London", tzAbbr:"GMT", unit:"C", polymarketSlug:"highest-temperature-in-london-on", wundergroundSlug:"gb/england/london/EGLL", region:"intl" },
  { slug:"toronto", name:"Toronto", station:"CYYZ", lat:43.6772, lon:-79.6306, timezone:"America/Toronto", tzAbbr:"ET", unit:"C", polymarketSlug:"highest-temperature-in-toronto-on", wundergroundSlug:"ca/ontario/toronto/CYYZ", region:"intl" },
  { slug:"seoul", name:"Seoul", station:"RKSS", lat:37.5583, lon:126.7906, timezone:"Asia/Seoul", tzAbbr:"KST", unit:"C", polymarketSlug:"highest-temperature-in-seoul-on", wundergroundSlug:"kr/seoul/seoul/RKSS", region:"intl" },
  { slug:"buenos-aires", name:"Buenos Aires", station:"SAEZ", lat:-34.8222, lon:-58.5358, timezone:"America/Argentina/Buenos_Aires", tzAbbr:"ART", unit:"C", polymarketSlug:"highest-temperature-in-buenos-aires-on", wundergroundSlug:"ar/buenos-aires/buenos-aires/SAEZ", region:"intl" },
  { slug:"ankara", name:"Ankara", station:"LTAC", lat:40.1281, lon:32.9958, timezone:"Europe/Istanbul", tzAbbr:"TRT", unit:"C", polymarketSlug:"highest-temperature-in-ankara-on", wundergroundSlug:"tr/ankara/ankara/LTAC", region:"intl" },
  { slug:"wellington", name:"Wellington", station:"NZWN", lat:-41.3272, lon:174.8050, timezone:"Pacific/Auckland", tzAbbr:"NZDT", unit:"C", polymarketSlug:"highest-temperature-in-wellington-on", wundergroundSlug:"nz/wellington/wellington/NZWN", region:"intl" },
  { slug:"sao-paulo", name:"São Paulo", station:"SBSP", lat:-23.6261, lon:-46.6564, timezone:"America/Sao_Paulo", tzAbbr:"BRT", unit:"C", polymarketSlug:"highest-temperature-in-sao-paulo-on", wundergroundSlug:"br/sao-paulo/sao-paulo/SBSP", region:"intl" },
  { slug:"paris", name:"Paris", station:"LFPG", lat:48.9794, lon:2.5800, timezone:"Europe/Paris", tzAbbr:"CET", unit:"C", polymarketSlug:"highest-temperature-in-paris-on", wundergroundSlug:"fr/ile-de-france/paris/LFPG", region:"intl" },
];

export function getCityBySlug(slug: string): City | undefined {
  return CITIES.find(c => c.slug === slug);
}

export function getLocalTime(timezone: string, tzAbbr: string): string {
  try {
    const f = new Date().toLocaleTimeString("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true });
    return `${f} ${tzAbbr}`;
  } catch { return ""; }
}

export function formatPolymarketDate(date: Date, timezone: string): string {
  const d = new Date(date.toLocaleString("en-US", { timeZone: timezone }));
  const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  return `${months[d.getMonth()]}-${d.getDate()}-${d.getFullYear()}`;
}

export function cToF(c: number): number { return Math.round(c * 9/5 + 32); }