"use client";
type Props = { data: number[]; width?: number; height?: number; color?: string; };
export default function Sparkline({ data, width=100, height=20, color="var(--color-data)" }: Props) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1, pad = 1;
  const points = data.map((v,i) => {
    const x = pad + (i/(data.length-1))*(width-pad*2);
    const y = pad + ((max-v)/range)*(height-pad*2);
    return x.toFixed(2)+","+y.toFixed(2);
  }).join(" ");
  return (
    <svg viewBox={"0 0 "+width+" "+height} preserveAspectRatio="none" className="w-full overflow-visible" style={{ height }}>
      <polyline points={points} style={{ fill:"none", stroke:color, strokeWidth:1.2, strokeLinecap:"round", strokeLinejoin:"round" }} />
    </svg>
  );
}