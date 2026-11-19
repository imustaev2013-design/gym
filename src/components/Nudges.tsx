import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { dateStr, hasDone } from '../logic'
import type { PageId } from './Page'
import type { Workout } from '../types'

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* ignore */
    }
  },
}

interface Nudge {
  key: string
  text: string
  page: PageId
  action: string
  /** на сколько дней откладывается по «Позже» */
  snooze: number
}

/** Ненавязчивые напоминания: бэкап (2 нед.), фото (3 нед.), рекорд на раз (месяц). Показывается не больше одного. */
export default function Nudges({ workouts, onNav }: { workouts: Workout[]; onNav: (p: PageId) => void }) {
  const records = useLiveQuery(() => db.records.toArray(), [])
  const photos = useLiveQuery(() => db.photos.toArray(), [])
  const lastBackup = useLiveQuery(async () => ((await db.settings.get('lastBackup'))?.value as string | undefined) ?? null, [])
  const [hidden, setHidden] = useState<string | null>(null)

  if (!records || !photos || lastBackup === undefined) return null
  const doneDates = workouts.filter(hasDone).map((w) => w.date).sort()
  if (!doneDates.length) return null
  const today = dateStr()
  const age = (dates: (string | undefined | null)[]) => daysBetween([...dates.filter(Boolean) as string[]].sort().at(-1) ?? doneDates[0], today)

  const list: Nudge[] = []
  if (age([lastBackup]) >= 14)
    list.push({ key: 'backup', text: 'Пора сделать бэкап данных.', page: 'backup', action: 'Сделать', snooze: 3 })
  if (age(photos.map((p) => p.date)) >= 21)
    list.push({ key: 'photo', text: 'Давно не было фото прогресса.', page: 'photos', action: 'Добавить', snooze: 3 })
  if (age(records.map((r) => r.date)) >= 30)
    list.push({ key: 'record', text: 'Прошёл месяц. Внеси свой рекорд на раз?', page: 'achievements', action: 'Внести', snooze: 7 })

  const n = list.find((x) => {
    const s = store.get('gym.nudge.' + x.key)
    return x.key !== hidden && !(s && daysBetween(s, today) < x.snooze)
  })
  if (!n) return null

  return (
    <div className="nudge">
      <span>{n.text}</span>
      <div className="nudge-actions">
        <button onClick={() => onNav(n.page)}>{n.action}</button>
        <button
          className="muted"
          onClick={() => {
            store.set('gym.nudge.' + n.key, today)
            setHidden(n.key)
          }}
        >
          Позже
        </button>
      </div>
    </div>
  )
}
