import planJson from '../plan.json'
import type { ExLog, Plan, PlanDay, PlanExercise, Workout } from './types'

export const plan = planJson as Plan

export const dayById = (id: string): PlanDay => plan.days.find((d) => d.id === id) ?? plan.days[0]

export function dateStr(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
export function yesterdayStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return dateStr(d)
}

export const hasDone = (w: Workout) => w.exercises.some((e) => e.sets.some((s) => s.done))

/** Последняя выполненная тренировка (с хотя бы одной галочкой) */
export function lastDone(workouts: Workout[]): Workout | undefined {
  return workouts
    .filter(hasDone)
    .sort((a, b) => (a.date === b.date ? (a.startedAt ?? 0) - (b.startedAt ?? 0) : a.date < b.date ? -1 : 1))
    .at(-1)
}

export interface Pick {
  dayId: string
  /** следующая по кругу тренировка (для кнопки «Всё равно тренироваться») */
  nextId: string
  rest: boolean
}

export function pickDay(workouts: Workout[], override?: string): Pick {
  const today = dateStr()
  const last = lastDone(workouts)
  const cycle = plan.cycle
  const nextId = last ? cycle[(cycle.indexOf(last.dayId) + 1) % cycle.length] : cycle[0]

  // Тренировка, начатая сегодня, остаётся открытой
  const active = workouts.find((w) => w.date === today && hasDone(w))
  if (override) return { dayId: override, nextId, rest: false }
  if (active) return { dayId: active.dayId, nextId, rest: false }

  const rest = !!last && plan.restAfter.includes(last.dayId) && last.date === yesterdayStr()
  return { dayId: nextId, nextId, rest }
}

const parseNum = (v: number | null | undefined) => (typeof v === 'number' && isFinite(v) ? v : null)

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Двойная прогрессия по статусу прошлой тренировки этого дня.
 * Без статуса — всё оставляем как было.
 */
export function nextTarget(ex: PlanExercise, prev?: ExLog): { weight: number | null; reps: number } {
  const [rmin, rmax] = ex.reps
  const bw = ex.type === 'bodyweight'
  const done = prev?.sets.filter((s) => s.done) ?? []
  if (!prev || !done.length) return { weight: bw ? 0 : null, reps: rmin }

  let weight = parseNum(done.at(-1)!.weight) ?? (bw ? 0 : null)
  const achieved = Math.min(...done.map((s) => s.reps ?? rmin))
  let reps = Math.min(Math.max(achieved, rmin), rmax)

  // шаг > ~10% рабочего веса — вместо +веса даём +повторы (для подтягиваний не применяется)
  const stepTooBig = !bw && weight != null && ex.step > weight * 0.1
  const addWeight = () => {
    if (weight == null) return
    if (stepTooBig) reps = reps + 1
    else {
      weight = round2(weight + ex.step)
      reps = rmin
    }
  }

  if (prev.status === 'easy') addWeight()
  else if (prev.status === 'normal') {
    // +1 повтор, а в широких диапазонах (≥4 повторов разницы) +2
    if (reps >= rmax) addWeight()
    else reps = Math.min(reps + (rmax - rmin >= 4 ? 2 : 1), rmax)
  } else if (prev.status === 'hard') {
    // тяжело: сначала убавляем повторы, на нижней границе — вес
    if (achieved > rmin) reps = Math.min(achieved, rmax) - 1
    else if (weight != null && weight > ex.step) {
      weight = round2(weight - ex.step)
      reps = rmin
    }
  }
  return { weight, reps }
}

/**
 * Последняя прошлая запись по упражнению, из которой берутся вес и повторы.
 * Переносится только между полностью одинаковыми упражнениями (тот же id, вариант и диапазон повторов):
 * тяжёлый и умеренный варианты не смешиваются.
 */
export function findPrev(ex: PlanExercise, workouts: Workout[]): ExLog | undefined {
  return workouts
    .filter((w) => w.date !== dateStr())
    .sort((a, b) => (a.date === b.date ? (a.startedAt ?? 0) - (b.startedAt ?? 0) : a.date < b.date ? -1 : 1))
    .filter((w) => {
      const o = dayById(w.dayId).exercises.find((e) => e.id === ex.id)
      return !!o && o.variant === ex.variant && o.reps[0] === ex.reps[0] && o.reps[1] === ex.reps[1]
    })
    .map((w) => w.exercises.find((e) => e.exId === ex.id))
    .filter((e): e is ExLog => !!e && !e.skipped && e.sets.some((s) => s.done))
    .at(-1)
}

/** Предзаполнение по прошлой тренировке с тем же упражнением */
export function buildDraft(dayId: string, workouts: Workout[]): Workout {
  const day = dayById(dayId)
  const exercises: ExLog[] = day.exercises.map((ex) => {
    const t = nextTarget(ex, findPrev(ex, workouts))
    return {
      exId: ex.id,
      skipped: false,
      sets: Array.from({ length: ex.sets }, () => ({ weight: t.weight, reps: t.reps, done: false })),
    }
  })
  return { date: dateStr(), dayId, exercises }
}

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10
  const m100 = n % 100
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many
}
export { plural }

/** «Прошлый раз было легко — сегодня +2,5 кг» */
export function progressHint(ex: PlanExercise, prev?: ExLog): string | null {
  const done = prev?.sets.filter((s) => s.done) ?? []
  if (!prev || !done.length || !prev.status) return null
  const bw = ex.type === 'bodyweight'
  const t = nextTarget(ex, prev)
  const w0 = parseNum(done.at(-1)!.weight) ?? (bw ? 0 : null)
  const r0 = Math.min(Math.max(Math.min(...done.map((s) => s.reps ?? ex.reps[0])), ex.reps[0]), ex.reps[1])
  const dw = t.weight != null && w0 != null ? round2(t.weight - w0) : 0
  const dr = t.reps - r0
  const how = { easy: 'легко', normal: 'нормально', hard: 'тяжело' }[prev.status]
  let change = 'то же самое'
  if (dw > 0) change = `+${fmt(dw)} кг`
  else if (dw < 0) change = `−${fmt(-dw)} кг`
  else if (dr > 0) change = `+${dr} ${plural(dr, 'повтор', 'повтора', 'повторов')}`
  else if (dr < 0) change = `−${-dr} ${plural(-dr, 'повтор', 'повтора', 'повторов')}`
  return `Прошлый раз было ${how} — сегодня ${change}`
}

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')

/** «60 × 6, 6, 5» — последний раз по упражнению (общая история между днями) */
export function lastTimeLine(ex: PlanExercise, workouts: Workout[], currentId?: number): string | null {
  const logs = workouts
    .filter((w) => w.id !== currentId && w.date !== dateStr())
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .flatMap((w) => w.exercises.filter((e) => e.exId === ex.id && !e.skipped && e.sets.some((s) => s.done)))
  const last = logs.at(-1)
  if (!last) return null
  const sets = last.sets.filter((s) => s.done)
  const ws = sets.map((s) => s.weight ?? 0)
  const prefix = ex.type === 'bodyweight' ? '+' : ''
  if (ws.every((w) => w === ws[0])) {
    if (ex.type === 'bodyweight' && ws[0] === 0) return sets.map((s) => s.reps ?? 0).join(', ')
    return `${prefix}${fmt(ws[0])} × ${sets.map((s) => s.reps ?? 0).join(', ')}`
  }
  return sets.map((s) => `${prefix}${fmt(s.weight ?? 0)}×${s.reps ?? 0}`).join(', ')
}

export const typeLabel: Record<string, string> = {
  barbell: 'штанга',
  dumbbell: 'гантели',
  block: 'блок',
  bodyweight: 'свой вес',
}

export function parseInput(s: string): number | null {
  const n = parseFloat(s.replace(',', '.'))
  return isFinite(n) && n >= 0 ? n : null
}
export { fmt as formatNum }

export function haptic() {
  try {
    navigator.vibrate?.(10)
  } catch {
    /* iOS Safari не поддерживает */
  }
}

export const TAGS = ['болит', 'не выспался', 'тренажёр занят', 'не хватило времени']

export function durationLabel(w: Workout): string | null {
  if (!w.startedAt || !w.finishedAt) return null
  const m = Math.round((w.finishedAt - w.startedAt) / 60000)
  return m < 1 ? '<1 мин' : `${m} мин`
}

export function shiftDate(ds: string, n: number): string {
  const [y, m, d] = ds.split('-').map(Number)
  return dateStr(new Date(y, m - 1, d + n))
}

/**
 * Пропущенные тренировки: день, на который по плану была тренировка, но ни одной галочки
 * и не нажато «Завершить». Плановые дни отдыха (после B1/B2) пропуском не считаются.
 * Пропущенная тренировка не теряется, а переносится на следующий день.
 */
export function missedDays(workouts: Workout[]): { date: string; dayId: string }[] {
  const done = workouts.filter((w) => hasDone(w) || w.finished)
  if (!done.length) return []
  const first = done.map((w) => w.date).sort()[0]
  const end = yesterdayStr()
  const out: { date: string; dayId: string }[] = []
  let last: Workout | undefined
  for (let ds = first; ds <= end; ds = shiftDate(ds, 1)) {
    const todays = done.filter((w) => w.date === ds)
    if (todays.length) {
      last = todays.sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0)).at(-1)
    } else if (last) {
      const rest = plan.restAfter.includes(last.dayId) && last.date === shiftDate(ds, -1)
      if (!rest) out.push({ date: ds, dayId: plan.cycle[(plan.cycle.indexOf(last.dayId) + 1) % plan.cycle.length] })
    }
  }
  return out
}

const mondayOf = (ds: string) => {
  const [y, m, d] = ds.split('-').map(Number)
  return shiftDate(ds, -((new Date(y, m - 1, d).getDay() + 6) % 7))
}

/** Недель подряд с хотя бы одной тренировкой (если на этой неделе ещё не было — считаем от прошлой) */
export function weekStreak(workouts: Workout[]): number {
  const weeks = new Set(workouts.filter(hasDone).map((w) => mondayOf(w.date)))
  let cur = mondayOf(dateStr())
  if (!weeks.has(cur)) cur = shiftDate(cur, -7)
  let n = 0
  while (weeks.has(cur)) {
    n++
    cur = shiftDate(cur, -7)
  }
  return n
}
