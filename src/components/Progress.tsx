import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { dateStr, plan } from '../logic'
import { bodyOn, exById, exerciseHistory, fmtDate, fmtKg, k } from '../stats'
import LineChart from './LineChart'
import type { Workout } from '../types'

const POTENTIAL_REPS = [1, 3, 5, 8, 10, 12]

export default function Progress({ workouts, exId, onOpen }: { workouts: Workout[]; exId: string | null; onOpen: (id: string | null) => void }) {
  if (exId) return <Detail workouts={workouts} exId={exId} />

  const ids = [...new Set(plan.days.flatMap((d) => d.exercises.map((e) => e.id)))]
  return (
    <>
      <div className="sheet-label">Упражнения</div>
      {ids.map((id) => (
        <button key={id} className="row-btn" onClick={() => onOpen(id)}>
          <span>{exById(id)!.name}</span>
          <span className="muted chev">›</span>
        </button>
      ))}
      <SkipStats workouts={workouts} />
    </>
  )
}

function Detail({ workouts, exId }: { workouts: Workout[]; exId: string }) {
  const ex = exById(exId)!
  const body = useLiveQuery(() => db.bodyWeights.toArray(), []) ?? []
  const recs = (useLiveQuery(() => db.records.where('exId').equals(exId).toArray(), [exId]) ?? []).sort((a, b) => (a.date < b.date ? -1 : 1))
  const [metric, setMetric] = useState<'oneRM' | 'weight' | 'record'>('oneRM')
  const bw = ex.type === 'bodyweight'
  const pts = exerciseHistory(exId, workouts, body)
  const withRM = pts.filter((p) => p.oneRM != null)
  const last = withRM.at(-1)
  const bestCalc = withRM.length ? Math.max(...withRM.map((p) => p.oneRM!)) : null
  const bestRec = recs.length ? recs.reduce((a, b) => (b.kg > a.kg ? b : a)) : null
  const bodyNow = bodyOn(dateStr(), body)
  const chart =
    metric === 'record'
      ? recs.map((r) => ({ date: r.date, value: r.kg, hollow: false }))
      : pts
          .filter((p) => (metric === 'oneRM' ? p.oneRM != null : true))
          .map((p) => ({ date: p.date, value: metric === 'oneRM' ? p.oneRM! : p.weight, hollow: metric === 'oneRM' && p.inexact }))

  return (
    <>
      <h2 className="detail-name">{ex.name}</h2>

      {bw && bodyNow == null && <BodyInput />}

      <div className="big-row">
        <div>
          <div className="meta">Расчётный 1RM{bw ? ' (с весом тела)' : ''}</div>
          <div className="big">{last ? `${fmtKg(last.oneRM!)} кг` : '—'}</div>
          <div className="meta">
            {last?.inexact ? 'неточно: больше 12 повторов' : bestCalc != null ? `лучший ${fmtKg(bestCalc)} кг` : 'по формуле'}
          </div>
        </div>
        <div>
          <div className="meta">Рекорд на раз</div>
          <div className="big">{bestRec ? `${bw ? '+' : ''}${fmtKg(bestRec.kg)} кг` : '—'}</div>
          <div className="meta">{bestRec ? fmtDate(bestRec.date) : 'вносится в «Достижениях»'}</div>
        </div>
      </div>

      <div className="seg">
        <button className={metric === 'oneRM' ? 'on' : ''} onClick={() => setMetric('oneRM')}>
          1RM
        </button>
        <button className={metric === 'weight' ? 'on' : ''} onClick={() => setMetric('weight')}>
          {bw ? 'Доп. вес' : 'Рабочий вес'}
        </button>
        <button className={metric === 'record' ? 'on' : ''} onClick={() => setMetric('record')}>
          Рекорд
        </button>
      </div>
      <LineChart points={chart} />
      {metric === 'oneRM' && chart.some((c) => c.hollow) && <p className="meta">Пустая точка — лучший подход больше 12 повторов, оценка неточная.</p>}

      {last && (
        <>
          <div className="sheet-label">Сколько потенциально сделаю</div>
          <table className="pot">
            <tbody>
              {POTENTIAL_REPS.map((r) => {
                const total = last.oneRM! / k(r)
                const w = bw ? total - (bodyOn(dateStr(), body) ?? 0) : total
                return (
                  <tr key={r}>
                    <td>{r} повт.</td>
                    <td>{bw ? (w <= 0 ? 'свой вес' : `+${fmtKg(w)} кг`) : `${fmtKg(w)} кг`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      {pts.length > 0 && (
        <>
          <div className="sheet-label">Тренировки</div>
          {[...pts].reverse().map((p) => (
            <div key={p.date} className="hist-ex">
              <span>{fmtDate(p.date, true)}</span>
              <span className="muted">
                {bw ? '+' : ''}
                {fmtKg(p.weight)} кг{p.oneRM != null ? ` · 1RM ${fmtKg(p.oneRM)}` : ''}
              </span>
            </div>
          ))}
        </>
      )}
    </>
  )
}

export function BodyInput({ hint = 'Для подтягиваний 1RM считается от веса тела. Введи свой вес:' }: { hint?: string }) {
  const [v, setV] = useState('')
  return (
    <div className="notes">
      <p className="meta">{hint}</p>
      <div className="inline">
        <input className="comment" inputMode="decimal" placeholder="Вес тела, кг" value={v} onChange={(e) => setV(e.target.value)} />
        <button
          className="btn small"
          onClick={() => {
            const kg = parseFloat(v.replace(',', '.'))
            if (kg > 0) db.bodyWeights.add({ date: dateStr(), kg })
          }}
        >
          Сохранить
        </button>
      </div>
    </div>
  )
}

function SkipStats({ workouts }: { workouts: Workout[] }) {
  const stats = new Map<string, { total: number; skipped: number; notes: Map<string, number> }>()
  for (const w of workouts) {
    for (const e of w.exercises) {
      const touched = e.skipped || e.sets.some((s) => s.done)
      if (!touched) continue
      const st = stats.get(e.exId) ?? { total: 0, skipped: 0, notes: new Map() }
      st.total++
      if (e.skipped) {
        st.skipped++
        for (const t of [...(e.tags ?? []), ...(w.tags ?? [])]) st.notes.set(t, (st.notes.get(t) ?? 0) + 1)
        if (e.comment) st.notes.set(e.comment, (st.notes.get(e.comment) ?? 0) + 1)
      }
      stats.set(e.exId, st)
    }
  }
  const rows = [...stats.entries()].filter(([, s]) => s.skipped > 0).sort((a, b) => b[1].skipped - a[1].skipped)

  return (
    <>
      <div className="sheet-label" style={{ marginTop: 24 }}>
        Пропуски
      </div>
      {!rows.length && <p className="muted">Пока ничего не пропущено.</p>}
      {rows.map(([id, s]) => (
        <div key={id} className="hist-ex">
          <span>
            {exById(id)?.name ?? id} — {s.skipped} из {s.total}
          </span>
          {s.notes.size > 0 && (
            <span className="muted">
              {[...s.notes.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([t, n]) => (n > 1 ? `${t} ×${n}` : t))
                .join(', ')}
            </span>
          )}
        </div>
      ))}
    </>
  )
}
