import { City, cToF } from "./cities";

export type WeatherObs = {
  tempC: number; tempDisplay: number; unit: "F"|"C"; station: string;
  observedAt: string; observedISO: string; windSpeed: number|null;
  windDir: number|null; cloudCover: string|null; pressure: number|null;
  dewpoint: number|null; rawMetar: string|null; source: string;
};
export type HourlyPoint = { time: string; tempC: number; };
export type ForecastDay  = { maxC: number; minC: number; maxDisplay: number; minDisplay: number; };
export type WeatherData  = {
  current: WeatherObs|null;
  obsHourly: HourlyPoint[];      // past hours — solid overlay
  forecastHourly: HourlyPoint[]; // ALL 24h — dashed backdrop
  forecast: ForecastDay|null;
};

const WU_KEY = process.env.WU_API_KEY || '';

// ── METAR parsers ─────────────────────────────────────────────────────────
function parseTempFromMetar(metar: string): number | null {
  const tg = metar.match(/\bT([01])(\d{3})[01]\d{3}\b/);
  if (tg) { const s = tg[1]==='1'?-1:1; return s*parseInt(tg[2],10)/10; }
  const m = metar.match(/\b(M?\d{2})\/M?\d{2}\b/);
  if (!m) return null;
  return m[1].startsWith('M') ? -parseInt(m[1].slice(1),10) : parseInt(m[1],10);
}
function parseWindFromMetar(metar: string) {
  const m = metar.match(/(\d{3})(\d{2,3})KT/);
  return m ? { dir:parseInt(m[1],10), speed:parseInt(m[2],10) } : { dir:null, speed:null };
}
function parsePressureFromMetar(metar: string): number|null {
  const q = metar.match(/Q(\d{4})/); if (q) return parseInt(q[1],10);
  const a = metar.match(/A(\d{4})/); if (a) return Math.round(parseInt(a[1],10)*0.03386); return null;
}
function parseCloudFromMetar(metar: string): string|null {
  return metar.match(/(CLR|SKC|CAVOK|FEW|SCT|BKN|OVC)/)?.[1]??null;
}

// ── tgftp current METAR ───────────────────────────────────────────────────
async function fetchTgftpMetar(station: string, timezone: string): Promise<WeatherObs|null> {
  try {
    const res = await fetch(
      `https://tgftp.nws.noaa.gov/data/observations/metar/stations/${station}.TXT`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;
    const lines = (await res.text()).trim().split('\n');
    const rawMetar = lines[1]?.trim()??lines[0]?.trim()??'';
    if (!rawMetar) return null;
    const tempC = parseTempFromMetar(rawMetar); if (tempC==null) return null;
    const {speed,dir} = parseWindFromMetar(rawMetar);
    const tm = rawMetar.match(/\b(\d{2})(\d{2})(\d{2})Z\b/);
    let observedAt='', observedISO=new Date().toISOString();
    if (tm) {
      const now=new Date();
      const obs=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),parseInt(tm[1],10),parseInt(tm[2],10),parseInt(tm[3],10)));
      observedISO=obs.toISOString();
      observedAt=obs.toLocaleTimeString('en-US',{timeZone:timezone,hour:'numeric',minute:'2-digit',hour12:true});
    }
    return { tempC, tempDisplay:tempC, unit:'C', station, observedAt, observedISO,
      windSpeed:speed, windDir:dir, cloudCover:parseCloudFromMetar(rawMetar),
      pressure:parsePressureFromMetar(rawMetar), dewpoint:null, rawMetar, source:'tgftp' };
  } catch { return null; }
}

// ── api.weather.com/v3 hourly forecast — SAME API as the original ────────
// Returns 24h hourly data for today in local time
// validTimeLocal: "2026-03-14T13:00:00+0000" (UTC offset format)
// temperature array: in °F for 'e' units, °C for 'm' units
async function fetchWUHourly(city: City): Promise<{
  all: HourlyPoint[];
  day: ForecastDay | null;
}> {
  if (!WU_KEY) return fetchOMFallback(city);
  try {
    const units = city.unit === 'F' ? 'e' : 'm'; // e=imperial(°F), m=metric(°C)
    const url = `https://api.weather.com/v3/wx/forecast/hourly/1day` +
      `?geocode=${city.lat},${city.lon}` +
      `&units=${units}&language=en-US&format=json` +
      `&apiKey=${WU_KEY}`;

    const json = await fetch(url, { cache: 'no-store' }).then(r => {
      if (!r.ok) throw new Error(`WU ${r.status}`);
      return r.json();
    });

    // validTimeLocal: array of ISO timestamps in local timezone
    const times: string[] = json.validTimeLocal ?? [];
    const temps: number[] = json.temperature ?? [];

    if (!times.length || !temps.length) return fetchOMFallback(city);

    // Convert temps to °C for internal storage (display conversion happens in page)
    const toC = (t: number) => city.unit === 'F' ? (t - 32) * 5 / 9 : t;

    const all: HourlyPoint[] = times.map((t, i) => ({
      time: t,
      tempC: toC(temps[i]),
    }));

    // Daily high/low from the 24h data
    const allTemps = temps.map(toC);
    const day: ForecastDay = {
      maxC: Math.max(...allTemps),
      minC: Math.min(...allTemps),
      maxDisplay: 0,
      minDisplay: 0,
    };

    return { all, day };
  } catch {
    return fetchOMFallback(city);
  }
}

// ── Open-Meteo fallback ───────────────────────────────────────────────────
async function fetchOMFallback(city: City): Promise<{
  all: HourlyPoint[];
  day: ForecastDay | null;
}> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${city.lat}&longitude=${city.lon}` +
      `&hourly=temperature_2m&daily=temperature_2m_max,temperature_2m_min` +
      `&timezone=${encodeURIComponent(city.timezone)}&past_days=1&forecast_days=1`;
    const json = await fetch(url, { cache: 'no-store' }).then(r => r.json());
    const times: string[] = json.hourly.time;
    const temps: number[] = json.hourly.temperature_2m;
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: city.timezone });
    const all = times
      .map((t, i) => ({ time: t, tempC: temps[i] }))
      .filter(p => p.time.startsWith(todayStr));
    const day: ForecastDay = {
      maxC: json.daily.temperature_2m_max[1],
      minC: json.daily.temperature_2m_min[1],
      maxDisplay: 0, minDisplay: 0,
    };
    return { all, day };
  } catch { return { all: [], day: null }; }
}

// ── NWS obs history (US) ──────────────────────────────────────────────────
async function fetchNWSObsHistory(station: string): Promise<HourlyPoint[]> {
  try {
    const res = await fetch(
      `https://api.weather.gov/stations/${station}/observations?limit=24`,
      { headers: { 'User-Agent': 'thermometer/1.0' }, cache: 'no-store' }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json.features ?? [])
      .filter((f: {properties:{temperature:{value:number|null}}}) => f.properties.temperature.value != null)
      .map((f: {properties:{timestamp:string;temperature:{value:number}}}) => ({
        time: f.properties.timestamp,
        tempC: f.properties.temperature.value,
      }))
      .reverse();
  } catch { return []; }
}

// ── NWS hourly forecast (US) ──────────────────────────────────────────────
async function fetchNWSHourlyForecast(lat: number, lon: number): Promise<HourlyPoint[]> {
  try {
    const pr = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      { headers: {'User-Agent':'thermometer/1.0'}, next:{revalidate:3600} as RequestInit['next'] });
    if (!pr.ok) return [];
    const pj = await pr.json(); const url:string=pj.properties?.forecastHourly; if (!url) return [];
    const fr = await fetch(url, { headers: {'User-Agent':'thermometer/1.0'}, next:{revalidate:3600} as RequestInit['next'] });
    if (!fr.ok) return [];
    return (await fr.json()).properties?.periods?.slice(0,24).map(
      (p:{startTime:string;temperature:number;temperatureUnit:string}) => ({
        time: p.startTime,
        tempC: p.temperatureUnit==='F' ? (p.temperature-32)*5/9 : p.temperature,
      })
    )??[];
  } catch { return []; }
}

async function fetchNWSForecast(lat: number, lon: number): Promise<ForecastDay|null> {
  try {
    const pr = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      { headers: {'User-Agent':'thermometer/1.0'}, next:{revalidate:3600} as RequestInit['next'] });
    if (!pr.ok) return null;
    const pj = await pr.json(); const url:string=pj.properties?.forecast; if (!url) return null;
    const fr = await fetch(url, { headers: {'User-Agent':'thermometer/1.0'}, next:{revalidate:3600} as RequestInit['next'] });
    if (!fr.ok) return null;
    const periods:Array<{isDaytime:boolean;temperature:number;temperatureUnit:string}>=
      (await fr.json()).properties?.periods??[];
    const day=periods.find(p=>p.isDaytime); const night=periods.find(p=>!p.isDaytime);
    const toC=(t:number,u:string)=>u==='F'?(t-32)*5/9:t;
    if (!day||!night) return null;
    return { maxC:toC(day.temperature,day.temperatureUnit), minC:toC(night.temperature,night.temperatureUnit), maxDisplay:0, minDisplay:0 };
  } catch { return null; }
}

async function fetchOMCurrent(city: City): Promise<WeatherObs|null> {
  try {
    const json = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m&timezone=auto`,
      { cache:'no-store' }
    ).then(r=>r.json());
    const tempC:number=json.current.temperature_2m, now=new Date();
    return { tempC, tempDisplay:tempC, unit:'C', station:city.station,
      observedAt:now.toLocaleTimeString('en-US',{timeZone:city.timezone,hour:'numeric',minute:'2-digit',hour12:true}),
      observedISO:now.toISOString(), windSpeed:json.current.wind_speed_10m??null,
      windDir:json.current.wind_direction_10m??null,
      cloudCover:null, pressure:null, dewpoint:null, rawMetar:null, source:'open-meteo' };
  } catch { return null; }
}

function applyUnit(obs: WeatherObs, city: City): WeatherObs {
  obs.tempDisplay = city.unit==='F' ? cToF(obs.tempC) : Math.round(obs.tempC);
  obs.unit = city.unit; return obs;
}
function applyForecastUnit(f: ForecastDay, city: City): ForecastDay {
  f.maxDisplay = city.unit==='F' ? cToF(f.maxC) : Math.round(f.maxC);
  f.minDisplay = city.unit==='F' ? cToF(f.minC) : Math.round(f.minC); return f;
}

// Current local hour (0-23) in the city timezone
function nowLocalHour(timezone: string): number {
  const s = new Date().toLocaleString('en-US', { timeZone: timezone, hour: '2-digit', hour12: false });
  return parseInt(s, 10) % 24;
}

// Extract local hour from a WU validTimeLocal timestamp
// Format: "2026-03-14T13:00:00+0000" or "2026-03-14T13:00:00+00:00"
function wuLocalHour(isoTime: string): number {
  const m = isoTime.match(/T(\d{2}):/);
  return m ? parseInt(m[1], 10) : 0;
}

export async function fetchWeatherData(city: City): Promise<WeatherData> {
  if (city.region === 'us') {
    // US: NWS obs (solid) + WU forecast (or NWS) for dashed + tgftp current
    const [metarObs, obsHourly, nwsForecast, forecastDay] = await Promise.all([
      fetchTgftpMetar(city.station, city.timezone),
      fetchNWSObsHistory(city.station),
      fetchNWSHourlyForecast(city.lat, city.lon),
      fetchNWSForecast(city.lat, city.lon),
    ]);
    // Build full-day dashed line: obs for past hours, nws forecast for future
    const obsHours = new Set(obsHourly.map(p => {
      const d = new Date(p.time);
      return d.getHours(); // local UTC hour as stored
    }));
    const mergedFull = [
      ...obsHourly,
      ...nwsForecast.filter(p => !obsHours.has(new Date(p.time).getHours()))
    ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    const forecast = forecastDay ? applyForecastUnit(forecastDay, city) : null;
    const current = metarObs ? applyUnit(metarObs, city) : null;
    return { current, obsHourly, forecastHourly: mergedFull, forecast };
  }

  // International: weather.com API (same as original!) + tgftp current
  const [metarObs, wuResult] = await Promise.all([
    fetchTgftpMetar(city.station, city.timezone),
    fetchWUHourly(city),
  ]);

  const currentH = nowLocalHour(city.timezone);

  // forecastHourly = all 24h (dashed backdrop)
  // obsHourly = past hours only (solid overlay) — use WU data for both so they're aligned
  const obsHourly = wuResult.all.filter(p => wuLocalHour(p.time) <= currentH);

  const forecast = wuResult.day ? applyForecastUnit(wuResult.day, city) : null;

  if (metarObs) {
    return {
      current: applyUnit(metarObs, city),
      obsHourly,
      forecastHourly: wuResult.all, // all 24h
      forecast,
    };
  }
  const omC = await fetchOMCurrent(city);
  return {
    current: omC ? applyUnit(omC, city) : null,
    obsHourly,
    forecastHourly: wuResult.all,
    forecast,
  };
}