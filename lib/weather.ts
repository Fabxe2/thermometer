// lib/weather.ts
// Modelo DTC (Diurnal Temperature Cycle) de dos fases — GOT01 adaptado a METAR
// Fase 1 (diurna):   T(t) = T0 + Ta * cos(pi * (t - tm) / omega)
// Fase 2 (nocturna): T(t) = (T(ts) - Tinf) * exp(-k * (t - ts)) + Tinf
//
// Parámetros calibrados en tiempo real con cada METAR entrante:
//   T0   = temp al amanecer (METAR más cercano al sunrise)
//   Ta   = amplitud = Tmax_TAF - T0
//   tm   = hora del pico solar (ajustada por nubosidad y viento)
//   omega= semiperíodo solar (función de latitud y DOY)
//   ts   = inicio decaimiento = sunset + 0.5h
//   k    = constante de enfriamiento = f(spread T/Td)
//   Tinf = temperatura de equilibrio nocturno ≈ Td + 1°C

import type { City } from './cities';
import { cToF } from './cities';

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export type ObsPoint = {
  hour: number;        // hora local 0-23
  temp: number;        // temp en la unidad de la ciudad
  isObs: true;
};

export type ForecastPoint = {
  hour: number;
  temp: number;        // forecast central (DTC)
  upper: number;       // banda superior +sigma
  lower: number;       // banda inferior -sigma
  isForecast: true;
};

export type ChartPoint = ObsPoint | ForecastPoint;

export type WeatherResult = {
  currentTemp: number;       // en unidad de la ciudad
  highToday: number;
  lowToday: number;
  projectedMax: number;      // pico proyectado por DTC
  projectedMaxHour: number;  // hora local del pico
  confidence: number;        // 0-100
  sigma: number;             // incertidumbre en grados
  spread: number;            // T - Td en °C
  cloudCover: string;        // 'CLR' | 'FEW' | 'SCT' | 'BKN' | 'OVC'
  windKt: number;
  rawMetar: string;
  obsPoints: ObsPoint[];
  forecastPoints: ForecastPoint[];
};

// ─── CONSTANTES SOLAR ─────────────────────────────────────────────────────────

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}

function solarDeclinationRad(doy: number): number {
  // Spencer 1971
  const B = (2 * Math.PI * (doy - 1)) / 365;
  return 0.006918 - 0.399912 * Math.cos(B) + 0.070257 * Math.sin(B)
       - 0.006758 * Math.cos(2*B) + 0.000907 * Math.sin(2*B);
}

/** Retorna hora solar de amanecer y anochecer (horas decimales locales) */
function sunriseSunset(lat: number, lon: number, date: Date, tz: string): { sunrise: number; sunset: number } {
  const doy = dayOfYear(date);
  const latRad = lat * Math.PI / 180;
  const decl = solarDeclinationRad(doy);
  const cosHa = -Math.tan(latRad) * Math.tan(decl);
  const ha = Math.acos(Math.max(-1, Math.min(1, cosHa))) * 180 / Math.PI;
  // Equation of time (minutes)
  const B = (2 * Math.PI * (doy - 81)) / 364;
  const eot = 9.87 * Math.sin(2*B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  // Longitude correction (minutes)
  const stdMeridian = Math.round(lon / 15) * 15;
  const lonCorr = 4 * (lon - stdMeridian);
  const offset = (eot + lonCorr) / 60;
  // Get actual UTC offset from timezone name
  const utcOffsetH = getUtcOffsetH(tz, date);
  const solarNoon = 12 - offset + (stdMeridian - lon)/15 - utcOffsetH + utcOffsetH;
  return {
    sunrise: 12 - ha/15 - offset - (lon - stdMeridian)/15,
    sunset:  12 + ha/15 - offset - (lon - stdMeridian)/15,
  };
}

function getUtcOffsetH(tz: string, date: Date): number {
  const utc = date.toLocaleString('en-US', { timeZone: 'UTC', hour12: false, hour: '2-digit', minute: '2-digit' });
  const local = date.toLocaleString('en-US', { timeZone: tz,  hour12: false, hour: '2-digit', minute: '2-digit' });
  const toMin = (s: string) => { const [h,m] = s.split(':').map(Number); return h*60+m; };
  return (toMin(local) - toMin(utc)) / 60;
}

function localHour(date: Date, tz: string): number {
  const s = date.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  const [h, m] = s.split(':').map(Number);
  return h + m / 60;
}

// ─── FETCH METAR ──────────────────────────────────────────────────────────────

type MetarObs = {
  temp: number; dewp: number; wspd: number; wdir: number;
  clouds: string; wxString: string; rawOb: string; obsTime: string;
};

async function fetchMetarHistory(station: string): Promise<MetarObs[]> {
  const url = `https://aviationweather.gov/api/data/metar?ids=${station}&format=json&hours=24`;
  const res = await fetch(url, { next: { revalidate: 180 } });
  if (!res.ok) return [];
  const data: Record<string, unknown>[] = await res.json();
  return data
    .filter(m => m.temp != null)
    .map(m => ({
      temp:      Number(m.temp),
      dewp:      m.dewp != null ? Number(m.dewp) : Number(m.temp) - 10,
      wspd:      Number(m.wspd ?? 0),
      wdir:      Number(m.wdir ?? 0),
      clouds:    (m.clouds as {cover:string}[] | undefined)?.map(c => c.cover).join(' ') ?? 'CLR',
      wxString:  String(m.wxString ?? ''),
      rawOb:     String(m.rawOb ?? ''),
      obsTime:   String(m.reportTime ?? m.obsTime ?? ''),
    }))
    .sort((a, b) => new Date(a.obsTime).getTime() - new Date(b.obsTime).getTime());
}

async function fetchTAFMax(station: string): Promise<number | null> {
  try {
    const res = await fetch(`https://aviationweather.gov/api/data/taf?ids=${station}&format=json&time=valid`, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.length) return null;
    const taf = data[0];
    let txMax: number | null = null;
    for (const line of (taf.fcsts ?? [])) {
      if (line.maxTemp != null && (txMax === null || line.maxTemp > txMax)) txMax = line.maxTemp;
    }
    if (txMax === null && taf.rawTAF) {
      const m = (taf.rawTAF as string).match(/TX(M?[\d]+)\/([\d]+Z)/);
      if (m) txMax = m[1].startsWith('M') ? -parseInt(m[1].slice(1)) : parseInt(m[1]);
    }
    return txMax;
  } catch { return null; }
}

// ─── MODELO DTC — DOS FASES ───────────────────────────────────────────────────

type DtcParams = {
  T0: number;    // temp al amanecer (°C)
  Ta: number;    // amplitud (°C)
  tm: number;    // hora del pico (h decimal)
  omega: number; // semiperíodo solar (h)
  ts: number;    // inicio decaimiento nocturno (h)
  k: number;     // constante de enfriamiento (h⁻¹)
  Tinf: number;  // temp equilibrio nocturno (°C)
};

function dtcTemperature(t: number, p: DtcParams): number {
  // t: hora decimal local 0-24
  if (t <= p.ts) {
    // FASE DIURNA — coseno centrado en tm
    return p.T0 + p.Ta * Math.cos(Math.PI * (t - p.tm) / p.omega);
  } else {
    // FASE NOCTURNA — decaimiento exponencial tipo Newton
    const Tts = p.T0 + p.Ta * Math.cos(Math.PI * (p.ts - p.tm) / p.omega);
    return (Tts - p.Tinf) * Math.exp(-p.k * (t - p.ts)) + p.Tinf;
  }
}

function buildDtcParams(
  sunrise: number,
  sunset: number,
  T0: number,
  Tmax: number,
  dewpNow: number,
  cloudCover: string,
  windKt: number
): DtcParams {
  const omega = (sunset - sunrise) * 0.5; // semiperíodo diurno

  // tm: pico solar ajustado por nubes y viento
  let tmOffset = 0;
  if (cloudCover.includes('OVC') || cloudCover.includes('BKN')) tmOffset += 0.5;
  if (windKt > 20) tmOffset += 0.3;
  const tm = (sunrise + sunset) / 2 + 1.0 + tmOffset; // pico ~1-1.5h después del mediodía solar

  const Ta = Math.max(0, Tmax - T0);
  const ts = sunset + 0.5;

  // k: constante de enfriamiento calibrada por spread T/Td
  const spread = T0 - dewpNow;
  let k: number;
  if      (spread >= 15) k = 0.35;  // muy seco → enfriamiento rápido
  else if (spread >= 10) k = 0.25;
  else if (spread >= 5)  k = 0.18;
  else                   k = 0.12;  // muy húmedo → retiene calor

  // Tinf: temperatura de equilibrio nocturno
  const Tinf = dewpNow + 1.5;

  return { T0, Ta, tm, omega, ts, k, Tinf };
}

// ─── INCERTIDUMBRE ────────────────────────────────────────────────────────────

function calcSigma(
  spread: number,
  cloudCover: string,
  hoursToMax: number,
  tafAvailable: boolean,
  observedRateStable: boolean,
): number {
  // sigma base crece con las horas restantes
  let sigma = 0.5 + hoursToMax * 0.12;

  // nubes aumentan incertidumbre
  if (cloudCover.includes('OVC'))       sigma += 1.2;
  else if (cloudCover.includes('BKN')) sigma += 0.8;
  else if (cloudCover.includes('SCT')) sigma += 0.4;

  // spread bajo = más húmedo = más incierto
  if (spread < 3) sigma += 0.8;
  else if (spread < 6) sigma += 0.4;

  if (tafAvailable)       sigma *= 0.80;  // TAF disponible reduce incertidumbre
  if (observedRateStable) sigma *= 0.90;

  return Math.max(0.3, Math.min(3.5, sigma));
}

function calcConfidence(
  spread: number,
  cloudCover: string,
  hoursToMax: number,
  tafAvailable: boolean,
  observedRateStable: boolean
): number {
  let score = 60;
  if (spread >= 10) score += 15;
  else if (spread >= 5) score += 8;
  else score -= 10;

  if (cloudCover === 'CLR' || cloudCover === 'FEW') score += 12;
  else if (cloudCover.includes('SCT')) score += 4;
  else if (cloudCover.includes('BKN')) score -= 8;
  else if (cloudCover.includes('OVC')) score -= 18;

  if (hoursToMax < 1) score += 15;
  else if (hoursToMax < 3) score += 8;
  else if (hoursToMax > 6) score -= 8;

  if (tafAvailable) score += 10;
  if (observedRateStable) score += 5;

  return Math.max(5, Math.min(98, score));
}

// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────

export async function getWeatherData(city: City): Promise<WeatherResult> {
  const now = new Date();
  const metarList = await fetchMetarHistory(city.station);
  const tafMax = await fetchTAFMax(city.station);

  if (!metarList.length) throw new Error('No METAR data for ' + city.station);

  const latest = metarList[metarList.length - 1];
  const { sunrise, sunset } = sunriseSunset(city.lat, city.lon, now, city.timezone);
  const nowH = localHour(now, city.timezone);

  // Temperatura de amanecer: METAR más cercano a sunrise
  const sunriseObs = metarList.reduce((best, m) => {
    const mH = localHour(new Date(m.obsTime), city.timezone);
    return Math.abs(mH - sunrise) < Math.abs(localHour(new Date(best.obsTime), city.timezone) - sunrise) ? m : best;
  }, metarList[0]);
  const T0 = sunriseObs.temp;

  // Tmax para el modelo: usar TAF si está disponible, si no usar máximo observado + proyección
  const obsMax = Math.max(...metarList.map(m => m.temp));
  const modelTmax = tafMax !== null ? Math.max(tafMax, obsMax) : obsMax + Math.max(0, (sunset - nowH) * 0.8);

  // Parámetros del modelo DTC
  const cloudNow = latest.clouds || 'CLR';
  const spreadNow = latest.temp - latest.dewp;
  const params = buildDtcParams(sunrise, sunset, T0, modelTmax, latest.dewp, cloudNow, latest.wspd);

  // Estabilidad de la tasa de calentamiento observada
  let observedRateStable = false;
  if (metarList.length >= 3) {
    const last3 = metarList.slice(-3);
    const rates = last3.slice(1).map((m, i) => m.temp - last3[i].temp);
    const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
    observedRateStable = rates.every(r => Math.abs(r - avgRate) < 1.5);
  }

  // Pico proyectado
  const projectedMaxC = params.T0 + params.Ta;
  const projectedMaxHour = params.tm;
  const hoursToMax = Math.max(0, projectedMaxHour - nowH);

  // Sigma y confidence
  const sigma = calcSigma(spreadNow, cloudNow, hoursToMax, tafMax !== null, observedRateStable);
  const confidence = calcConfidence(spreadNow, cloudNow, hoursToMax, tafMax !== null, observedRateStable);

  // ── Puntos observados ────────────────────────────────────────────────────────
  const obsPoints: ObsPoint[] = metarList.map(m => ({
    hour: localHour(new Date(m.obsTime), city.timezone),
    temp: city.unit === 'F' ? cToF(m.temp) : Math.round(m.temp),
    isObs: true as const,
  }));

  // ── Puntos de forecast DTC (cada 30 min, de ahora a sunrise siguiente) ───────
  const forecastPoints: ForecastPoint[] = [];
  const fStart = nowH;
  const fEnd = nowH <= sunset ? sunset + 6 : 24;
  for (let t = fStart; t <= fEnd; t += 0.5) {
    const tMod = t > 24 ? t - 24 : t;
    const centralC = dtcTemperature(tMod, params);
    const sigmaT = sigma * (1 + Math.abs(t - projectedMaxHour) * 0.05); // sigma crece lejos del pico
    forecastPoints.push({
      hour: t > 24 ? t - 24 : t,
      temp:  city.unit === 'F' ? cToF(centralC) : Math.round(centralC),
      upper: city.unit === 'F' ? cToF(centralC + sigmaT) : Math.round(centralC + sigmaT),
      lower: city.unit === 'F' ? cToF(centralC - sigmaT) : Math.round(centralC - sigmaT),
      isForecast: true as const,
    });
  }

  // Estadísticas del día
  const todayTemps = metarList.map(m => city.unit === 'F' ? cToF(m.temp) : Math.round(m.temp));
  const highToday = Math.max(...todayTemps);
  const lowToday  = Math.min(...todayTemps);

  return {
    currentTemp:      city.unit === 'F' ? cToF(latest.temp) : Math.round(latest.temp),
    highToday,
    lowToday,
    projectedMax:     city.unit === 'F' ? cToF(projectedMaxC) : Math.round(projectedMaxC),
    projectedMaxHour: Math.round(projectedMaxHour),
    confidence,
    sigma:            Math.round(sigma * 10) / 10,
    spread:           Math.round(spreadNow * 10) / 10,
    cloudCover:       cloudNow,
    windKt:           Math.round(latest.wspd),
    rawMetar:         latest.rawOb,
    obsPoints,
    forecastPoints,
  };
}