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

function parseTempFromMetar(metar: string): number | null {
  const match = metar.match(/\b(M?\d{2})\/M?\d{2}\b/);
  if (!match) return null;
  const raw = match[1];
  return raw.startsWith('M') ? -parseInt(raw.slice(1), 10) : parseInt(raw, 10);
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
  if (a) return Math.round(parseInt(a[1],10) * 0.03386);
  return null;
}

function parseCloudFromMetar(metar: string): string|null {
  return metar.match(/(CLR|SKC|CAVOK|FEW|SCT|BKN|OVC)/)?.[1] ?? null;
}

// tgftp — 60s revalidate (más rápido que el original que no cachea)
async function fetchTgftpMetar(station: string, timezone: string): Promise<WeatherObs|null> {
  try {
    const url = `https://tgftp.nws.noaa.gov/data/observations/metar/stations/${station}.TXT`;
    const res = await fetch(url, { next: { revalidate: 60 } as RequestInit["next"] });
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.trim().split('\n');
    const rawMetar = lines[1]?.trim() ?? lines[0]?.trim() ?? '';
    if (!rawMetar) return null;
    const tempC = parseTempFromMetar(rawMetar);
    if (tempC == null) return null;
    const { speed, dir } = parseWindFromMetar(rawMetar);
    const pressure   = parsePressureFromMetar(rawMetar);
    const cloudCover = parseCloudFromMetar(rawMetar);
    const timeMatch  = rawMetar.match(/\b(\d{2})(\d{2})(\d{2})Z\b/);
    let observedAt = "", observedISO = new Date().toISOString();
    if (timeMatch) {
      const now = new Date();
      const obs = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(),
        parseInt(timeMatch[1],10), parseInt(timeMatch[2],10), parseInt(timeMatch[3],10)));
      observedISO = obs.toISOString();
      observedAt  = obs.toLocaleTimeString("en-US", { timeZone: timezone, hour:"numeric", minute:"2-digit", hour12:true });
    }
    return { tempC, tempDisplay: tempC, unit:"C", station, observedAt, observedISO, windSpeed: speed, windDir: dir, cloudCover, pressure, dewpoint: null, rawMetar, source:"tgftp" };
  } catch { return null; }
}

// NWS hourly — 300s (era 3600s)
async function fetchNWSHourly(lat: number, lon: number): Promise<HourlyPoint[]> {
  try {
    const pr = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      { headers: { "User-Agent": "thermometer-app/1.0" }, next: { revalidate: 300 } as RequestInit["next"] });
    if (!pr.ok) return [];
    const pj = await pr.json();
    const url: string = pj.properties?.forecastHourly;
    if (!url) return [];
    const fr = await fetch(url, { headers: { "User-Agent": "thermometer-app/1.0" }, next: { revalidate: 300 } as RequestInit["next"] });
    if (!fr.ok) return [];
    const fj = await fr.json();
    return (fj.properties?.periods ?? []).slice(0,24).map((p: {startTime:string;temperature:number;temperatureUnit:string}) => ({
      time: p.startTime,
      tempC: p.temperatureUnit==="F" ? (p.temperature-32)*5/9 : p.temperature,
    }));
  } catch { return []; }
}

// NWS forecast — 300s (era 3600s)
async function fetchNWSForecast(lat: number, lon: number): Promise<ForecastDay|null> {
  try {
    const pr = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      { headers: { "User-Agent": "thermometer-app/1.0" }, next: { revalidate: 300 } as RequestInit["next"] });
    if (!pr.ok) return null;
    const pj = await pr.json();
    const url: string = pj.properties?.forecast;
    if (!url) return null;
    const fr = await fetch(url, { headers: { "User-Agent": "thermometer-app/1.0" }, next: { revalidate: 300 } as RequestInit["next"] });
    if (!fr.ok) return null;
    const fj = await fr.json();
    const periods: Array<{isDaytime:boolean;temperature:number;temperatureUnit:string}> = fj.properties?.periods ?? [];
    const day = periods.find(p => p.isDaytime), night = periods.find(p => !p.isDaytime);
    const toC = (t:number, u:string) => u==="F" ? (t-32)*5/9 : t;
    if (!day || !night) return null;
    return { maxC: toC(day.temperature, day.temperatureUnit), minC: toC(night.temperature, night.temperatureUnit), maxDisplay:0, minDisplay:0 };
  } catch { return null; }
}

// Open-Meteo hourly+forecast — 300s (era 3600s)
async function fetchOpenMeteoHourlyForecast(city: City): Promise<{ hourly: HourlyPoint[]; forecast: ForecastDay|null }> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&hourly=temperature_2m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
    const res = await fetch(url, { next: { revalidate: 300 } as RequestInit["next"] });
    if (!res.ok) return { hourly: [], forecast: null };
    const json = await res.json();
    const hourly: HourlyPoint[] = (json.hourly.time as string[]).map((t:string, i:number) => ({ time: t, tempC: json.hourly.temperature_2m[i] }));
    return { hourly, forecast: { maxC: json.daily.temperature_2m_max[0], minC: json.daily.temperature_2m_min[0], maxDisplay:0, minDisplay:0 } };
  } catch { return { hourly: [], forecast: null }; }
}

// Open-Meteo current — 60s (era 600s)
async function fetchOpenMeteoCurrent(city: City): Promise<WeatherObs|null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m&timezone=auto`;
    const res = await fetch(url, { next: { revalidate: 60 } as RequestInit["next"] });
    if (!res.ok) return null;
    const json = await res.json();
    const tempC: number = json.current.temperature_2m;
    const now = new Date();
    const observedAt = now.toLocaleTimeString("en-US", { timeZone: city.timezone, hour:"numeric", minute:"2-digit", hour12:true });
    return { tempC, tempDisplay: tempC, unit:"C", station: city.station, observedAt, observedISO: now.toISOString(), windSpeed: json.current.wind_speed_10m ?? null, windDir: json.current.wind_direction_10m ?? null, cloudCover: null, pressure: null, dewpoint: null, rawMetar: null, source:"open-meteo" };
  } catch { return null; }
}

function applyUnit(obs: WeatherObs, city: City): WeatherObs {
  obs.tempDisplay = city.unit==="F" ? cToF(obs.tempC) : Math.round(obs.tempC);
  obs.unit = city.unit;
  return obs;
}

function applyForecastUnit(f: ForecastDay, city: City): ForecastDay {
  f.maxDisplay = city.unit==="F" ? cToF(f.maxC) : Math.round(f.maxC);
  f.minDisplay = city.unit==="F" ? cToF(f.minC) : Math.round(f.minC);
  return f;
}

export async function fetchWeatherData(city: City): Promise<WeatherData> {
  const [metarObs, { hourly, forecast: omForecast }] = await Promise.all([
    fetchTgftpMetar(city.station, city.timezone),
    fetchOpenMeteoHourlyForecast(city),
  ]);

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

  if (forecast) forecast = applyForecastUnit(forecast, city);

  if (metarObs) return { current: applyUnit(metarObs, city), hourly: hourlyFinal, forecast };

  const omCurrent = await fetchOpenMeteoCurrent(city);
  if (omCurrent) return { current: applyUnit(omCurrent, city), hourly: hourlyFinal, forecast };

  return { current: null, hourly: hourlyFinal, forecast };
}