import { City, cToF } from "./cities";

export type WeatherObs = {
  tempC: number; tempDisplay: number; unit: "F"|"C"; station: string;
  observedAt: string; observedISO: string; windSpeed: number|null;
  windDir: number|null; cloudCover: string|null; pressure: number|null;
  dewpoint: number|null; rawMetar: string|null; source: string;
};
export type HourlyPoint = { time: string; tempC: number; };
export type ForecastDay  = { maxC: number; minC: number; maxDisplay: number; minDisplay: number; };
export type WeatherData  = { current: WeatherObs|null; hourly: HourlyPoint[]; forecast: ForecastDay|null; error?: string; };

// ─── METAR parser ──────────────────────────────────────────────────────────
// Parses temperature from a raw METAR string like "SAEZ 130000Z ... 21/17 Q1012"
function parseTempFromMetar(metar: string): number | null {
  // Temperature format: TT/DD or M TT/DD (M = minus)
  // e.g. "21/17"  "M02/M05"  "00/M02"
  const match = metar.match(/\b(M?\d{2})\/M?\d{2}\b/);
  if (!match) return null;
  const raw = match[1];
  const isNeg = raw.startsWith('M');
  const val = parseInt(raw.replace('M', ''), 10);
  return isNeg ? -val : val;
}

function parseWindFromMetar(metar: string): { speed: number|null; dir: number|null } {
  const match = metar.match(/(\d{3})(\d{2,3})KT/);
  if (!match) return { speed: null, dir: null };
  return { dir: parseInt(match[1],10), speed: parseInt(match[2],10) };
}

function parsePressureFromMetar(metar: string): number|null {
  const q = metar.match(/Q(\d{4})/);
  if (q) return parseInt(q[1], 10);
  const a = metar.match(/A(\d{4})/);
  if (a) return Math.round(parseInt(a[1],10) * 0.03386); // inHg to hPa
  return null;
}

function parseCloudFromMetar(metar: string): string|null {
  const match = metar.match(/(CLR|SKC|CAVOK|FEW|SCT|BKN|OVC)/);
  return match?.[1] ?? null;
}

// ─── tgftp.nws.noaa.gov — METAR for ANY station worldwide ──────────────────
async function fetchTgftpMetar(station: string, timezone: string): Promise<WeatherObs|null> {
  try {
    const url = `https://tgftp.nws.noaa.gov/data/observations/metar/stations/${station}.TXT`;
    const res = await fetch(url, { next: { revalidate: 300 } as RequestInit["next"] });
    if (!res.ok) return null;
    const text = await res.text();
    // File format: line 1 = timestamp, line 2 = raw METAR
    const lines = text.trim().split('\n');
    const rawMetar = lines[1]?.trim() ?? lines[0]?.trim() ?? '';
    if (!rawMetar) return null;

    const tempC = parseTempFromMetar(rawMetar);
    if (tempC == null) return null;

    const { speed, dir } = parseWindFromMetar(rawMetar);
    const pressure = parsePressureFromMetar(rawMetar);
    const cloudCover = parseCloudFromMetar(rawMetar);

    // Parse observation time from METAR (DDHHmmZ)
    const timeMatch = rawMetar.match(/\b(\d{2})(\d{2})(\d{2})Z\b/);
    let observedAt = "";
    let observedISO = new Date().toISOString();
    if (timeMatch) {
      const now = new Date();
      const day  = parseInt(timeMatch[1], 10);
      const hour = parseInt(timeMatch[2], 10);
      const min  = parseInt(timeMatch[3], 10);
      const obs  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, hour, min));
      observedISO = obs.toISOString();
      observedAt  = obs.toLocaleTimeString("en-US", { timeZone: timezone, hour:"numeric", minute:"2-digit", hour12:true });
    }

    return {
      tempC, tempDisplay: tempC, unit: "C", station,
      observedAt, observedISO,
      windSpeed: speed, windDir: dir,
      cloudCover, pressure, dewpoint: null,
      rawMetar, source: "tgftp",
    };
  } catch { return null; }
}

// ─── api.weather.gov — hourly + forecast (US only) ─────────────────────────
async function fetchNWSHourly(lat: number, lon: number): Promise<HourlyPoint[]> {
  try {
    const pr = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      { headers: { "User-Agent": "thermometer-app/1.0" }, next: { revalidate: 3600 } as RequestInit["next"] });
    if (!pr.ok) return [];
    const pj = await pr.json();
    const url: string = pj.properties?.forecastHourly;
    if (!url) return [];
    const fr = await fetch(url, { headers: { "User-Agent": "thermometer-app/1.0" }, next: { revalidate: 3600 } as RequestInit["next"] });
    if (!fr.ok) return [];
    const fj = await fr.json();
    return (fj.properties?.periods ?? []).slice(0,24).map((p: {startTime:string;temperature:number;temperatureUnit:string}) => ({
      time: p.startTime,
      tempC: p.temperatureUnit==="F" ? (p.temperature-32)*5/9 : p.temperature,
    }));
  } catch { return []; }
}

async function fetchNWSForecast(lat: number, lon: number): Promise<ForecastDay|null> {
  try {
    const pr = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      { headers: { "User-Agent": "thermometer-app/1.0" }, next: { revalidate: 3600 } as RequestInit["next"] });
    if (!pr.ok) return null;
    const pj = await pr.json();
    const url: string = pj.properties?.forecast;
    if (!url) return null;
    const fr = await fetch(url, { headers: { "User-Agent": "thermometer-app/1.0" }, next: { revalidate: 3600 } as RequestInit["next"] });
    if (!fr.ok) return null;
    const fj = await fr.json();
    const periods: Array<{isDaytime:boolean;temperature:number;temperatureUnit:string}> = fj.properties?.periods ?? [];
    const day   = periods.find(p => p.isDaytime);
    const night = periods.find(p => !p.isDaytime);
    const toC   = (t:number, u:string) => u==="F" ? (t-32)*5/9 : t;
    if (!day || !night) return null;
    return { maxC: toC(day.temperature, day.temperatureUnit), minC: toC(night.temperature, night.temperatureUnit), maxDisplay:0, minDisplay:0 };
  } catch { return null; }
}

// ─── Open-Meteo — hourly + forecast for ALL cities (fallback / intl) ────────
async function fetchOpenMeteoHourlyForecast(city: City): Promise<{ hourly: HourlyPoint[]; forecast: ForecastDay|null }> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&hourly=temperature_2m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
    const res = await fetch(url, { next: { revalidate: 3600 } as RequestInit["next"] });
    if (!res.ok) return { hourly: [], forecast: null };
    const json = await res.json();
    const hourly: HourlyPoint[] = (json.hourly.time as string[]).map((t:string, i:number) => ({ time: t, tempC: json.hourly.temperature_2m[i] }));
    const maxC: number = json.daily.temperature_2m_max[0];
    const minC: number = json.daily.temperature_2m_min[0];
    return { hourly, forecast: { maxC, minC, maxDisplay:0, minDisplay:0 } };
  } catch { return { hourly: [], forecast: null }; }
}

// ─── Open-Meteo current (last resort fallback) ──────────────────────────────
async function fetchOpenMeteoCurrent(city: City): Promise<WeatherObs|null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m&timezone=auto`;
    const res = await fetch(url, { next: { revalidate: 600 } as RequestInit["next"] });
    if (!res.ok) return null;
    const json = await res.json();
    const tempC: number = json.current.temperature_2m;
    const now = new Date();
    const observedAt = now.toLocaleTimeString("en-US", { timeZone: city.timezone, hour:"numeric", minute:"2-digit", hour12:true });
    return {
      tempC, tempDisplay: tempC, unit:"C", station: city.station,
      observedAt, observedISO: now.toISOString(),
      windSpeed: json.current.wind_speed_10m ?? null,
      windDir:   json.current.wind_direction_10m ?? null,
      cloudCover: null, pressure: null, dewpoint: null, rawMetar: null, source: "open-meteo",
    };
  } catch { return null; }
}

// ─── Apply unit conversion ───────────────────────────────────────────────────
function applyUnit(obs: WeatherObs, city: City): WeatherObs {
  if (city.unit === "F") {
    obs.tempDisplay = cToF(obs.tempC);
    obs.unit = "F";
  } else {
    obs.tempDisplay = Math.round(obs.tempC);
  }
  return obs;
}

function applyForecastUnit(f: ForecastDay, city: City): ForecastDay {
  f.maxDisplay = city.unit==="F" ? cToF(f.maxC) : Math.round(f.maxC);
  f.minDisplay = city.unit==="F" ? cToF(f.minC) : Math.round(f.minC);
  return f;
}

// ─── Main export ─────────────────────────────────────────────────────────────
export async function fetchWeatherData(city: City): Promise<WeatherData> {
  // 1. Always try tgftp METAR first (same source as original site, works for ALL stations worldwide)
  const [metarObs, { hourly, forecast: omForecast }] = await Promise.all([
    fetchTgftpMetar(city.station, city.timezone),
    fetchOpenMeteoHourlyForecast(city),
  ]);

  // 2. For US cities also try NWS forecast (more accurate high/low)
  let forecast = omForecast;
  let hourlyFinal = hourly;

  if (city.region === "us") {
    const [nwsHourly, nwsForecast] = await Promise.all([
      fetchNWSHourly(city.lat, city.lon),
      fetchNWSForecast(city.lat, city.lon),
    ]);
    if (nwsHourly.length > 0) hourlyFinal = nwsHourly;
    if (nwsForecast) forecast = nwsForecast;
  }

  // 3. Apply forecast unit
  if (forecast) forecast = applyForecastUnit(forecast, city);

  // 4. Use METAR if available, fallback to Open-Meteo current
  if (metarObs) {
    return { current: applyUnit(metarObs, city), hourly: hourlyFinal, forecast };
  }

  // 5. Last resort: Open-Meteo current temp
  const omCurrent = await fetchOpenMeteoCurrent(city);
  if (omCurrent) {
    return { current: applyUnit(omCurrent, city), hourly: hourlyFinal, forecast };
  }

  return { current: null, hourly: hourlyFinal, forecast };
}