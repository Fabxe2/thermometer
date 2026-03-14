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
  obsHourly: HourlyPoint[];      // real observations from tgftp cycles — solid line
  forecastHourly: HourlyPoint[]; // Open-Meteo forecast — dashed line
  forecast: ForecastDay|null;
  error?: string;
};

// ── METAR parsers ────────────────────────────────────────────────────────────
function parseTempFromMetar(metar: string): number | null {
  // Prefer T-group (tenths precision): T0056XXXX = +5.6°C
  const tGroup = metar.match(/\bT([01])(\d{3})[01]\d{3}\b/);
  if (tGroup) { const sign = tGroup[1]==='1'?-1:1; return sign*parseInt(tGroup[2],10)/10; }
  // Fallback: integer TT/DD
  const intMatch = metar.match(/\b(M?\d{2})\/M?\d{2}\b/);
  if (!intMatch) return null;
  return intMatch[1].startsWith('M') ? -parseInt(intMatch[1].slice(1),10) : parseInt(intMatch[1],10);
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

// ── tgftp current METAR ──────────────────────────────────────────────────────
async function fetchTgftpMetar(station: string, timezone: string): Promise<WeatherObs|null> {
  try {
    const res = await fetch(
      `https://tgftp.nws.noaa.gov/data/observations/metar/stations/${station}.TXT`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const lines = (await res.text()).trim().split('\n');
    const rawMetar = lines[1]?.trim()??lines[0]?.trim()??'';
    if (!rawMetar) return null;
    const tempC = parseTempFromMetar(rawMetar); if (tempC==null) return null;
    const {speed,dir} = parseWindFromMetar(rawMetar);
    const tm = rawMetar.match(/\b(\d{2})(\d{2})(\d{2})Z\b/);
    let observedAt="", observedISO=new Date().toISOString();
    if (tm) {
      const now=new Date();
      const obs=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),parseInt(tm[1],10),parseInt(tm[2],10),parseInt(tm[3],10)));
      observedISO=obs.toISOString();
      observedAt=obs.toLocaleTimeString("en-US",{timeZone:timezone,hour:"numeric",minute:"2-digit",hour12:true});
    }
    return { tempC, tempDisplay:tempC, unit:"C", station, observedAt, observedISO,
      windSpeed:speed, windDir:dir, cloudCover:parseCloudFromMetar(rawMetar),
      pressure:parsePressureFromMetar(rawMetar), dewpoint:null, rawMetar, source:"tgftp" };
  } catch { return null; }
}

// ── tgftp cycle files — obs history for the whole day ────────────────────────
// Each hour UTC has a file: /data/observations/metar/cycles/HHZ.TXT
// Contains METARs for ALL stations worldwide at that hour
// We fetch all 24 cycles and extract the station's observation for each
async function fetchTgftpObsHistory(station: string, timezone: string): Promise<HourlyPoint[]> {
  const now = new Date();
  const currentUTCHour = now.getUTCHours();

  // Fetch all available cycle files in parallel (last 24h = hours 0..current)
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const results = await Promise.allSettled(
    hours.map(async (h) => {
      const hh = String(h).padStart(2, '0');
      const url = `https://tgftp.nws.noaa.gov/data/observations/metar/cycles/${hh}Z.TXT`;
      const res = await fetch(url, { next: { revalidate: 3600 } as RequestInit["next"] });
      if (!res.ok) return null;
      const text = await res.text();

      // Find this station's METAR in the cycle file
      // METARs in cycle files don't have "METAR " prefix, just: "SAEZ DDHHMMZ ..."
      const stationPattern = new RegExp(`^(${station}\\s+\\d{6}Z[^\\n]*)$`, 'm');
      const match = text.match(stationPattern);
      if (!match) return null;

      const rawMetar = match[1].trim();
      const tempC = parseTempFromMetar(rawMetar);
      if (tempC == null) return null;

      // Parse the UTC time from METAR: DDHHMMZ
      const tmMatch = rawMetar.match(/\b(\d{2})(\d{2})(\d{2})Z\b/);
      if (!tmMatch) return null;

      const utcH = parseInt(tmMatch[2], 10);
      const utcM = parseInt(tmMatch[3], 10);
      const utcDay = parseInt(tmMatch[1], 10);

      // Build UTC timestamp
      const obsUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), utcDay, utcH, utcM));
      const isoTime = obsUTC.toISOString();

      return { time: isoTime, tempC };
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<HourlyPoint|null> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value as HourlyPoint)
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

// ── NWS hourly forecast (US cities) ─────────────────────────────────────────
async function fetchNWSHourlyForecast(lat: number, lon: number): Promise<HourlyPoint[]> {
  try {
    const pr = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      { headers:{"User-Agent":"thermometer/1.0"}, next:{revalidate:3600} as RequestInit["next"] });
    if (!pr.ok) return [];
    const pj = await pr.json(); const url:string=pj.properties?.forecastHourly; if (!url) return [];
    const fr = await fetch(url, { headers:{"User-Agent":"thermometer/1.0"}, next:{revalidate:3600} as RequestInit["next"] });
    if (!fr.ok) return [];
    return (await fr.json()).properties?.periods?.slice(0,24).map((p:{startTime:string;temperature:number;temperatureUnit:string})=>({
      time: p.startTime,
      tempC: p.temperatureUnit==="F"?(p.temperature-32)*5/9:p.temperature
    }))??[];
  } catch { return []; }
}

async function fetchNWSForecast(lat: number, lon: number): Promise<ForecastDay|null> {
  try {
    const pr = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      { headers:{"User-Agent":"thermometer/1.0"}, next:{revalidate:3600} as RequestInit["next"] });
    if (!pr.ok) return null;
    const pj = await pr.json(); const url:string=pj.properties?.forecast; if (!url) return null;
    const fr = await fetch(url, { headers:{"User-Agent":"thermometer/1.0"}, next:{revalidate:3600} as RequestInit["next"] });
    if (!fr.ok) return null;
    const periods:Array<{isDaytime:boolean;temperature:number;temperatureUnit:string}>=(await fr.json()).properties?.periods??[];
    const day=periods.find(p=>p.isDaytime), night=periods.find(p=>!p.isDaytime);
    const toC=(t:number,u:string)=>u==="F"?(t-32)*5/9:t;
    if (!day||!night) return null;
    return { maxC:toC(day.temperature,day.temperatureUnit), minC:toC(night.temperature,night.temperatureUnit), maxDisplay:0, minDisplay:0 };
  } catch { return null; }
}

// ── Open-Meteo forecast (all cities) ────────────────────────────────────────
async function fetchOMForecast(city: City): Promise<{ hourly: HourlyPoint[]; day: ForecastDay|null }> {
  try {
    const json = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&hourly=temperature_2m&daily=temperature_2m_max,temperature_2m_min&timezone=${encodeURIComponent(city.timezone)}&forecast_days=1`,
      { next:{revalidate:3600} as RequestInit["next"] }
    ).then(r=>r.json());
    const hourly: HourlyPoint[] = (json.hourly.time as string[]).map((t:string,i:number)=>({
      time: t, // "2026-03-14T09:00" — already local, no UTC offset
      tempC: json.hourly.temperature_2m[i]
    }));
    const day: ForecastDay = {
      maxC: json.daily.temperature_2m_max[0], minC: json.daily.temperature_2m_min[0],
      maxDisplay:0, minDisplay:0
    };
    return { hourly, day };
  } catch { return { hourly:[], day:null }; }
}

async function fetchOMCurrent(city: City): Promise<WeatherObs|null> {
  try {
    const json = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m&timezone=auto`,
      { cache:"no-store" }
    ).then(r=>r.json());
    const tempC:number=json.current.temperature_2m, now=new Date();
    return { tempC, tempDisplay:tempC, unit:"C", station:city.station,
      observedAt:now.toLocaleTimeString("en-US",{timeZone:city.timezone,hour:"numeric",minute:"2-digit",hour12:true}),
      observedISO:now.toISOString(), windSpeed:json.current.wind_speed_10m??null,
      windDir:json.current.wind_direction_10m??null,
      cloudCover:null, pressure:null, dewpoint:null, rawMetar:null, source:"open-meteo" };
  } catch { return null; }
}

function applyUnit(obs: WeatherObs, city: City): WeatherObs {
  obs.tempDisplay = city.unit==="F" ? cToF(obs.tempC) : Math.round(obs.tempC);
  obs.unit = city.unit; return obs;
}
function applyForecastUnit(f: ForecastDay, city: City): ForecastDay {
  f.maxDisplay = city.unit==="F" ? cToF(f.maxC) : Math.round(f.maxC);
  f.minDisplay = city.unit==="F" ? cToF(f.minC) : Math.round(f.minC); return f;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function fetchWeatherData(city: City): Promise<WeatherData> {
  // Fetch current obs, hourly obs history, and forecast in parallel
  const [metarObs, obsHistory, omResult] = await Promise.all([
    fetchTgftpMetar(city.station, city.timezone),
    fetchTgftpObsHistory(city.station, city.timezone), // 24 cycle files → solid line
    fetchOMForecast(city),                              // Open-Meteo forecast → dashed line
  ]);

  // For US cities, try NWS for better forecast
  let forecastHourly = omResult.hourly;
  let forecastDay: ForecastDay|null = omResult.day;

  if (city.region === "us") {
    const [nwsH, nwsF] = await Promise.all([
      fetchNWSHourlyForecast(city.lat, city.lon),
      fetchNWSForecast(city.lat, city.lon),
    ]);
    if (nwsH.length > 0) forecastHourly = nwsH;
    if (nwsF) forecastDay = nwsF;
  }

  const forecast = forecastDay ? applyForecastUnit(forecastDay, city) : null;

  if (metarObs) {
    return {
      current: applyUnit(metarObs, city),
      obsHourly: obsHistory,
      forecastHourly,
      forecast
    };
  }

  // Fallback: Open-Meteo current
  const omC = await fetchOMCurrent(city);
  if (omC) return { current:applyUnit(omC,city), obsHourly:obsHistory, forecastHourly, forecast };
  return { current:null, obsHourly:obsHistory, forecastHourly, forecast };
}