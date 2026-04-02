'use client';
import { BarChart, Bar, XAxis, YAxis, Cell, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts';

type Token = { outcome: string; price: number };
type Props = { tokens: Token[]; question: string; link: string };

export default function MarketChart({ tokens, question, link }: Props) {
  if (!tokens.length) return null;
  const sorted = [...tokens].sort((a, b) => b.price - a.price);
  const max = sorted[0];

  return (
    <div style={{ width: '100%' }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, lineHeight: 1.4 }}>
        <a href={link} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
          {question} ↗
        </a>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 60, bottom: 0, left: 0 }}>
          <XAxis type="number" domain={[0,100]} hide />
          <YAxis type="category" dataKey="outcome" width={52}
            tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
          <ReferenceLine x={50} stroke="rgba(255,255,255,.1)" strokeWidth={1} />
          <Tooltip
            contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,.1)', borderRadius: 6, fontSize: 11 }}
            formatter={(v: number) => [`${v}¢`, 'Price']}
          />
          <Bar dataKey="price" radius={[0,3,3,0]}>
            {sorted.map((t, i) => (
              <Cell key={i} fill={t.outcome === max.outcome ? 'rgba(232,184,109,0.8)' : 'rgba(255,255,255,0.15)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--accent)', marginTop: 4 }}>
        <strong>{max.price}¢</strong> {max.outcome}
      </div>
    </div>
  );
}