export type City = {
  name: string; slug: string; station: string; lat: number; lon: number;
  unit: 'F' | 'C'; timezone: string; tzAbbr: string; region: 'us' | 'intl';
  pwsId?: string; wundergroundSlug: string;
};

export const CITIES: City[] = [
  { name:'New York',     slug:'new-york',     station:'KLGA', lat:40.77,  lon:-73.87,  unit:'F', timezone:'America/New_York',               tzAbbr:'ET',   region:'us',   pwsId:'KNYNEWYO1552', wundergroundSlug:'KLGA' },
  { name:'Chicago',      slug:'chicago',      station:'KORD', lat:41.98,  lon:-87.90,  unit:'F', timezone:'America/Chicago',                tzAbbr:'CT',   region:'us',   pwsId:'T00061083',    wundergroundSlug:'KORD' },
  { name:'Dallas',       slug:'dallas',       station:'KDAL', lat:32.84,  lon:-96.85,  unit:'F', timezone:'America/Chicago',                tzAbbr:'CT',   region:'us',   pwsId:'KTXDALLA703',  wundergroundSlug:'KDAL' },
  { name:'Miami',        slug:'miami',        station:'KMIA', lat:25.79,  lon:-80.29,  unit:'F', timezone:'America/New_York',               tzAbbr:'ET',   region:'us',   pwsId:'KFLMIAMI1030', wundergroundSlug:'KMIA' },
  { name:'Seattle',      slug:'seattle',      station:'KSEA', lat:47.45,  lon:-122.30, unit:'F', timezone:'America/Los_Angeles',            tzAbbr:'PT',   region:'us',   pwsId:'T00060006',    wundergroundSlug:'KSEA' },
  { name:'Atlanta',      slug:'atlanta',      station:'KATL', lat:33.63,  lon:-84.43,  unit:'F', timezone:'America/New_York',               tzAbbr:'ET',   region:'us',   pwsId:'KGAATLAN557',  wundergroundSlug:'KATL' },
  { name:'London',       slug:'london',       station:'EGLC', lat:51.51,  lon:0.05,    unit:'C', timezone:'Europe/London',                  tzAbbr:'GMT',  region:'intl', pwsId:'ILONDON828',   wundergroundSlug:'EGLC' },
  { name:'Toronto',      slug:'toronto',      station:'CYYZ', lat:43.68,  lon:-79.63,  unit:'C', timezone:'America/Toronto',                tzAbbr:'ET',   region:'intl', pwsId:'IONTARIO1108', wundergroundSlug:'CYYZ' },
  { name:'Buenos Aires', slug:'buenos-aires', station:'SAEZ', lat:-34.82, lon:-58.53,  unit:'C', timezone:'America/Argentina/Buenos_Aires', tzAbbr:'ART',  region:'intl', wundergroundSlug:'SAEZ' },
  { name:'Seoul',        slug:'seoul',        station:'RKSI', lat:37.46,  lon:126.44,  unit:'C', timezone:'Asia/Seoul',                     tzAbbr:'KST',  region:'intl', wundergroundSlug:'RKSI' },
  { name:'Ankara',       slug:'ankara',       station:'LTAC', lat:40.13,  lon:32.99,   unit:'C', timezone:'Europe/Istanbul',                tzAbbr:'TRT',  region:'intl', wundergroundSlug:'LTAC' },
  { name:'Milan',        slug:'milan',        station:'LIMC', lat:45.63,  lon:8.72,    unit:'C', timezone:'Europe/Rome',                    tzAbbr:'CET',  region:'intl', wundergroundSlug:'LIMC' },
  { name:'Madrid',       slug:'madrid',       station:'LEMD', lat:40.47,  lon:-3.55,   unit:'C', timezone:'Europe/Madrid',                  tzAbbr:'CET',  region:'intl', wundergroundSlug:'LEMD' },
  { name:'Wellington',   slug:'wellington',   station:'NZWN', lat:-41.33, lon:174.81,  unit:'C', timezone:'Pacific/Auckland',               tzAbbr:'NZST', region:'intl', pwsId:'IWELLI216',    wundergroundSlug:'NZWN' },
];

export function getCityBySlug(slug: string): City | undefined {
  return CITIES.find(c => c.slug === slug);
}

export function getLocalTime(timezone: string, abbr: string): string {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true });
  return time + ' ' + abbr;
}

export function cToF(c: number): number { return Math.round(c * 9 / 5 + 32); }
export function fToC(f: number): number { return (f - 32) * 5 / 9; }

export function applyUnit(c: number, unit: 'F' | 'C'): number {
  return unit === 'F' ? cToF(c) : Math.round(c);
}
