"use client";
import{ComposedChart,Line,XAxis,YAxis,ReferenceLine,Tooltip,ResponsiveContainer,CartesianGrid}from"recharts";
export type ChartPoint={x:number;forecast?:number;observed?:number};
type Props={data:ChartPoint[];height?:number;unit?:"F"|"C";cityHour?:number};
function xToTime(x:number):string{const h=Math.floor(x);const m=Math.round((x-h)*60);const ampm=h>=12?"PM":"AM";const h12=h%12||12;return h12+":"+String(m).padStart(2,"0")+" "+ampm;}
function CustomTooltip({active,payload,unit}:{active?:boolean;payload?:{dataKey:string;value:number;payload:ChartPoint}[];label?:number;unit?:"F"|"C"}){if(!active||!payload?.length)return null;const sym=unit==="F"?"°F":"°C";const obs=payload.find(p=>p.dataKey==="observed");const fc=payload.find(p=>p.dataKey==="forecast");if(!obs&&!fc)return null;
return(<div style={{background:"rgba(10,10,10,0.95)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:6,padding:"8px 12px",fontSize:11,fontFamily:"monospace",lineHeight:1.9,pointerEvents:"none"}}>
{obs&&<><div style={{color:"rgba(255,255,255,0.4)",marginBottom:2}}>{xToTime(obs.payload.x)}</div><div style={{color:"#fff",display:"flex",justifyContent:"space-between",gap:20}}><span>OBS</span><strong>{obs.value}{sym}</strong></div></>}
{fc&&<><div style={{color:"rgba(255,255,255,0.4)",marginBottom:2}}>{xToTime(fc.payload.x)}</div><div style={{color:"rgba(255,255,255,0.45)",display:"flex",justifyContent:"space-between",gap:20}}><span>FCST</span><span>{fc.value}{sym}</span></div></>}
</div>);}
export default function Sparkline({data,height=300,unit="C",cityHour}:Props){
if(!data||!data.length)return null;const allY=data.flatMap(d=>[d.observed,d.forecast].filter((v):v is number=>v!=null));if(!allY.length)return null;
const min=Math.min(...allY),max=Math.max(...allY),pad=Math.max((max-min)*0.15,1.5);const domain:[number,number]=[min-pad,max+pad];
const range=max-min||1;const step=range<=4?1:range<=10?2:range<=20?4:5;const yStart=Math.floor((min-pad)/step)*step;const yTicks:number[]=[];for(let v=yStart;v<=max+pad+step;v+=step)yTicks.push(Math.round(v));
const nowX=cityHour??new Date().getHours();const sym=unit==="F"?"°F":"°C";const xTicks=[0,3,6,9,12,15,18,21];const xLabels:Record<number,string>={0:"12a",3:"3a",6:"6a",9:"9a",12:"12p",15:"3p",18:"6p",21:"9p"};
return(<ResponsiveContainer width="100%" height={height}><ComposedChart data={data} margin={{top:8,right:12,left:0,bottom:0}}>
<CartesianGrid horizontal vertical={false} stroke="rgba(255,255,255,0.04)"/>
<XAxis dataKey="x" type="number" domain={[0,23]} ticks={xTicks} tickFormatter={h=>xLabels[h]??""} tick={{fill:"rgba(255,255,255,0.3)",fontSize:10,fontFamily:"monospace"}} axisLine={false} tickLine={false}/>
<YAxis domain={domain} ticks={yTicks} tickFormatter={v=>Math.round(v)+sym} tick={{fill:"rgba(255,255,255,0.3)",fontSize:10,fontFamily:"monospace"}} axisLine={false} tickLine={false} width={38}/>
<Tooltip content={<CustomTooltip unit={unit}/>} cursor={{stroke:"rgba(255,255,255,0.12)",strokeWidth:1}}/>
<ReferenceLine x={nowX} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="3 3" label={{value:"now",position:"top",fill:"rgba(255,255,255,0.25)",fontSize:9,fontFamily:"monospace"}}/>
<Line type="monotone" dataKey="forecast" stroke="rgba(255,255,255,0.4)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={{r:4,fill:"rgba(255,255,255,0.6)",stroke:"none"}} connectNulls isAnimationActive={false}/>
<Line type="linear" dataKey="observed" stroke="#ffffff" strokeWidth={2.5} dot={false} activeDot={{r:5,fill:"#ffffff",stroke:"rgba(255,255,255,0.3)",strokeWidth:3}} connectNulls isAnimationActive={false}/>
</ComposedChart></ResponsiveContainer>);}