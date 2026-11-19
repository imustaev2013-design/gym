import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { rate, useProfile } from '../standards'
import Nudges from './Nudges'
import Notes from './Notes'
import type { PageId } from './Page'
import { bodyOn, exerciseHistory, fmtKg, setOneRM } from '../stats'
import {
  buildDraft,
  dateStr,
  dayById,
  durationLabel,
  findPrev,
  formatNum,
  haptic,
  lastTimeLine,
  missedDays,
  parseInput,
  plural,
  progressHint,
  yesterdayStr,
} from '../logic'
import type { ExLog, PlanExercise, SetLog, Workout } from '../types'

const STATUS_WORD = { easy: 'легко', normal: 'норм', hard: 'тяжело' } as const
const round2 = (n: number) => Math.round(n * 100) / 100

type Edit = { ex: number; set: number; field: 'w' | 'r' }

export default function Today({ dayId, workouts, onNav }: { dayId: string; workouts: Workout[]; onNav: (p: PageId) => void }) {
  const day = dayById(dayId)
  const stored = workouts.find((w) => w.date === dateStr() && w.dayId === dayId)
  const draft = useMemo(() => buildDraft(dayId, workouts), [dayId, workouts])
  const workout = stored ?? draft

  /** Любое изменение сразу пишется в IndexedDB */
  const update = (mutate: (w: Workout) => void) => {
    const next: Workout = structuredClone(workout)
    mutate(next)
    const times = next.exercises.flatMap((e) => e.sets.filter((s) => s.done && s.doneAt).map((s) => s.doneAt!))
    next.startedAt = times.length ? Math.min(...times) : undefined
    next.finishedAt = times.length ? Math.max(...times) : undefined
    db.workouts.put(next)
    return next
  }

  // --- новый личный рекорд 1RM: короткое уведомление на экране ---
  const body = useLiveQuery(() => db.bodyWeights.toArray(), []) ?? []
  const profile = useProfile()
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 7000)
    return () => clearTimeout(t)
  }, [toast])
  const best = useRef<Record<string, { rm: number; hist: boolean }>>({})

  const checkRecord = (ex: PlanExercise, set: SetLog) => {
    const bw = ex.type === 'bodyweight'
    const bodyKg = bodyOn(dateStr(), body)
    const base = bw ? bodyKg : 0
    if (base == null || !set.reps || (!bw && !set.weight)) return
    const rm = setOneRM(base + (set.weight ?? 0), set.reps)
    if (!rm) return
    if (!best.current[ex.id]) {
      const h = exerciseHistory(ex.id, workouts.filter((w) => w.date !== dateStr()), body)
        .map((p) => p.oneRM)
        .filter((x): x is number => x != null)
      best.current[ex.id] = { rm: h.length ? Math.max(...h) : 0, hist: h.length > 0 }
    }
    const b = best.current[ex.id]
    if (rm <= b.rm) return
    b.rm = rm
    if (!b.hist) return
    const r = profile && bodyKg ? rate(ex.id, profile, rm, bodyKg) : null
    setToast(
      r
        ? `${ex.name} ${fmtKg(rm)} кг — сильнее ~${r.pct}% людей в зале с твоим весом`
        : `Новый расчётный 1RM: ${ex.name} ${fmtKg(rm)} кг`,
    )
  }

  const updateEx = (i: number, fn: (e: ExLog) => void) => {
    const before = workout.exercises[i].sets.map((s) => s.done)
    const next = update((w) => fn(w.exercises[i]))
    next.exercises[i].sets.forEach((s, si) => {
      if (s.done && !before[si]) checkRecord(day.exercises[i], s)
    })
  }

  // --- какое упражнение раскрыто ---
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [edit, setEdit] = useState<Edit | null>(null)
  const resolved = (e: ExLog) => e.skipped || !!e.status
  const nextAfter = (i: number) => {
    const ex = workout.exercises
    for (let j = i + 1; j < ex.length; j++) if (!resolved(ex[j])) return j
    for (let j = 0; j < i; j++) if (!resolved(ex[j])) return j
    return -1
  }
  const auto = workout.exercises.findIndex((e) => !resolved(e))
  const current = openIdx ?? auto
  const advance = (i: number) => {
    setOpenIdx(nextAfter(i))
    setEdit(null)
  }

  if (workout.finished) {
    const sets = workout.exercises.flatMap((e) => e.sets.filter((s) => s.done)).length
    return (
      <div className="rest">
        <p className="rest-title">Тренировка завершена</p>
        <p className="muted">
          {day.id} · подходов: {sets}
          {durationLabel(workout) ? ` · ${durationLabel(workout)}` : ''}
        </p>
        <button className="btn" onClick={() => onNav('history')}>
          Открыть историю
        </button>
        <Nudges workouts={workouts} onNav={onNav} />
        <button className="m-link" onClick={() => update((w) => (w.finished = false))}>
          Вернуться к тренировке
        </button>
      </div>
    )
  }

  const anyDone = workout.exercises.some((e) => e.sets.some((s) => s.done))

  return (
    <>
      {missedDays(workouts).some((m) => m.date === yesterdayStr() && m.dayId === dayId) && (
        <p className="m-note">Вчера эта тренировка была пропущена, она перенесена на сегодня.</p>
      )}
      {toast && (
        <div className="toast" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}

      <div className="m-list">
        {day.exercises.map((ex, i) => {
          const log = workout.exercises[i]
          return i === current ? (
            <Current
              key={ex.id + i}
              ex={ex}
              log={log}
              idx={i}
              hint={progressHint(ex, findPrev(ex, workouts))}
              last={lastTimeLine(ex, workouts, stored?.id)}
              edit={edit?.ex === i ? edit : null}
              setEdit={setEdit}
              onChange={(fn) => updateEx(i, fn)}
              onResolved={() => advance(i)}
            />
          ) : (
            <Collapsed
              key={ex.id + i}
              ex={ex}
              log={log}
              onOpen={() => {
                setOpenIdx(i)
                setEdit(null)
              }}
            />
          )
        })}
      </div>

      <div className="m-foot">
        <Notes
          title="Тренировка"
          tags={workout.tags}
          comment={workout.comment}
          extra={durationLabel(workout) ? `Время: ${durationLabel(workout)}` : undefined}
          onTags={(t) => update((w) => (w.tags = t))}
          onComment={(c) => update((w) => (w.comment = c))}
          alwaysOpen
        />
        <Nudges workouts={workouts} onNav={onNav} />
        <button
          className="btn finish"
          onClick={() => {
            if (!anyDone) {
              alert('Нет отмеченных подходов. Поставь галочки у выполненных подходов.')
              return
            }
            haptic()
            update((w) => (w.finished = true))
          }}
        >
          Завершить тренировку
        </button>
      </div>
    </>
  )
}

/** «52,5 кг × 5» / «свой вес × 6» / «+5 кг × 6» */
function weightText(ex: PlanExercise, w: number | null): string {
  if (ex.type === 'bodyweight') return !w ? 'свой вес' : `+${formatNum(w)} кг`
  return w == null ? '— кг' : `${formatNum(w)} кг`
}

function Collapsed({ ex, log, onOpen }: { ex: PlanExercise; log: ExLog; onOpen: () => void }) {
  const first = log.sets[0]
  const n = log.sets.length
  return (
    <button className={'m-coll' + (log.skipped ? ' skipped' : '')} onClick={onOpen}>
      <span>
        <span className="t">{ex.name}</span>
        <span className="s">
          {log.skipped
            ? 'пропущено'
            : `${weightText(ex, first.weight)} × ${first.reps ?? '—'} · ${n} ${plural(n, 'подход', 'подхода', 'подходов')}${log.status ? ` · ${STATUS_WORD[log.status]}` : ''}`}
        </span>
      </span>
      {!log.skipped && (
        <span className="m-dots">
          {log.sets.map((s, i) => (
            <span key={i} className={'m-dot' + (s.done ? ' on' : '')} />
          ))}
        </span>
      )}
    </button>
  )
}

function Current({
  ex,
  log,
  idx,
  hint,
  last,
  edit,
  setEdit,
  onChange,
  onResolved,
}: {
  ex: PlanExercise
  log: ExLog
  idx: number
  hint: string | null
  last: string | null
  edit: Edit | null
  setEdit: (e: Edit | null) => void
  onChange: (fn: (e: ExLog) => void) => void
  onResolved: () => void
}) {
  const doneCount = log.sets.filter((s) => s.done).length
  const allDone = log.sets.length > 0 && doneCount === log.sets.length

  const setWeight = (si: number, v: number | null) =>
    onChange((e) => {
      // вес переносится на следующие незавершённые подходы
      const old = e.sets[si].weight
      e.sets[si].weight = v
      for (let k = si + 1; k < e.sets.length; k++) {
        const s = e.sets[k]
        if (!s.done && (s.weight == null || s.weight === old)) s.weight = v
      }
    })
  const setReps = (si: number, v: number | null) => onChange((e) => (e.sets[si].reps = v))

  const toggle = (si: number) => {
    const s = log.sets[si]
    if (!s.done && s.weight == null) {
      setEdit({ ex: idx, set: si, field: 'w' }) // вес ещё не введён — сначала вводим вес
      return
    }
    haptic()
    onChange((e) => {
      const x = e.sets[si]
      x.done = !x.done
      x.doneAt = x.done ? Date.now() : undefined
    })
    setEdit(null)
  }

  if (log.skipped) {
    return (
      <div className="m-cur">
        <div className="m-head">
          <span className="m-name skipped">{ex.name}</span>
          <span className="m-count">пропущено</span>
        </div>
        <div className="m-add">
          <button onClick={() => onChange((e) => (e.skipped = false))}>Вернуть упражнение</button>
        </div>
      </div>
    )
  }

  return (
    <div className="m-cur">
      <div className="m-head">
        <span className="m-name">
          {ex.name}
          {ex.variant && <span className="m-variant"> ({ex.variant})</span>}
        </span>
        <span className="m-count">
          {doneCount} / {log.sets.length}
          {ex.perLeg ? ' · на ногу' : ''}
        </span>
      </div>
      {(hint ?? (last ? `В прошлый раз: ${last}` : null)) && <div className="m-hint">{hint ?? `В прошлый раз: ${last}`}</div>}

      <div className="m-sets">
        {log.sets.map((s, si) => {
          const editing = edit?.set === si
          const openEdit = (field: 'w' | 'r') => setEdit({ ex: idx, set: si, field })
          const bw = ex.type === 'bodyweight'
          return (
            <div key={si} className={editing ? 'm-edit' : undefined}>
              <div className={'m-set' + (s.done ? ' done' : '')}>
                <span className="m-idx">{si + 1}</span>
                {editing ? (
                  <span className="m-label">Меняю подход</span>
                ) : (
                  <span className="m-val">
                    <button onClick={() => openEdit('w')}>
                      <span className={s.done ? '' : 'tap'}>
                        {bw ? (s.weight ? `+${formatNum(s.weight)}` : 'свой вес') : s.weight == null ? '—' : formatNum(s.weight)}
                      </span>
                    </button>
                    {(!bw || !!s.weight) && <small> кг</small>} ×{' '}
                    <button onClick={() => openEdit('r')}>
                      <span className={s.done ? '' : 'tap'}>{s.reps ?? '—'}</span>
                    </button>
                  </span>
                )}
                <button className={'m-check' + (s.done ? ' on' : '')} onClick={() => toggle(si)} aria-label={`Подход ${si + 1} выполнен`} aria-pressed={s.done}>
                  {s.done && (
                    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M4 10.5 8.2 14.5 16 6" stroke="var(--bg)" strokeWidth="2.2" fill="none" />
                    </svg>
                  )}
                </button>
              </div>

              {editing && (
                <div className="m-steps">
                  <Stepper
                    active={edit!.field === 'w'}
                    value={s.weight}
                    unit={bw ? 'доп. кг' : 'кг'}
                    step={ex.step}
                    decimal
                    onActivate={() => openEdit('w')}
                    onChange={(v) => setWeight(si, v)}
                    label="вес"
                  />
                  <Stepper
                    active={edit!.field === 'r'}
                    value={s.reps}
                    unit="повт."
                    step={1}
                    onActivate={() => openEdit('r')}
                    onChange={(v) => setReps(si, v)}
                    label="повторы"
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="m-add">
        <button
          onClick={() =>
            onChange((e) => {
              const p = e.sets.at(-1)
              e.sets.push({ weight: p?.weight ?? null, reps: p?.reps ?? ex.reps[0], done: false })
            })
          }
        >
          + подход
        </button>
        <button
          className="gray"
          disabled={log.sets.length < 2 || log.sets.at(-1)!.done}
          onClick={() => {
            setEdit(null)
            onChange((e) => {
              if (e.sets.length > 1 && !e.sets.at(-1)!.done) e.sets.pop()
            })
          }}
        >
          − подход
        </button>
        <button
          className="gray right"
          onClick={() => {
            onChange((e) => (e.skipped = true))
            onResolved()
          }}
        >
          Пропустить
        </button>
      </div>

      {allDone && (
        <>
          <div className="status">
            {(
              [
                ['easy', 'Легко'],
                ['normal', 'Норм'],
                ['hard', 'Тяжело'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                className={log.status === k ? 'on' : ''}
                onClick={() => {
                  const selecting = log.status !== k
                  onChange((e) => (e.status = selecting ? k : undefined))
                  if (selecting) onResolved()
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <Notes
            title="Заметка"
            tags={log.tags}
            comment={log.comment}
            onTags={(t) => onChange((e) => (e.tags = t))}
            onComment={(c) => onChange((e) => (e.comment = c))}
          />
        </>
      )}
    </div>
  )
}

function Stepper({
  value,
  unit,
  step,
  decimal,
  active,
  label,
  onActivate,
  onChange,
}: {
  value: number | null
  unit: string
  step: number
  decimal?: boolean
  active: boolean
  label: string
  onActivate: () => void
  onChange: (v: number | null) => void
}) {
  const [typing, setTyping] = useState(false)
  const change = (d: number) => {
    onActivate()
    onChange(Math.max(0, round2((value ?? 0) + d)))
  }
  return (
    <div className={'m-step' + (active ? ' active' : '')}>
      <button aria-label={`Минус ${label}`} onClick={() => change(-step)}>
        −
      </button>
      {typing ? (
        <input
          autoFocus
          inputMode={decimal ? 'decimal' : 'numeric'}
          defaultValue={value == null ? '' : formatNum(value)}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => {
            const v = e.target.value.trim() === '' ? null : parseInput(e.target.value)
            if (v !== value) onChange(v)
            setTyping(false)
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      ) : (
        <button
          className="v"
          onClick={() => {
            onActivate()
            setTyping(true)
          }}
        >
          {value == null ? '—' : formatNum(value)} <small>{unit}</small>
        </button>
      )}
      <button aria-label={`Плюс ${label}`} onClick={() => change(step)}>
        +
      </button>
    </div>
  )
}
