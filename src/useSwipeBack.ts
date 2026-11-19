import { useEffect, useRef, type RefObject } from 'react'

const EDGE = 30 // жест начинается только у левого края, px
const PARALLAX = 0.3 // предыдущий экран сдвинут влево на 30%
const DURATION = 260 // мс

/**
 * Возврат назад свайпом слева направо, как в iOS.
 * Экран едет за пальцем, предыдущий (предыдущий соседний слой) выглядывает слева и чуть затемнён.
 * Подходит любому полноэкранному слою; предыдущим считается previousElementSibling.
 */
export function useSwipeBack(ref: RefObject<HTMLElement | null>, onBack: () => void) {
  const cb = useRef(onBack)
  cb.current = onBack

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let st: { x: number; y: number; locked: boolean; samples: { x: number; t: number }[] } | null = null
    let busy = false
    const prev = () => el.previousElementSibling as HTMLElement | null
    const width = () => el.getBoundingClientRect().width || window.innerWidth

    const pos = (dx: number, animate: boolean) => {
      const w = width()
      const p = Math.min(1, Math.max(0, dx / w))
      const ease = animate ? `transform ${DURATION}ms cubic-bezier(0.2, 0.8, 0.2, 1), filter ${DURATION}ms ease` : 'none'
      el.style.transition = ease
      el.style.transform = `translate3d(${dx}px,0,0)`
      const pv = prev()
      if (pv) {
        pv.style.transition = ease
        pv.style.transform = `translate3d(${-PARALLAX * w * (1 - p)}px,0,0)`
        pv.style.filter = `brightness(${0.85 + 0.15 * p})`
      }
    }
    const reset = () => {
      el.style.transition = ''
      el.style.transform = ''
      el.classList.remove('dragging')
      const pv = prev()
      if (pv) {
        pv.style.transition = ''
        pv.style.transform = ''
        pv.style.filter = ''
      }
    }

    const start = (e: TouchEvent) => {
      if (busy || e.touches.length !== 1) return
      const t = e.touches[0]
      if (t.clientX - el.getBoundingClientRect().left > EDGE) return
      st = { x: t.clientX, y: t.clientY, locked: false, samples: [{ x: t.clientX, t: performance.now() }] }
    }

    const move = (e: TouchEvent) => {
      if (!st) return
      const t = e.touches[0]
      const dx = t.clientX - st.x
      const dy = t.clientY - st.y
      if (!st.locked) {
        // больше вертикальное, чем горизонтальное — отдаём жест обычной прокрутке
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          st = null
          return
        }
        if (dx > 8 && dx > Math.abs(dy)) {
          st.locked = true
          el.classList.add('dragging')
        } else return
      }
      e.preventDefault()
      st.samples.push({ x: t.clientX, t: performance.now() })
      if (st.samples.length > 6) st.samples.shift()
      pos(Math.max(0, dx), false)
    }

    const end = (e: TouchEvent) => {
      if (!st) return
      const s = st
      st = null
      if (!s.locked) return
      const t = e.changedTouches[0]
      const dx = Math.max(0, t.clientX - s.x)
      const first = s.samples[0]
      const last = s.samples[s.samples.length - 1]
      const v = last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0 // px/мс
      const w = width()
      const commit = e.type !== 'touchcancel' && (dx > w / 3 || (v > 0.5 && dx > 30))
      busy = true
      if (commit) {
        pos(w, true)
        setTimeout(() => {
          busy = false
          reset()
          cb.current()
        }, DURATION)
      } else {
        pos(0, true)
        setTimeout(() => {
          busy = false
          reset()
        }, DURATION)
      }
    }

    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
      reset()
    }
  }, [ref])
}
