import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { rate, useProfile } from '../standards'
import Nudges from './Nudges'
import type { PageId } from './Page'
import { bodyOn, exerciseHistory, fmtKg, setOneRM } from '../stats'
import { TAGS, buildDraft, dateStr, missedDays, yesterdayStr, dayById, durationLabel, haptic, lastTimeLine, parseInput, formatNum, typeLabel } from '../logic'
import type { ExLog, PlanExercise, SetLog, Workout } from '../types'

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

  if (workout.finished) {
    const sets = workout.exercises.flatMap((e) => e.sets.filter((s) => s.done)).length
    return (
      <main className="rest">
        <p className="rest-title">Тренировка завершена</p>
        <p className="muted">
          {day.id} · подходов: {sets}
          {durationLabel(workout) ? ` · ${durationLabel(workout)}` : ''}
        </p>
        <button className="btn" onClick={() => onNav('history')}>
          Открыть историю
        </button>
        <Nudges workouts={workouts} onNav={onNav} />
        <button className="note-open" onClick={() => update((w) => (w.finished = false))}>
          Вернуться к тренировке
        </button>
      </main>
    )
  }

  const anyDone = workout.exercises.some((e) => e.sets.some((s) => s.done))

  return (
    <main className="list">
      {missedDays(workouts).some((m) => m.date === yesterdayStr() && m.dayId === dayId) && (
        <p className="meta carried">Вчера эта тренировка была пропущена, она перенесена на сегодня.</p>
      )}
      {toast && (
        <div className="toast" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
      {day.exercises.map((ex, i) => (
        <Exercise
          key={ex.id}
          ex={ex}
          log={workout.exercises[i]}
          last={lastTimeLine(ex, workouts, stored?.id)}
          onChange={(fn) => updateEx(i, fn)}
        />
      ))}
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
    </main>
  )
}

function Exercise({
  ex,
  log,
  last,
  onChange,
}: {
  ex: PlanExercise
  log: ExLog
  last: string | null
  onChange: (fn: (e: ExLog) => void) => void
}) {
  const unit = ex.type === 'bodyweight' ? 'доп. кг' : 'кг'
  const meta = [typeLabel[ex.type], ex.perLeg ? 'на ногу' : null, `${ex.sets} × ${ex.reps[0]}–${ex.reps[1]}`]
    .filter(Boolean)
    .join(' · ')

  return (
    <section className={'ex' + (log.skipped ? ' skipped' : '')}>
      <div className="ex-head">
        <div>
          <h2>
            {ex.name}
            {ex.variant && <span className="variant"> ({ex.variant})</span>}
          </h2>
          <p className="meta">{meta}</p>
          {last && <p className="meta">В прошлый раз: {last}</p>}
        </div>
        <button className="skip" onClick={() => onChange((e) => (e.skipped = !e.skipped))}>
          {log.skipped ? 'Вернуть' : 'Пропустить'}
        </button>
      </div>

      {!log.skipped && (
        <div className="sets">
          {log.sets.map((s, si) => (
            <SetRow
              key={si}
              n={si + 1}
              unit={unit}
              set={s}
              onChange={(fn) => onChange((e) => fn(e.sets[si]))}
              onWeight={(v) =>
                onChange((e) => {
                  // вес переносится на следующие незавершённые подходы
                  const old = e.sets[si].weight
                  e.sets[si].weight = v
                  for (let k = si + 1; k < e.sets.length; k++) {
                    const s = e.sets[k]
                    if (!s.done && (s.weight == null || s.weight === old)) s.weight = v
                  }
                })
              }
            />
          ))}
        </div>
      )}

      {!log.skipped && (
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
              onClick={() => onChange((e) => (e.status = e.status === k ? undefined : k))}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <Notes
        title="Заметка"
        tags={log.tags}
        comment={log.comment}
        onTags={(t) => onChange((e) => (e.tags = t))}
        onComment={(c) => onChange((e) => (e.comment = c))}
      />
    </section>
  )
}

function Notes({
  title,
  tags,
  comment,
  extra,
  alwaysOpen,
  onTags,
  onComment,
}: {
  title: string
  tags?: string[]
  comment?: string
  extra?: string
  alwaysOpen?: boolean
  onTags: (t: string[]) => void
  onComment: (c: string) => void
}) {
  const filled = !!(tags?.length || comment)
  const [open, setOpen] = useState(!!alwaysOpen || filled)
  if (!open)
    return (
      <button className="note-open" onClick={() => setOpen(true)}>
        + {title.toLowerCase()}
      </button>
    )
  return (
    <div className={'notes' + (alwaysOpen ? ' wk' : '')}>
      {alwaysOpen && <div className="notes-title">{title}</div>}
      {extra && <div className="meta">{extra}</div>}
      <div className="chips">
        {TAGS.map((t) => {
          const on = !!tags?.includes(t)
          return (
            <button key={t} className={on ? 'on' : ''} onClick={() => onTags(on ? tags!.filter((x) => x !== t) : [...(tags ?? []), t])}>
              {t}
            </button>
          )
        })}
      </div>
      <input
        className="comment"
        placeholder="Комментарий"
        defaultValue={comment ?? ''}
        onBlur={(e) => e.target.value !== (comment ?? '') && onComment(e.target.value)}
      />
    </div>
  )
}

function SetRow({
  n,
  unit,
  set,
  onChange,
  onWeight,
}: {
  n: number
  unit: string
  set: SetLog
  onChange: (fn: (s: SetLog) => void) => void
  onWeight: (v: number | null) => void
}) {
  const weightRef = useRef<HTMLInputElement>(null)
  const toggle = () => {
    if (!set.done && set.weight == null) {
      // вес ещё не введён — сначала вводим вес
      weightRef.current?.focus()
      return
    }
    haptic()
    onChange((s) => {
      s.done = !s.done
      s.doneAt = s.done ? Date.now() : undefined
    })
  }

  return (
    <div className={'set' + (set.done ? ' done' : '')}>
      <span className="n">{n}</span>
      <label className="field">
        <input
          ref={weightRef}
          inputMode="decimal"
          placeholder="—"
          key={'w' + set.weight}
          defaultValue={set.weight == null ? '' : formatNum(set.weight)}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => {
            const v = e.target.value.trim() === '' ? null : parseInput(e.target.value)
            if (v !== set.weight) onWeight(v)
          }}
        />
        <small>{unit}</small>
      </label>
      <span className="x">×</span>
      <label className="field">
        <input
          inputMode="numeric"
          placeholder="—"
          key={'r' + set.reps}
          defaultValue={set.reps ?? ''}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => {
            const v = e.target.value.trim() === '' ? null : parseInput(e.target.value)
            if (v !== set.reps) onChange((s) => (s.reps = v))
          }}
        />
        <small>повт.</small>
      </label>
      <button className="check" onClick={toggle} aria-label="Выполнено" aria-pressed={set.done}>
        {set.done ? '✓' : ''}
      </button>
    </div>
  )
}
