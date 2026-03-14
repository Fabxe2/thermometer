import { City, cToF } from "./cities";

export type WeatherObs = {
  tempC: number; tempDisplay: number; unit: "F"|"C"; station: string;
  observedAt: string; observedISO: string; windSpeed: number|null;
  windDir: number|null; cloudCover: string|null; pressure: number|null;
  dewpoint: number|null; rawMetar: string|null;
};

export type HourlyPoint = { time: string; tempC: number; };
export type ForecastDay = { maxC: number; minC: number; maxDisplay: number; minDisplay: number; };
export type WeatherData = { current: WeatherObs|null; hourly: HourlyPoint[]; forecast: ForecastDay|null; error?: string; };

async function fetchNWSCurrent(station: string): Promise<WeatherObs|null> {
  try {
    const res = await fetch(`https://api.weather.gov/stations/${station}/observations/latest?require_qc=false`,
      { headers: { "User-Agent": "thermometer-app/1.0" }, next: { revalidate: 300 } as RequestInit["next"] });
    if (!res.ok) return null;
    const json = await res.json();
    const props = json.properties;
    const tempC = props.temperature?.value;
    if (tempC == null) return null;
    const timestamp: string = props.timestamp;
    const observedAt = new Date(timestamp).toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit", hour12:true });
    return {
      tempC, tempDisplay: tempC, unit: "C", station,
      observedAt, observedISO: timestamp,
      windSpeed: props.windSpeed?.value ?? null,
      windDir: props.windDirection?.value ?? null,
      cloudCover: props.textDescription ?? null,
      pressure: props.barometricPressure?.value ? Math.round(props.barometricPressure.value/100) : null,
      dewpoint: props.dewpoint?.value ?? null,
      rawMetar: props.rawMessage ?? null,
    };
  } catch { return null; }
}

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
    const day = periods.find(p => p.isDaytime);
    const night = periods.find(p => !p.isDaytime);
    const toC = (t:number, u:string) => u==="F" ? (t-32)*5/9 : t;
    if (!day || !night) return null;
    const maxC = toC(day.temperature, day.temperatureUnit);
    const minC = toC(night.temperature, night.temperatureUnit);
    return { maxC, minC, maxDisplay: maxC, minDisplay: minC };
  } catch { return null; }
}

async function fetchOpenMeteo(city: City): Promise<WeatherData> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m&hourly=temperature_2m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
    const res = await fetch(url, { next: { revalidate: 600 } as RequestInit["next"] });
    if (!res.ok) throw new Error("open-meteo failed");
    const json = await res.json();
    const tempC: number = json.current.temperature_2m;
    const now = new Date();
    const observedAt = now.toLocaleTimeString("en-US", { timeZone: city.timezone, hour:"numeric", minute:"2-digit", hour12:true });
    const current: WeatherObs = {
      tempC, tempDisplay: tempC, unit:"C", station: city.station,
      observedAt, observedISO: now.toISOString(),
      windSpeed: json.current.wind_speed_10m ?? null,
      windDir: json.current.wind_direction_10m ?? null,
      cloudCover: null, pressure: null, dewpoint: null, rawMetar: null,
    };
    const hourly: HourlyPoint[] = (json.hourly.time as string[]).map((t:string, i:number) => ({ time: t, tempC: json.hourly.temperature_2m[i] }));
    const maxC: number = json.daily.temperature_2m_max[0];
    const minC: number = json.daily.temperature_2m_min[0];
    return { current, hourly, forecast: { maxC, minC, maxDisplay: maxC, minDisplay: minC } };
  } catch(e) { return { current: null, hourly: [], forecast: null, error: String(e) }; }
}

export async function fetchWeatherData(city: City): Promise<WeatherData> {
  if (city.region === "us") {
    try {
      const [current, hourly, forecast] = await Promise.all([
        fetchNWSCurrent(city.station),
        fetchNWSHourly(city.lat, city.lon),
        fetchNWSForecast(city.lat, city.lon),
      ]);
      if (current) {
        if (city.unit==="F") { current.tempDisplay = cToF(current.tempC); current.unit="F"; }
        if (forecast) {
          forecast.maxDisplay = city.unit==="F" ? cToF(forecast.maxC) : Math.round(forecast.maxC);
          forecast.minDisplay = city.unit==="F" ? cToF(forecast.minC) : Math.round(forecast.minC);
        }
        return { current, hourly, forecast };
      }
    } catch { /* fallthrough */ }
  }
  const data = await fetchOpenMeteo(city);
  if (data.current && city.unit==="F") { data.current.tempDisplay = cToF(data.current.tempC); data.current.unit="F"; }
  if (data.forecast) {
    data.forecast.maxDisplay = city.unit==="F" ? cToF(data.forecast.maxC) : Math.round(data.forecast.maxC);
    data.forecast.minDisplay = city.unit==="F" ? cToF(data.forecast.minC) : Math.round(data.forecast.minC);
  }
  return data;
}