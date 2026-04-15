import type{HourlyPoint}from"../../lib/weather";import{cToF}from"../../lib/cities";
type P={obsHourly:HourlyPoint[];unit:"F"|"C";timezone:string;currentTemp:number|null;currentTime:string;};
function toD(c:number,u:"F"|"C"):number{return u==="F"?cToF(c):Math.round(c);}
function fmt(iso:string):string{const tm=iso.match(/T(\d{2}):(\d{2})/);if(!tm)return"";const h=parseInt(tm[1],10)%24;const min=parseInt(tm[2],10);const ampm=h>=12?"PM":"AM";const h12=h%12||12;return h12+":"+String(min).padStart(2,"0")+" "+ampm;}
export default function ObsLog({obsHourly,unit,currentTemp,currentTime}:P){
type E={time:string;tempC:number;live:boolean};const es:E[]=[];
if(currentTemp!==null&&currentTime)es.push({time:currentTime,tempC:currentTemp,live:true});
for(const pt of[...obsHourly].reverse()){const t=fmt(pt.time);if(!t||t===currentTime)continue;es.push({time:t,tempC:pt.tempC,live:false});}
if(!es.length)return null;
const all=es.map(e=>toD(e.tempC,unit));const mn=Math.min(...all),mx=Math.max(...all),rng=mx-mn||1;
return(<div>
<div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.15em",color:"rgba(255,255,255,0.3)",marginBottom:12,fontFamily:"monospace"}}>Observaciones METAR</div>
{es.map((e,i)=>{const v=toD(e.tempC,unit);const pct=Math.round(((v-mn)/rng)*100);const last=i===es.length-1;
return(<div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"6px 0",borderBottom:last?"none":"0.5px solid rgba(255,255,255,0.06)"}}>
<span style={{fontSize:11,fontFamily:"monospace",color:"rgba(255,255,255,0.35)",minWidth:60,flexShrink:0}}>{e.time}</span>
<span style={{fontSize:13,fontWeight:500,fontFamily:"monospace",color:"#fff",minWidth:46,flexShrink:0}}>{v}°{unit}</span>
<div style={{flex:1,height:3,background:"rgba(255,255,255,0.08)",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:pct+"%",minWidth:4,borderRadius:2,background:e.live?"#fff":"rgba(255,255,255,0.45)"}}/></div>
{e.live?<span style={{fontSize:10,color:"#4ade80",fontFamily:"monospace",flexShrink:0}}>● live</span>:<span style={{fontSize:10,color:"rgba(255,255,255,0.25)",fontFamily:"monospace",flexShrink:0}}>METAR</span>}
</div>);})} </div>);}