import type { ReactNode } from 'react'

// 编辑器 section 内部的子面板：在 EditorSectionCard（整段卡片）内再分组，
// 比如炉温程序里的「炉子信息 / 温区 / 前驱体放置」。轻量边框 + 标题栏。
export function SubPanel({
  action,
  children,
  title,
}: {
  action?: ReactNode
  children: ReactNode
  title: string
}) {
  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}
