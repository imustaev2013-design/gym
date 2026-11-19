import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { dateStr, dayById, pickDay, plan } from './logic'
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

const OVERRIDE_KEY = 'gym.override'

function readOverride(): string | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(OVERRIDE_KEY) ?? 'null')
    return v?.date === dateStr() ? v.dayId : undefined
  } catch {
    return undefined
  }
}

export default function App() {
  const workouts = useLiveQuery(() => db.workouts.toArray(), [])
  const needRefresh = useNeedRefresh()
  const [override, setOverrideState] = useState<string | undefined>(readOverride)
  const [sheet, setSheet] = useState<'day' | 'menu' | null>(null)
  const [page, setPage] = useState<PageId | null>(null)
  const [progressEx, setProgressEx] = useState<string | null>(null)
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

  return (
    <div className="app">
      <header className="top">
        <button className="day-switch" onClick={() => setSheet('day')} aria-label="Сменить тренировку">
          <span className="day-id">{day.id} ▾</span>
          <span className="day-title">
            {new Date().toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })} · {day.title}
          </span>
        </button>
        <button className="menu-btn" onClick={() => setSheet('menu')} aria-label="Меню">
          <span />
          <span />
          <span />
        </button>
      </header>

      {needRefresh && (
        <button className="update-bar" onClick={() => applyUpdate()}>
          Доступна новая версия · Обновить
        </button>
      )}

      {pick.rest ? (
        <div className="rest">
          <p className="rest-title">По плану сегодня отдых</p>
          <p className="muted">Восстановление, прогулки, обычная активность.</p>
          <button className="btn" onClick={() => setOverride(pick.nextId)}>
            Всё равно тренироваться
          </button>
        </div>
      ) : (
        <Today key={day.id + dateStr()} dayId={day.id} workouts={workouts} onNav={(p) => { setProgressEx(null); setPage(p) }} />
      )}

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
          {(
            [
              ['История', 'history'],
              ['Прогресс', 'progress'],
              ['Достижения', 'achievements'],
              ['Вес тела', 'weight'],
              ['Фото', 'photos'],
              ['Бэкап', 'backup'],
              ['Настройки', 'settings'],
            ] as const
          ).map(([label, key]) => (
            <button
              key={key}
              className="row-btn"
              onClick={() => {
                setSheet(null)
                setProgressEx(null)
                setPage(key)
              }}
            >
              <span>{label}</span>
              <span className="muted chev">›</span>
            </button>
          ))}
        </Sheet>
      )}
      {page === 'history' && (
        <Page title="История" onBack={() => setPage(null)}>
          <History workouts={workouts} />
        </Page>
      )}
      {page === 'weight' && (
        <Page title="Вес тела" onBack={() => setPage(null)}>
          <BodyWeight />
        </Page>
      )}
      {page === 'photos' && (
        <Page title="Фото" onBack={() => setPage(null)}>
          <Photos />
        </Page>
      )}
      {page === 'backup' && (
        <Page title="Бэкап" onBack={() => setPage(null)}>
          <Backup />
        </Page>
      )}
      {page === 'achievements' && (
        <Page title="Достижения" onBack={() => setPage(null)}>
          <Achievements workouts={workouts} onSettings={() => setPage('settings')} />
        </Page>
      )}
      {page === 'settings' && (
        <Page title="Настройки" onBack={() => setPage(null)}>
          <Settings theme={theme} size={size} onTheme={changeTheme} onSize={changeSize} />
        </Page>
      )}
      {page === 'progress' && (
        <Page title="Прогресс" onBack={() => (progressEx ? setProgressEx(null) : setPage(null))}>
          <Progress workouts={workouts} exId={progressEx} onOpen={setProgressEx} />
        </Page>
      )}
    </div>
  )
}
