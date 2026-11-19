import { useState } from 'react'
import { db } from '../db'
import { dateStr, dayById, durationLabel, hasDone, missedDays } from '../logic'
import { exById, fmtDate, setsLine } from '../stats'
import type { Workout } from '../types'

const STATUS = { easy: 'легко', normal: 'норм', hard: 'тяжело' } as const

export default function History({ workouts }: { workouts: Workout[] }) {
  const done = workouts
    .filter((w) => hasDone(w))
    .sort((a, b) => (a.date === b.date ? (b.startedAt ?? 0) - (a.startedAt ?? 0) : a.date < b.date ? 1 : -1))
  const missed = missedDays(workouts)
  const [selected, setSelected] = useState<string | null>(null)

  type Entry = { kind: 'w'; date: string; w: Workout } | { kind: 'm'; date: string; dayId: string }
  const entries: Entry[] = [
    ...done.map((w): Entry => ({ kind: 'w', date: w.date, w })),
    ...missed.map((m): Entry => ({ kind: 'm', ...m })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const list = selected ? entries.filter((e) => e.date === selected) : entries

  return (
    <>
      <Calendar
        dates={new Set(done.map((w) => w.date))}
        missed={new Set(missed.map((m) => m.date))}
        selected={selected}
        onSelect={setSelected}
      />
      {selected && (
        <button className="note-open" onClick={() => setSelected(null)}>
          Показать все тренировки
        </button>
      )}
      {!list.length && <p className="muted">Пока нет выполненных тренировок.</p>}
      {list.map((e) =>
        e.kind === 'w' ? (
          <Item key={e.w.id} w={e.w} />
        ) : (
          <section key={'m' + e.date} className="hist">
            <div className="hist-head">
              <b className="muted">
                {fmtDate(e.date, true)} · {e.dayId}
              </b>
              <span className="muted">пропуск</span>
            </div>
            <div className="meta">Не выполнена, перенесена на следующий день.</div>
          </section>
        ),
      )}
    </>
  )
}

function Item({ w }: { w: Workout }) {
  const day = dayById(w.dayId)
  const dur = durationLabel(w)
  return (
    <section className="hist">
      <div className="hist-head">
        <b>
          {fmtDate(w.date, true)} · {day.id}
        </b>
        {dur && <span className="muted">{dur}</span>}
      </div>
      {w.exercises.map((e, i) => {
        const ex = exById(e.exId)
        const name = ex ? ex.name + (day.exercises[i]?.variant ? ` (${day.exercises[i].variant})` : '') : e.exId
        if (e.skipped) {
          return (
            <div key={i} className="hist-ex muted">
              {name} — пропущено{e.tags?.length ? ` · ${e.tags.join(', ')}` : ''}
              {e.comment ? ` · ${e.comment}` : ''}
            </div>
          )
        }
        const line = setsLine(ex, e)
        if (!line) return null
        return (
          <div key={i} className="hist-ex">
            <span>{name}</span>
            <span className="muted">
              {line}
              {e.status ? ` · ${STATUS[e.status]}` : ''}
              {e.tags?.length ? ` · ${e.tags.join(', ')}` : ''}
              {e.comment ? ` · ${e.comment}` : ''}
            </span>
          </div>
        )
      })}
      {(w.tags?.length || w.comment) && (
        <div className="hist-ex muted">
          {[...(w.tags ?? []), w.comment].filter(Boolean).join(' · ')}
        </div>
      )}
      <button
        className="note-open"
        onClick={() => {
          if (confirm('Удалить эту тренировку? Это нельзя отменить.')) db.workouts.delete(w.id!)
        }}
      >
        Удалить
      </button>
    </section>
  )
}

function Calendar({ dates, missed, selected, onSelect }: { dates: Set<string>; missed: Set<string>; selected: string | null; onSelect: (d: string | null) => void }) {
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const first = (month.getDay() + 6) % 7 // Пн = 0
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)]
  const today = dateStr()
  const ds = (d: number) => dateStr(new Date(month.getFullYear(), month.getMonth(), d))
  const title = month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })

  return (
    <div className="cal">
      <div className="cal-head">
        <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Предыдущий месяц">
          ‹
        </button>
        <span>{title}</span>
        <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Следующий месяц">
          ›
        </button>
      </div>
      <div className="cal-grid">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
          <span key={d} className="cal-dow">
            {d}
          </span>
        ))}
        {cells.map((d, i) =>
          d == null ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              disabled={!dates.has(ds(d)) && !missed.has(ds(d))}
              className={'cal-day' + (dates.has(ds(d)) ? ' on' : '') + (missed.has(ds(d)) ? ' miss' : '') + (ds(d) === today ? ' today' : '') + (selected === ds(d) ? ' sel' : '')}
              onClick={() => onSelect(selected === ds(d) ? null : ds(d))}
            >
              {d}
            </button>
          ),
        )}
      </div>
    </div>
  )
}
