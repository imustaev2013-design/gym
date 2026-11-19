import { fmtDate } from '../stats'

export interface ChartPoint {
  date: string
  value: number
  hollow?: boolean
}

/** Простой SVG-график: равные интервалы по тренировкам, серая шкала */
export default function LineChart({ points, unit = 'кг' }: { points: ChartPoint[]; unit?: string }) {
  if (!points.length) return <p className="muted">Пока нет данных</p>
  const W = 358
  const H = 150
  const padL = 36
  const padR = 12
  const padT = 12
  const padB = 22
  const vals = points.map((p) => p.value)
  let min = Math.min(...vals)
  let max = Math.max(...vals)
  if (min === max) {
    min -= 1
    max += 1
  }
  const span = max - min
  min -= span * 0.1
  max += span * 0.1
  const x = (i: number) => (points.length === 1 ? (padL + W - padR) / 2 : padL + (i * (W - padL - padR)) / (points.length - 1))
  const y = (v: number) => padT + ((max - v) / (max - min)) * (H - padT - padB)
  const label = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',')
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" className="chart">
      {[min, (min + max) / 2, max].map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
          <text x={padL - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--mid)">
            {label(v)}
          </text>
        </g>
      ))}
      {points.length > 1 && <polyline points={line} fill="none" stroke="var(--fg)" strokeWidth="1.5" />}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(p.value)}
          r="3.5"
          fill={p.hollow ? 'var(--bg)' : 'var(--fg)'}
          stroke="var(--fg)"
          strokeWidth="1.5"
        />
      ))}
      <text x={x(0)} y={H - 6} textAnchor={points.length === 1 ? 'middle' : 'start'} fontSize="10" fill="var(--mid)">
        {fmtDate(points[0].date)}
      </text>
      {points.length > 1 && (
        <text x={x(points.length - 1)} y={H - 6} textAnchor="end" fontSize="10" fill="var(--mid)">
          {fmtDate(points.at(-1)!.date)}
        </text>
      )}
      <text x={W - padR} y={10} textAnchor="end" fontSize="10" fill="var(--mid)">
        {unit}
      </text>
    </svg>
  )
}
