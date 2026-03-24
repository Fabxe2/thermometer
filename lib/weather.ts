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
  obsHourly: HourlyPoint[];      // horas pasadas → línea sólida
  forecastHourly: HourlyPoint[]; // proyección diurna → línea punteada
  forecast: ForecastDay|null;
};

// ── METAR parsers ─────────────────────────────────────────────────────────
function parseTempFromMetar(metar: string): number | null {
  const tg = metar.match(/\bT([01])(\d{3})[01]\d{3}\b/);
  if (tg) { const s = tg[1]==='1'?-1:1; return s*parseInt(tg[2],10)/10; }
  const m = metar.match(/\b(M?\d{2})\/(M?\d{2})\b/);
  if (!m) return null;
  return m[1].startsWith('M') ? -parseInt(m[1].slice(1),10) : parseInt(m[1],10);
}

function parseDewpointFromMetar(metar: string): number | null {
  // Formato preciso Txxxxdddd: T0250/T0180 → dew 18.0°C
  const tg = metar.match(/\bT[01]\d{3}([01])(\d{3})\b/);
  if (tg) { const s = tg[1]==='1'?-1:1; return s*parseInt(tg[2],10)/10; }
  // Formato estándar: 25/18 → dew 18°C
  const m = metar.match(/\b(?:M?\d{2})\/(M?\d{2})\b/);
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

// ── Proyección diurna desde METAR T + Td ─────────────────────────────────
// Principio físico: Td ≈ T_min del día, la depresión del dewpoint (T-Td)
// define cuánto puede calentarse el aire. Curva cosenoidal con pico a las 14h.
function computeDiurnalProjection(
  T: number,
  Td: number,
  timezone: string
): HourlyPoint[] {
  const DD = Math.max(T - Td, 0);          // dewpoint depression (≥ 0)
  const T_min = Td + 0.5;                  // temperatura mínima estimada
  const T_max = T_min + 1.5 * DD;          // temperatura máxima estimada
  const T_avg = (T_max + T_min) / 2;
  const amplitude = (T_max - T_min) / 2;
  const h_peak = 14;                        // pico a las 2 PM local

  const today = new Date().toLocaleDateString('en-CA', { timeZone: timezone });

  return Array.from({ length: 24 }, (_, h) => {
    // Coseno: mínimo ~2 AM, máximo ~2 PM
    const tempC = T_avg + amplitude * Math.cos(Math.PI * (h - h_peak) / 12);
    return {
      time: `${today}T${String(h).padStart(2,'0')}:00:00`,
      tempC: Math.round(tempC * 10) / 10,
    };
  });
}

// ── Open-Meteo hourly forecast (fallback sin key) ─────────────────────────
async function fetchOMHourlyForecast(city: City): Promise<HourlyPoint[]> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${city.lat}&longitude=${city.lon}` +
      `&hourly=temperature_2m&timezone=${encodeURIComponent(city.timezone)}` +
      `&forecast_days=1`;
    const json = await fetch(url, { cache: 'no-store' }).then(r => r.json());
    const times: string[] = json.hourly?.time ?? [];
    const temps: number[] = json.hourly?.temperature_2m ?? [];
    return times.map((t, i) => ({ time: t, tempC: temps[i] }));
  } catch { return []; }
}

// ── Open-Meteo forecast min/max ───────────────────────────────────────────
async function fetchOMForecastDay(city: City): Promise<ForecastDay|null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${city.lat}&longitude=${city.lon}` +
      `&daily=temperature_2m_max,temperature_2m_min` +
      `&timezone=${encodeURIComponent(city.timezone)}&forecast_days=1`;
    const json = await fetch(url, { cache: 'no-store' }).then(r => r.json());
    const maxC = json.daily?.temperature_2m_max?.[0] ?? null;
    const minC = json.daily?.temperature_2m_min?.[0] ?? null;
    if (maxC == null || minC == null) return null;
    return { maxC, minC, maxDisplay: 0, minDisplay: 0 };
  } catch { return null; }
}

// ── Open-Meteo current (fallback si no hay METAR) ────────────────────────
async function fetchOMCurrent(city: City): Promise<WeatherObs|null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${city.lat}&longitude=${city.lon}` +
      `&current=temperature_2m,wind_speed_10m,wind_direction_10m` +
      `&timezone=${encodeURIComponent(city.timezone)}`;
    const json = await fetch(url, { cache: 'no-store' }).then(r => r.json());
    const tempC = json.current?.temperature_2m;
    if (tempC == null) return null;
    return {
      tempC, tempDisplay: tempC, unit: 'C',
      station: `${city.lat},${city.lon}`,
      observedAt: '', observedISO: new Date().toISOString(),
      windSpeed: json.current?.wind_speed_10m??null,
      windDir: json.current?.wind_direction_10m??null,
      cloudCover: null, pressure: null, dewpoint: null, rawMetar: null, source: 'open-meteo'
    };
  } catch { return null; }
}

// ── METAR actual desde tgftp ──────────────────────────────────────────────
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
    const dewpoint = parseDewpointFromMetar(rawMetar);
    const {speed,dir} = parseWindFromMetar(rawMetar);
    const tm = rawMetar.match(/\b(\d{2})(\d{2})(\d{2})Z\b/);
    let observedAt='', observedISO=new Date().toISOString();
    if (tm) {
      const now=new Date();
      const obs=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),parseInt(tm[1],10),parseInt(tm[2],10),parseInt(tm[3],10)));
      observedISO=obs.toISOString();
      observedAt=obs.toLocaleTimeString('en-US',{timeZone:timezone,hour:'numeric',minute:'2-digit',hour12:true});
    }
    return {
      tempC, tempDisplay:tempC, unit:'C', station, observedAt, observedISO,
      windSpeed:speed, windDir:dir, cloudCover:parseCloudFromMetar(rawMetar),
      pressure:parsePressureFromMetar(rawMetar), dewpoint,
      rawMetar, source:'tgftp'
    };
  } catch { return null; }
}

// ── NWS obs history (ciudades US) ─────────────────────────────────────────
async function fetchNWSObsHistory(station: string): Promise<HourlyPoint[]> {
  try {
    const res = await fetch(
      `https://api.weather.gov/stations/${station}/observations?limit=24`,
      { headers: { 'User-Agent': 'thermometer/1.0' }, cache: 'no-store' }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json.features ?? [])
      .filter((f: { properties: { temperature: { value: number|null } } }) =>
        f.properties?.temperature?.value != null
      )
      .map((f: { properties: { timestamp: string; temperature: { value: number } } }) => ({
        time: f.properties.timestamp,
        tempC: Math.round(f.properties.temperature.value * 10) / 10,
      }))
      .reverse();
  } catch { return []; }
}

// ── Open-Meteo obs history (ciudades internacionales) ────────────────────
async function fetchOMObsHistory(city: City): Promise<HourlyPoint[]> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${city.lat}&longitude=${city.lon}` +
      `&hourly=temperature_2m&timezone=${encodeURIComponent(city.timezone)}` +
      `&past_hours=24&forecast_hours=0`;
    const json = await fetch(url, { cache: 'no-store' }).then(r => r.json());
    const times: string[] = json.hourly?.time ?? [];
    const temps: number[] = json.hourly?.temperature_2m ?? [];
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: city.timezone });
    const nowLocalH = parseInt(
      new Date().toLocaleString('en-US', { timeZone: city.timezone, hour: '2-digit', hour12: false }), 10
    );
    return times
      .map((t, i) => ({ time: t, tempC: temps[i] }))
      .filter(p => {
        const [datePart, timePart] = p.time.split('T');
        const h = parseInt(timePart?.split(':')[0] ?? '0', 10);
        return datePart === todayStr && h <= nowLocalH;
      });
  } catch { return []; }
}

// ── Helpers de unidad ─────────────────────────────────────────────────────
function applyUnit(obs: WeatherObs, city: City): WeatherObs {
  obs.tempDisplay = city.unit==='F' ? cToF(obs.tempC) : Math.round(obs.tempC);
  obs.unit = city.unit; return obs;
}
function applyForecastUnit(f: ForecastDay, city: City): ForecastDay {
  f.maxDisplay = city.unit==='F' ? cToF(f.maxC) : Math.round(f.maxC);
  f.minDisplay = city.unit==='F' ? cToF(f.minC) : Math.round(f.minC); return f;
}

// ── MAIN ──────────────────────────────────────────────────────────────────
export async function fetchWeatherData(city: City): Promise<WeatherData> {

  // 1. Obs actuales (METAR) — siempre el más preciso
  const metarObs = await fetchTgftpMetar(city.station, city.timezone);

  // 2. Historial de hoy (línea sólida)
  const obsHourly = city.region === 'us'
    ? await fetchNWSObsHistory(city.station)
    : await fetchOMObsHistory(city);

  // 3. Proyección diurna (línea punteada) ─────────────────────────────────
  // Si METAR tiene T y Td → calculamos la curva desde física real
  // Sino → fallback a Open-Meteo hourly forecast (gratis, sin key)
  let forecastHourly: HourlyPoint[];
  if (metarObs?.tempC != null && metarObs?.dewpoint != null) {
    forecastHourly = computeDiurnalProjection(
      metarObs.tempC,
      metarObs.dewpoint,
      city.timezone
    );
  } else {
    forecastHourly = await fetchOMHourlyForecast(city);
  }

  // 4. Min/Max del día
  const forecastDay = await fetchOMForecastDay(city);
  const forecast = forecastDay ? applyForecastUnit(forecastDay, city) : null;

  // 5. Current display
  let current: WeatherObs|null = null;
  if (metarObs) {
    current = applyUnit(metarObs, city);
  } else {
    const omC = await fetchOMCurrent(city);
    current = omC ? applyUnit(omC, city) : null;
  }

  return { current, obsHourly, forecastHourly, forecast };
}
