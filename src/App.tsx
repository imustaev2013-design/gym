import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { dateStr, dayById, pickDay, plan, plural, weekStreak } from './logic'
import { recordsLast30 } from './stats'
import Today from './components/Today'
import Sheet from './components/Sheet'
import Page, { type PageId } from './components/Page'
import BodyWeight from './components/BodyWeight'
import Photos from './components/Photos'
import Backup from './components/Backup'
import { applyUpdate, useNeedRefresh } from './pwa'
import History from './components/History'
import Progress from './components/Progress'
import Achievements from './components/Achievements'
import Settings, { type Size, type Theme } from './components/Settings'
import type { Workout } from './types'

const OVERRIDE_KEY = 'gym.override'

function readOverride(): string | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(OVERRIDE_KEY) ?? 'null')
    return v?.date === dateStr() ? v.dayId : undefined
  } catch {
    return undefined
  }
}

/** Один слой навигации: раздел (и, для «Прогресса», выбранное упражнение) */
type Screen = { page: PageId; ex?: string }

const TITLES: Record<PageId, string> = {
  history: 'История',
  progress: 'Прогресс',
  achievements: 'Достижения',
  weight: 'Вес тела',
  photos: 'Фото',
  backup: 'Бэкап',
  settings: 'Настройки',
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export default function App() {
  const workouts = useLiveQuery(() => db.workouts.toArray(), [])
  const needRefresh = useNeedRefresh()
  const [override, setOverrideState] = useState<string | undefined>(readOverride)
  const [sheet, setSheet] = useState<'day' | 'menu' | null>(null)
  const [stack, setStack] = useState<Screen[]>([])
  const push = (s: Screen) => setStack((st) => [...st, s])
  const pop = () => setStack((st) => st.slice(0, -1))
  const [size, setSize] = useState<Size>(() => {
    const v = localStorage.getItem('gym.size')
    return v === 's' || v === 'l' ? v : 'm'
  })
  const [theme, setTheme] = useState<Theme>(() => {
    const v = localStorage.getItem('gym.theme')
    return v === 'light' || v === 'dark' ? v : 'auto'
  })
  useEffect(() => {
    document.documentElement.dataset.size = size
  }, [size])
  useEffect(() => {
    if (theme === 'auto') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
  }, [theme])
  const store = (k: string, v: string) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* ignore */
    }
  }
  const changeSize = (k: Size) => {
    setSize(k)
    store('gym.size', k)
  }
  const changeTheme = (t: Theme) => {
    setTheme(t)
    store('gym.theme', t)
  }

  // раз в полминуты обновляем «идёт N мин»
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [])

  if (!workouts) return <div className="app" />

  const setOverride = (dayId: string) => {
    try {
      localStorage.setItem(OVERRIDE_KEY, JSON.stringify({ date: dateStr(), dayId }))
    } catch {
      /* ignore */
    }
    setOverrideState(dayId)
    setSheet(null)
  }

  const pick = pickDay(workouts, override)
  const day = dayById(pick.dayId)
  const current = workouts.find((w) => w.date === dateStr() && w.dayId === day.id)
  const minutes = current?.startedAt && !current.finished ? Math.max(1, Math.round((Date.now() - current.startedAt) / 60000)) : null
  const nav = (p: PageId) => push({ page: p })

  const renderScreen = (s: Screen) => {
    switch (s.page) {
      case 'history':
        return <History workouts={workouts} />
      case 'progress':
        return <Progress workouts={workouts} exId={s.ex ?? null} onOpen={(id) => push({ page: 'progress', ex: id ?? undefined })} />
      case 'achievements':
        return <Achievements workouts={workouts} onSettings={() => push({ page: 'settings' })} />
      case 'weight':
        return <BodyWeight />
      case 'photos':
        return <Photos />
      case 'backup':
        return <Backup />
      case 'settings':
        return <Settings theme={theme} size={size} onTheme={changeTheme} onSize={changeSize} />
    }
  }

  return (
    <>
      {/* главный экран: слой, на который ложатся остальные */}
      <div className="app">
        {needRefresh && (
          <button className="update-bar" onClick={() => applyUpdate()}>
            Доступна новая версия · Обновить
          </button>
        )}
        <div className="m-scroll">
          <div className="m-zoom">
            <div className="m-top">
              <span className="m-date">
                {cap(new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }))}
                {minutes ? ` · идёт ${minutes} мин` : ''}
              </span>
              <button className="m-menu" onClick={() => setSheet('menu')} aria-label="Меню">
                <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true">
                  <path d="M0 1h22M0 13h22" stroke="var(--fg)" strokeWidth="1.8" />
                </svg>
              </button>
            </div>
            <button className="m-title" onClick={() => setSheet('day')} aria-label="Сменить тренировку">
              {day.id} · {day.short ?? day.title} ▾
            </button>

            <Stats workouts={workouts} />

            {pick.rest ? (
              <div className="rest">
                <p className="rest-title">По плану сегодня отдых</p>
                <p className="muted">Восстановление, прогулки, обычная активность.</p>
                <button className="btn" onClick={() => setOverride(pick.nextId)}>
                  Всё равно тренироваться
                </button>
              </div>
            ) : (
              <Today key={day.id + dateStr()} dayId={day.id} workouts={workouts} onNav={nav} />
            )}
          </div>
        </div>

        {sheet === 'day' && (
          <Sheet title="Тренировка" onClose={() => setSheet(null)}>
            {plan.days.map((d) => (
              <button key={d.id} className={'row-btn' + (d.id === day.id ? ' on' : '')} onClick={() => setOverride(d.id)}>
                <b>{d.id}</b>
                <span>{d.title}</span>
              </button>
            ))}
          </Sheet>
        )}
        {sheet === 'menu' && (
          <Sheet title="Разделы" onClose={() => setSheet(null)}>
            {(['history', 'progress', 'achievements', 'weight', 'photos', 'backup', 'settings'] as const).map((key) => (
              <button
                key={key}
                className="row-btn"
                onClick={() => {
                  setSheet(null)
                  nav(key)
                }}
              >
                <span>{TITLES[key]}</span>
                <span className="muted chev">›</span>
              </button>
            ))}
          </Sheet>
        )}
      </div>

      {/* стек разделов: каждый — свой слой, предыдущий остаётся под ним (для свайпа назад) */}
      {stack.map((s, i) => (
        <Page key={i} title={TITLES[s.page]} onBack={pop}>
          {renderScreen(s)}
        </Page>
      ))}
    </>
  )
}

function Stats({ workouts }: { workouts: Workout[] }) {
  const records = useLiveQuery(() => db.records.toArray(), []) ?? []
  const body = useLiveQuery(() => db.bodyWeights.toArray(), []) ?? []
  const weeks = weekStreak(workouts)
  const total = workouts.filter((w) => w.exercises.some((e) => e.sets.some((s) => s.done))).length
  const recs = recordsLast30(workouts, records, body)
  const cells: [number, string][] = [
    [weeks, plural(weeks, 'неделя подряд', 'недели подряд', 'недель подряд')],
    [total, plural(total, 'тренировка', 'тренировки', 'тренировок')],
    [recs, plural(recs, 'рекорд', 'рекорда', 'рекордов') + ' за месяц'],
  ]
  return (
    <div className="m-stats">
      {cells.map(([n, label], i) => (
        <div key={i}>
          <div className="m-n">{n}</div>
          <div className="m-l">{label}</div>
        </div>
      ))}
    </div>
  )
}
