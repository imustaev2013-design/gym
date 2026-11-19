import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { dateStr, plan } from '../logic'
import { LEVEL_NAMES, hasStandard, rate, useProfile } from '../standards'
import { bodyOn, exById, exerciseHistory, fmtDate, fmtKg } from '../stats'
import { BodyInput } from './Progress'
import type { Workout } from '../types'

type Rec = { id?: number; exId: string; date: string; kg: number }

export default function Achievements({ workouts, onSettings }: { workouts: Workout[]; onSettings: () => void }) {
  const body = useLiveQuery(() => db.bodyWeights.toArray(), []) ?? []
  const records = useLiveQuery(() => db.records.toArray(), []) ?? []
  const profile = useProfile()
  const [openId, setOpenId] = useState<string | null>(null)
  const bodyKg = bodyOn(dateStr(), body)
  const ids = [...new Set(plan.days.flatMap((d) => d.exercises.map((e) => e.id)))]

  const rows = ids
    .map((id) => {
      const ex = exById(id)!
      const bw = ex.type === 'bodyweight'
      const pts = exerciseHistory(id, workouts, body).filter((p) => p.oneRM != null)
      const calc = pts.length ? pts.reduce((a, b) => (b.oneRM! > a.oneRM! ? b : a)) : null
      const recs = records.filter((r) => r.exId === id)
      // рекорд на раз: для подтягиваний в итоговый вес добавляется вес тела на дату записи
      const total = (r: Rec) => r.kg + (bw ? (bodyOn(r.date, body) ?? 0) : 0)
      const rec = recs.length ? recs.reduce((a, b) => (total(b) > total(a) ? b : a)) : null
      const recTotal = rec ? total(rec) : 0
      const score = Math.max(calc?.oneRM ?? 0, recTotal)
      const rating = profile && bodyKg && score > 0 && hasStandard(id) ? rate(id, profile, score, bodyKg) : null
      return { id, ex, bw, calc, rec, recs, rating, byRecord: recTotal > (calc?.oneRM ?? 0) }
    })
    .sort((a, b) => (b.rating?.pct ?? -1) - (a.rating?.pct ?? -1) || Number(!!b.calc || !!b.rec) - Number(!!a.calc || !!a.rec))

  return (
    <>
      {bodyKg == null && <BodyInput hint="Для процентилей нужен вес тела. Введи его:" />}
      {profile == null && (
        <p className="meta">
          Чтобы увидеть проценты, укажи пол и возраст.{' '}
          <button className="link" onClick={onSettings}>
            Открыть настройки
          </button>
        </p>
      )}
      <p className="meta">
        Расчётный 1RM считается по формуле из твоих подходов. Рекорд на раз — то, что ты реально поднял один раз, его вносишь сам.
      </p>
      {rows.map(({ id, ex, bw, calc, rec, recs, rating, byRecord }) => (
        <section key={id} className="ach">
          <div className="hist-head">
            <b>{ex.name}</b>
          </div>
          <div className="ach-two">
            <div>
              <div className="meta">Расчётный 1RM</div>
              <div className="ach-val">{calc ? `${fmtKg(calc.oneRM!)} кг` : '—'}</div>
              {calc && <div className="meta">{fmtDate(calc.date)}</div>}
            </div>
            <div>
              <div className="meta">Рекорд на раз</div>
              <div className="ach-val">{rec ? `${bw ? '+' : ''}${fmtKg(rec.kg)} кг` : '—'}</div>
              {rec && <div className="meta">{fmtDate(rec.date)}</div>}
            </div>
          </div>

          {rating && (
            <>
              <div className="ach-line">
                сильнее ~{rating.pct}% людей · {rating.level >= 0 ? LEVEL_NAMES[rating.level] : 'ниже уровня «Начинающий»'}
              </div>
              <div className="bar">
                <i style={{ width: `${rating.pct}%` }} />
              </div>
              <div className="meta">
                по {byRecord ? 'рекорду на раз' : 'расчётному 1RM'}
                {rating.next ? ` · до уровня «${rating.next.name}»: ${fmtKg(rating.next.oneRM)} кг` : ''}
              </div>
            </>
          )}

          {openId === id ? (
            <RecordForm exId={id} bw={bw} recs={recs} onDone={() => setOpenId(null)} />
          ) : (
            <button className="note-open" onClick={() => setOpenId(id)}>
              {rec ? 'Внести новый рекорд' : 'Внести рекорд на раз'}
            </button>
          )}
        </section>
      ))}
      <p className="meta" style={{ marginTop: 20 }}>
        Пороги в standards.json приблизительные, их нужно сверить с strengthlevel.com.
      </p>
    </>
  )
}

function RecordForm({ exId, bw, recs, onDone }: { exId: string; bw: boolean; recs: Rec[]; onDone: () => void }) {
  const [v, setV] = useState('')
  const [d, setD] = useState(dateStr())
  const kg = parseFloat(v.replace(',', '.'))
  const ok = bw ? kg >= 0 : kg > 0
  return (
    <div className="notes">
      <p className="meta">{bw ? 'Доп. вес на один повтор (0 — только свой вес):' : 'Вес на один повтор, кг:'}</p>
      <div className="inline">
        <input className="comment" inputMode="decimal" placeholder={bw ? 'Доп. вес, кг' : 'Вес, кг'} value={v} onChange={(e) => setV(e.target.value)} />
        <input className="comment date" type="date" value={d} max={dateStr()} onChange={(e) => setD(e.target.value)} />
      </div>
      <div className="inline" style={{ marginTop: 8 }}>
        <button
          className="btn small"
          disabled={!ok}
          onClick={async () => {
            await db.records.add({ exId, date: d || dateStr(), kg })
            onDone()
          }}
        >
          Сохранить
        </button>
        <button className="note-open" onClick={onDone}>
          Отмена
        </button>
      </div>
      {recs.length > 0 && (
        <>
          <div className="sheet-label">Внесённые рекорды</div>
          {[...recs]
            .sort((a, b) => (a.date < b.date ? 1 : -1))
            .map((r) => (
              <div key={r.id} className="hist-ex rec-row">
                <span>
                  {fmtDate(r.date, true)} · {bw ? '+' : ''}
                  {fmtKg(r.kg)} кг
                </span>
                <button className="muted" onClick={() => confirm('Удалить запись?') && db.records.delete(r.id!)}>
                  Удалить
                </button>
              </div>
            ))}
        </>
      )}
    </div>
  )
}
