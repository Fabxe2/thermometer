import { City, cToF } from "./cities";

export type WeatherObs = {
  tempC: number; tempDisplay: number; unit: "F"|"C"; station: string;
  observedAt: string; observedISO: string; windSpeed: number|null;
  windDir: number|null; cloudCover: string|null; pressure: number|null;
  dewpoint: number|null; rawMetar: string|null; source: string;
};
export type HourlyPoint = { time: string; tempC: number; };
export type ForecastDay = { maxC: number; minC: number; maxDisplay: number; minDisplay: number; };
export type WeatherData = {
  current: WeatherObs|null;
  obsHourly: HourlyPoint[];
  forecastHourly: HourlyPoint[];
  forecast: ForecastDay|null;
};

const WU_KEY = process.env.WU_API_KEY || '';

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

async function fetchPWSHistory(pwsId: string, unit: "F"|"C"): Promise<HourlyPoint[]> {
  if (!WU_KEY || !pwsId) return [];
  try {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const units = unit === 'F' ? 'e' : 'm';
    const json = await fetch(
      `https://api.weather.com/v2/pws/history/hourly` +
      `?stationId=${pwsId}&format=json&units=${units}&date=${today}&apiKey=${WU_KEY}`,
      { cache: 'no-store' }
    ).then(r => { if (!r.ok) throw new Error(`PWS ${r.status}`); return r.json(); });

    return (json.observations ?? []).map((o: {
      obsTimeLocal: string;
      imperial?: { tempAvg: number };
      metric?: { tempAvg: number };
    }) => {
      const tempRaw = unit === 'F' ? (o.imperial?.tempAvg ?? 0) : (o.metric?.tempAvg ?? 0);
      const tempC = unit === 'F' ? (tempRaw - 32) * 5 / 9 : tempRaw;
      const isoTime = o.obsTimeLocal.replace(' ', 'T');
      return { time: isoTime, tempC };
    });
  } catch { return []; }
}

async function fetchWUForecast(city: City): Promise<{ all: HourlyPoint[]; day: ForecastDay | null }> {
  if (!WU_KEY) return fetchOMFallback(city);
  try {
    const units = city.unit === 'F' ? 'e' : 'm';
    const json = await fetch(
      `https://api.weather.com/v3/wx/forecast/hourly/1day` +
      `?geocode=${city.lat},${city.lon}&units=${units}&language=en-US&format=json&apiKey=${WU_KEY}`,
      { cache: 'no-store' }
    ).then(r => { if (!r.ok) throw new Error(`WUF ${r.status}`); return r.json(); });

    const times: string[] = json.validTimeLocal ?? [];
    const temps: number[] = json.temperature ?? [];
    if (!times.length) return fetchOMFallback(city);

    const toC = (t: number) => city.unit === 'F' ? (t - 32) * 5 / 9 : t;
    const all = times.map((t, i) => ({
      time: t.replace(/[+-]\d{4}$/, '').replace(/Z$/, ''),
      tempC: toC(temps[i])
    }));
    const allC = all.map(p => p.tempC);
    return { all, day: { maxC: Math.max(...allC), minC: Math.min(...allC), maxDisplay: 0, minDisplay: 0 } };
  } catch { return fetchOMFallback(city); }
}

async function fetchOMFallback(city: City): Promise<{ all: HourlyPoint[]; day: ForecastDay | null }> {
  try {
    const json = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
      `&hourly=temperature_2m&daily=temperature_2m_max,temperature_2m_min` +
      `&timezone=${encodeURIComponent(city.timezone)}&past_days=1&forecast_days=1`,
      { cache: 'no-store' }
    ).then(r => r.json());
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: city.timezone });
    const all = (json.hourly.time as string[])
      .map((t, i) => ({ time: t, tempC: json.hourly.temperature_2m[i] }))
      .filter(p => p.time.startsWith(todayStr));
    return { all, day: { maxC: json.daily.temperature_2m_max[1], minC: json.daily.temperature_2m_min[1], maxDisplay: 0, minDisplay: 0 } };
  } catch { return { all: [], day: null }; }
}

async function fetchOMCurrent(city: City): Promise<WeatherObs|null> {
  try {
    const json = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m&timezone=auto`,
      { cache: 'no-store' }
    ).then(r => r.json());
    const tempC: number = json.current.temperature_2m, now = new Date();
    return {
      tempC, tempDisplay: tempC, unit: 'C', station: city.station,
      observedAt: now.toLocaleTimeString('en-US', { timeZone: city.timezone, hour: 'numeric', minute: '2-digit', hour12: true }),
      observedISO: now.toISOString(), windSpeed: json.current.wind_speed_10m ?? null,
      windDir: json.current.wind_direction_10m ?? null,
      cloudCover: null, pressure: null, dewpoint: null, rawMetar: null, source: 'open-meteo'
    };
  } catch { return null; }
}

function applyUnit(obs: WeatherObs, city: City): WeatherObs {
  obs.tempDisplay = city.unit === 'F' ? cToF(obs.tempC) : Math.round(obs.tempC);
  obs.unit = city.unit; return obs;
}
function applyForecastUnit(f: ForecastDay, city: City): ForecastDay {
  f.maxDisplay = city.unit === 'F' ? cToF(f.maxC) : Math.round(f.maxC);
  f.minDisplay = city.unit === 'F' ? cToF(f.minC) : Math.round(f.minC); return f;
}

function localHour(t: string): number {
  const m = t.match(/T(\d{2}):/); return m ? parseInt(m[1], 10) : 0;
}
function nowLocalH(timezone: string): number {
  const s = new Date().toLocaleString('en-US', { timeZone: timezone, hour: '2-digit', hour12: false });
  return parseInt(s, 10) % 24;
}

export async function fetchWeatherData(city: City): Promise<WeatherData> {
  const currentH = nowLocalH(city.timezone);
  const [metarObs, pwsObs, wuForecast] = await Promise.all([
    fetchTgftpMetar(city.station, city.timezone),
    city.pwsId ? fetchPWSHistory(city.pwsId, city.unit) : Promise.resolve([]),
    fetchWUForecast(city),
  ]);
  const forecast = wuForecast.day ? applyForecastUnit(wuForecast.day, city) : null;

  const obsHourly: HourlyPoint[] = pwsObs.length > 0
    ? pwsObs.filter(p => localHour(p.time) <= currentH)
    : wuForecast.all.filter(p => localHour(p.time) <= currentH);

  const forecastHourly = wuForecast.all;

  if (metarObs) {
    return { current: applyUnit(metarObs, city), obsHourly, forecastHourly, forecast };
  }
  const omC = await fetchOMCurrent(city);
  return { current: omC ? applyUnit(omC, city) : null, obsHourly, forecastHourly, forecast };
}
