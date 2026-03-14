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
  obsHourly: HourlyPoint[];      // past hours only → solid overlay
  forecastHourly: HourlyPoint[]; // ALL 24h → dashed backdrop
  forecast: ForecastDay|null;
};

const VC_KEY = process.env.VISUAL_CROSSING_KEY || '';

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

// Visual Crossing: ONE request → full 24h
// forecastHourly = ALL 24 hours (dashed backdrop, entire day)
// obsHourly = past hours only (solid overlay on top)
async function fetchVisualCrossing(city: City): Promise<{
  obsHourly: HourlyPoint[];
  forecastHourly: HourlyPoint[];
  day: ForecastDay | null;
}> {
  if (!VC_KEY) return fetchOMFallback(city);
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: city.timezone });
    const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/` +
      `${city.lat},${city.lon}/${today}` +
      `?unitGroup=metric&include=hours&key=${VC_KEY}&contentType=json`;

    const json = await fetch(url, { next: { revalidate: 3600 } as RequestInit['next'] }).then(r => {
      if (!r.ok) throw new Error(`VC ${r.status}`);
      return r.json();
    });

    const day = json.days?.[0];
    if (!day) return fetchOMFallback(city);

    // Current local hour in city timezone
    const localStr = new Date().toLocaleString('en-US', {
      timeZone: city.timezone, hour: '2-digit', hour12: false
    });
    const nowLocalH = parseInt(localStr, 10) % 24;

    const allHours: HourlyPoint[] = (day.hours ?? []).map((h: {datetime: string; temp: number}) => ({
      time: `${today}T${h.datetime}`,
      tempC: h.temp,
    }));

    // ALL 24h = dashed backdrop
    const forecastHourly = allHours;

    // Past hours only = solid overlay
    const obsHourly = allHours.filter(pt => {
      const h = parseInt(pt.time.split('T')[1].split(':')[0], 10);
      return h <= nowLocalH;
    });

    const forecastDay: ForecastDay = {
      maxC: day.tempmax, minC: day.tempmin, maxDisplay: 0, minDisplay: 0,
    };
    return { obsHourly, forecastHourly, day: forecastDay };
  } catch {
    return fetchOMFallback(city);
  }
}

async function fetchOMFallback(city: City): Promise<{
  obsHourly: HourlyPoint[];
  forecastHourly: HourlyPoint[];
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
    const localStr = new Date().toLocaleString('en-US', { timeZone: city.timezone, hour: '2-digit', hour12: false });
    const nowLocalH = parseInt(localStr, 10) % 24;

    const allToday: HourlyPoint[] = [];
    times.forEach((t, i) => {
      if (t.startsWith(todayStr)) allToday.push({ time: t, tempC: temps[i] });
    });

    const obsHourly = allToday.filter(pt => parseInt(pt.time.split('T')[1].split(':')[0], 10) <= nowLocalH);
    const day: ForecastDay = { maxC: json.daily.temperature_2m_max[1], minC: json.daily.temperature_2m_min[1], maxDisplay: 0, minDisplay: 0 };
    return { obsHourly, forecastHourly: allToday, day };
  } catch { return { obsHourly: [], forecastHourly: [], day: null }; }
}

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
        time: f.properties.timestamp, tempC: f.properties.temperature.value,
      }))
      .reverse();
  } catch { return []; }
}

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
    const day=periods.find(p=>p.isDaytime), night=periods.find(p=>!p.isDaytime);
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

export async function fetchWeatherData(city: City): Promise<WeatherData> {
  if (city.region === 'us') {
    // US: NWS obs (solid) + build full-day from obs+forecast (dashed)
    const [metarObs, obsHourly, nwsForecast, forecastDay] = await Promise.all([
      fetchTgftpMetar(city.station, city.timezone),
      fetchNWSObsHistory(city.station),
      fetchNWSHourlyForecast(city.lat, city.lon),
      fetchNWSForecast(city.lat, city.lon),
    ]);
    // Merge obs + forecast into full-day dashed line (dedup by hour)
    const obsHours = new Set(obsHourly.map(p => new Date(p.time).getUTCHours()));
    const fullDay = [
      ...obsHourly,
      ...nwsForecast.filter(p => !obsHours.has(new Date(p.time).getUTCHours()))
    ].sort((a,b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    const forecast = forecastDay ? applyForecastUnit(forecastDay, city) : null;
    const current = metarObs ? applyUnit(metarObs, city) : null;
    return { current, obsHourly, forecastHourly: fullDay, forecast };
  }

  // International: Visual Crossing (or OM fallback)
  const [metarObs, vcResult] = await Promise.all([
    fetchTgftpMetar(city.station, city.timezone),
    fetchVisualCrossing(city),
  ]);
  const forecast = vcResult.day ? applyForecastUnit(vcResult.day, city) : null;
  if (metarObs) {
    return {
      current: applyUnit(metarObs, city),
      obsHourly: vcResult.obsHourly,
      forecastHourly: vcResult.forecastHourly,
      forecast,
    };
  }
  const omC = await fetchOMCurrent(city);
  return {
    current: omC ? applyUnit(omC, city) : null,
    obsHourly: vcResult.obsHourly,
    forecastHourly: vcResult.forecastHourly,
    forecast,
  };
}