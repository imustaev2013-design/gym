import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

const t0 = Date.now()
let needRefresh = false
let update: ((reload?: boolean) => Promise<void>) | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/**
 * Новая версия: если нашлась в первые секунды после открытия — ставится тихо (приложение ещё не в работе),
 * иначе внизу появляется строка «Обновить», чтобы не перезагрузить страницу посреди тренировки.
 */
export function initPWA() {
  update = registerSW({
    onNeedRefresh() {
      if (Date.now() - t0 < 5000) update?.(true)
      else {
        needRefresh = true
        emit()
      }
    },
    onRegisteredSW(_url, reg) {
      // при возврате в приложение (из фона) проверяем, нет ли новой версии
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg?.update().catch(() => {})
      })
    },
  })
}

export const applyUpdate = () => update?.(true)

export function useNeedRefresh() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => needRefresh,
  )
}
