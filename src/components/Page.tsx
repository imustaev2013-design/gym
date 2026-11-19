import { useRef, type ReactNode } from 'react'
import { useSwipeBack } from '../useSwipeBack'

export type PageId = 'history' | 'progress' | 'achievements' | 'settings' | 'weight' | 'photos' | 'backup'

/** Полноэкранный слой поверх предыдущего. Назад — кнопкой или свайпом от левого края. */
export default function Page({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useSwipeBack(ref, onBack)
  return (
    <div className="page" ref={ref}>
      <header className="page-top">
        <button className="back" onClick={onBack}>
          ‹ Назад
        </button>
        <span className="page-title">{title}</span>
        <span className="back" />
      </header>
      <div className="page-body">{children}</div>
    </div>
  )
}
