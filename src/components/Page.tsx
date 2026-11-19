import type { ReactNode } from 'react'

export type PageId = 'history' | 'progress' | 'achievements' | 'settings' | 'weight' | 'photos' | 'backup'

/** Полноэкранный раздел поверх основного экрана */
export default function Page({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className="page">
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
