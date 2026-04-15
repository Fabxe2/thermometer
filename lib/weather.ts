import{City,cToF}from"./cities";
export type WeatherObs={tempC:number;tempDisplay:number;unit:"F"|"C";station:string;observedAt:string;observedISO:string;windSpeed:number|null;windDir:number|null;cloudCover:string|null;pressure:number|null;dewpoint:number|null;rawMetar:string|null;source:string;};
export type HourlyPoint={time:string;tempC:number;clouds?:string;wx?:string;dewpC?:number;wspdKt?:number;};
export type ForecastDay={maxC:number;minC:number;maxDisplay:number;minDisplay:number;};
export type WeatherData={current:WeatherObs|null;obsHourly:HourlyPoint[];forecastHourly:HourlyPoint[];forecast:ForecastDay|null;};
const WU_KEY=process.env.WU_API_KEY||'';
function parseTempFromMetar(m:string):number|null{const tg=m.match(/\bT([01])(\d{3})[01]\d{3}\b/);if(tg){const s=tg[1]==='1'?-1:1;return s*parseInt(tg[2],10)/10;}const r=m.match(/\b(M?\d{2})\/M?\d{2}\b/);if(!r)return null;return r[1].startsWith('M')?-parseInt(r[1].slice(1),10):parseInt(r[1],10);}
function parseWindFromMetar(m:string){const r=m.match(/(\d{3})(\d{2,3})KT/);return r?{dir:parseInt(r[1],10),speed:parseInt(r[2],10)}:{dir:null,speed:null};}
function parsePressureFromMetar(m:string):number|null{const q=m.match(/Q(\d{4})/);if(q)return parseInt(q[1],10);const a=m.match(/A(\d{4})/);if(a)return Math.round(parseInt(a[1],10)*0.03386);return null;}
function parseCloudFromMetar(m:string):string|null{return m.match(/(CLR|SKC|CAVOK|FEW|SCT|BKN|OVC)/)?.[1]??null;}
function nowLocalH(tz:string):number{const s=new Date().toLocaleTimeString('en-US',{timeZone:tz,hour:'2-digit',hour12:false});return parseInt(s,10)%24;}
function localHour(t:string):number{const m=t.match(/T(\d{2}):/);return m?parseInt(m[1],10):0;}
function validTemp(c:number):boolean{return c>-60&&c<60;}
async function fetchTgftpMetar(station:string,timezone:string):Promise<WeatherObs|null>{try{const res=await fetch(`https://tgftp.nws.noaa.gov/data/observations/metar/stations/${station}.TXT`,{cache:'no-store'});if(!res.ok)return null;const lines=(await res.text()).trim().split('\n');const raw=lines[1]?.trim()??lines[0]?.trim()??'';if(!raw)return null;const tempC=parseTempFromMetar(raw);if(tempC==null||!validTemp(tempC))return null;const{speed,dir}=parseWindFromMetar(raw);const tm=raw.match(/\b(\d{2})(\d{2})(\d{2})Z\b/);let observedAt='',observedISO=new Date().toISOString();if(tm){const now=new Date();const obs=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),parseInt(tm[1],10),parseInt(tm[2],10),parseInt(tm[3],10)));observedISO=obs.toISOString();observedAt=obs.toLocaleTimeString('en-US',{timeZone:timezone,hour:'numeric',minute:'2-digit',hour12:true});}return{tempC,tempDisplay:tempC,unit:'C',station,observedAt,observedISO,windSpeed:speed,windDir:dir,cloudCover:parseCloudFromMetar(raw),pressure:parsePressureFromMetar(raw),dewpoint:null,rawMetar:raw,source:'tgftp'};}catch{return null;}}
function parseClouds(raw:unknown):string{const order=['CLR','FEW','SCT','BKN','OVC','VV'];if(!raw)return'CLR';if(typeof raw==='string')return raw.toUpperCase().trim()||'CLR';if(Array.isArray(raw)&&raw.length){return(raw as {cover:string}[]).reduce((worst,layer)=>{const c=(layer?.cover??'').toUpperCase();return order.indexOf(c)>order.indexOf(worst)?c:worst;},'CLR');}return'CLR';}
async function fetchMetarHistory(station:string,timezone:string):Promise<HourlyPoint[]>{try{const res=await fetch(`https://aviationweather.gov/api/data/metar?ids=${station}&format=json&hours=48`,{cache:'no-store'});if(!res.ok)return[];const data:Record<string,unknown>[]=await res.json();if(!data?.length)return[];const now=new Date();const todayStr=now.toLocaleDateString('en-CA',{timeZone:timezone});return data.filter(m=>m.temp!=null&&validTemp(Number(m.temp))).map(m=>{const obsUTC=new Date(String(m.reportTime??m.obsTime??''));const localDateStr=obsUTC.toLocaleDateString('en-CA',{timeZone:timezone});const ts=obsUTC.toLocaleTimeString('en-US',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hour12:false});const[hS,mS]=ts.split(':');const h=parseInt(hS,10)%24;const min=parseInt(mS??'0',10);return{localDateStr,time:localDateStr+'T'+String(h).padStart(2,'0')+':'+String(min).padStart(2,'0')+':00',tempC:Number(m.temp),clouds:parseClouds(m.clouds??m.sky_condition??m.skyCondition),wx:String(m.wxString??m.wx_string??m.presentWeather??''),dewpC:m.dewp!=null?Number(m.dewp):undefined,wspdKt:m.wspd!=null?Number(m.wspd):undefined,obsUTC};}).filter(p=>p.localDateStr===todayStr&&p.obsUTC<=now).sort((a,b)=>a.obsUTC.getTime()-b.obsUTC.getTime()).map(({time,tempC})=>({time,tempC}));}catch{return[];}}
async function fetchPWSHistory(pwsId:string,unit:"F"|"C"):Promise<HourlyPoint[]>{if(!WU_KEY||!pwsId)return[];try{const today=new Date().toISOString().split('T')[0].replace(/-/g,'');const units=unit==='F'?'e':'m';const json=await fetch(`https://api.weather.com/v2/pws/history/hourly?stationId=${pwsId}&format=json&units=${units}&date=${today}&apiKey=${WU_KEY}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('PWS');return r.json();});return(json.observations??[]).map((o:{obsTimeLocal:string;imperial?:{tempAvg:number};metric?:{tempAvg:number};})=>{const raw=unit==='F'?(o.imperial?.tempAvg??0):(o.metric?.tempAvg??0);const tempC=unit==='F'?(raw-32)*5/9:raw;if(!validTemp(tempC))return null;return{time:o.obsTimeLocal.replace(' ','T'),tempC};}).filter(Boolean)as HourlyPoint[];}catch{return[];}}
async function fetchWUForecast(lat:number,lon:number,unit:"F"|"C"):Promise<{all:HourlyPoint[];day:ForecastDay|null}>{if(!WU_KEY)return _fetchOMForecast(lat,lon,'UTC');try{const units=unit==='F'?'e':'m';const json=await fetch(`https://api.weather.com/v3/wx/forecast/hourly/1day?geocode=${lat},${lon}&units=${units}&language=en-US&format=json&apiKey=${WU_KEY}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('WU');return r.json();});const times:string[]=json.validTimeLocal??[];const temps:number[]=json.temperature??[];if(!times.length)return _fetchOMForecast(lat,lon,'UTC');const toC=(t:number)=>unit==='F'?(t-32)*5/9:t;const all=times.map((t,i)=>({time:t.replace(/[+-]\d{4}$|Z$/,''),tempC:toC(temps[i])})).filter(p=>validTemp(p.tempC));const allC=all.map(p=>p.tempC);return{all,day:allC.length?{maxC:Math.max(...allC),minC:Math.min(...allC),maxDisplay:0,minDisplay:0}:null};}catch{return _fetchOMForecast(lat,lon,'UTC');}}
async function fetchOMForecast(lat:number,lon:number,timezone:string):Promise<{all:HourlyPoint[];day:ForecastDay|null}>{try{const json=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m&daily=temperature_2m_max,temperature_2m_min&timezone=${encodeURIComponent(timezone)}&forecast_days=2`,{cache:'no-store'}).then(r=>r.json());const todayStr=new Date().toLocaleDateString('en-CA',{timeZone:timezone});const all=(json.hourly.time as string[]).map((t,i)=>({time:t,tempC:json.hourly.temperature_2m[i] as number})).filter(p=>p.time.startsWith(todayStr)&&validTemp(p.tempC));const maxC=json.daily?.temperature_2m_max?.[0]??(all.length?Math.max(...all.map(p=>p.tempC)):0);const minC=json.daily?.temperature_2m_min?.[0]??(all.length?Math.min(...all.map(p=>p.tempC)):0);return{all,day:{maxC,minC,maxDisplay:0,minDisplay:0}};}catch{return{all:[],day:null};}}
async function fetchOMCurrent(city:City):Promise<WeatherObs|null>{try{const json=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m&timezone=auto`,{cache:'no-store'}).then(r=>r.json());const tempC:number=json.current.temperature_2m;if(!validTemp(tempC))return null;const now=new Date();return{tempC,tempDisplay:tempC,unit:'C',station:city.station,observedAt:now.toLocaleTimeString('en-US',{timeZone:city.timezone,hour:'numeric',minute:'2-digit',hour12:true}),observedISO:now.toISOString(),windSpeed:json.current.wind_speed_10m??null,windDir:json.current.wind_direction_10m??null,cloudCover:null,pressure:null,dewpoint:null,rawMetar:null,source:'open-meteo'};}catch{return null;}}




function blendForecast(pws:HourlyPoint[],model:HourlyPoint[],curH:number):HourlyPoint[]{if(!pws.length)return model;const pm=new Map<number,number>();for(const p of pws)pm.set(localHour(p.time),p.tempC);return model.map(pt=>{const h=localHour(pt.time);if(h<=curH&&pm.has(h)){const pw=pm.get(h)!;return{time:pt.time,tempC:Math.round((pw*0.6+pt.tempC*0.4)*10)/10};}return pt;});}
function calibrateForecast(metars:HourlyPoint[],blended:HourlyPoint[],curH:number):HourlyPoint[]{
if(!metars.length)return blended;
const mm=new Map<number,number>();for(const p of blended)mm.set(localHour(p.time),p.tempC);
const pairs:{x:number;y:number}[]=[];for(const obs of metars){const h=localHour(obs.time);if(h<=curH&&mm.has(h))pairs.push({x:mm.get(h)!,y:obs.tempC});}if(!pairs.length)return blended;
let a=1,b=0;if(pairs.length>=3){const n=pairs.length,sx=pairs.reduce((s,p)=>s+p.x,0),sy=pairs.reduce((s,p)=>s+p.y,0),sxy=pairs.reduce((s,p)=>s+p.x*p.y,0),sxx=pairs.reduce((s,p)=>s+p.x*p.x,0),den=n*sxx-sx*sx;if(Math.abs(den)>0.001){a=Math.max(0.7,Math.min(1.3,(n*sxy-sx*sy)/den));b=(sy-a*sx)/n;}}else{b=pairs.reduce((s,p)=>s+(p.y-p.x),0)/pairs.length;}
let rateDelta=0;const sorted=[...metars].sort((x,y)=>localHour(x.time)-localHour(y.time));if(sorted.length>=2){const last=sorted[sorted.length-1];const prev=sorted.slice(0,-1).reverse().find(p=>localHour(p.time)<=localHour(last.time)-1);if(prev){const hd=localHour(last.time)-localHour(prev.time);if(hd>0){const rr=(last.tempC-prev.tempC)/hd;const lh=localHour(last.time),ph=localHour(prev.time);const rm=(mm.has(lh)&&mm.has(ph))?(mm.get(lh)!-mm.get(ph)!)/hd:0;rateDelta=Math.max(-2,Math.min(2,rr-rm));}}}
const lastObs=sorted[sorted.length-1];
const cloudCover=lastObs?.clouds??'CLR';
const dewpC=lastObs?.dewpC;
const wxStr=lastObs?.wx??'';
const wspdKt=lastObs?.wspdKt??0;
const cloudCorrVal=cloudCover==='OVC'?-3:cloudCover==='BKN'?-1.5:cloudCover==='SCT'?-0.5:cloudCover==='CLR'||cloudCover==='CAVOK'?+1:0;
const dpDep=dewpC!=null?lastObs.tempC-dewpC:null;const dpCorrVal=dpDep!=null?Math.max(-1.5,Math.min(1.5,(dpDep-10)*0.1)):0;
const windCorrVal=wspdKt>25?-1.5:wspdKt>15?-0.5:0;
const isWet=/RA|TS|SH|DZ|SN/.test(wxStr);
const maxObs=Math.max(...metars.map(p=>p.tempC));
return blended.map(pt=>{
const h=localHour(pt.time);if(h<=curH)return pt;
const ahead=h>curH?h-curH:h+24-curH;
const dBias=Math.max(0,1-ahead/12);
const dRate=Math.max(0,1-ahead/6);
const dCloud=Math.max(0,1-ahead/8);
const dDp=Math.max(0,1-ahead/10);
const dWind=Math.max(0,1-ahead/4);
const regCorr=(a*pt.tempC+b-pt.tempC)*dBias;
const rateCorr=rateDelta*dRate;
const cloudCorr=cloudCorrVal*dCloud;
const dpCorr=dpCorrVal*dDp;
const windCorr=windCorrVal*dWind;
let raw=pt.tempC+regCorr+rateCorr+cloudCorr+dpCorr+windCorr;
if(!isWet&&ahead<=8)raw=Math.max(raw,maxObs);
return{time:pt.time,tempC:Math.round(raw*10)/10};
});
}
function applyUnit(obs:WeatherObs,city:City):WeatherObs{obs.tempDisplay=city.unit==='F'?cToF(obs.tempC):Math.round(obs.tempC);obs.unit=city.unit;return obs;}
function applyForecastUnit(f:ForecastDay,city:City):ForecastDay{f.maxDisplay=city.unit==='F'?cToF(f.maxC):Math.round(f.maxC);f.minDisplay=city.unit==='F'?cToF(f.minC):Math.round(f.minC);return f;}
export async function fetchWeatherData(city:City):Promise<WeatherData>{
const curH=nowLocalH(city.timezone);const isUS=city.region==='us';
const[metarObs,pwsObs,metarHistory,forecastResult]=await Promise.all([fetchTgftpMetar(city.station,city.timezone),city.pwsId?fetchPWSHistory(city.pwsId,city.unit):Promise.resolve([]),fetchMetarHistory(city.station,city.timezone),isUS?fetchWUForecast(city.lat,city.lon,city.unit):fetchOMForecast(city.lat,city.lon,city.timezone),]);
const modelAll:HourlyPoint[]=forecastResult.all??[];
const obsHourly=metarHistory.filter(p=>localHour(p.time)<=curH);
const blended=blendForecast(pwsObs,modelAll,curH);
const forecastHourly=calibrateForecast(metarHistory,blended,curH);
let forecast:ForecastDay|null=null;if(forecastHourly.length>0){const temps=forecastHourly.map(p=>p.tempC);forecast=applyForecastUnit({maxC:Math.max(...temps),minC:Math.min(...temps),maxDisplay:0,minDisplay:0},city);}else if(forecastResult.day){forecast=applyForecastUnit(forecastResult.day,city);}
const current=metarObs?applyUnit(metarObs,city):await fetchOMCurrent(city).then(c=>c?applyUnit(c,city):null);
return{current,obsHourly,forecastHourly,forecast};}