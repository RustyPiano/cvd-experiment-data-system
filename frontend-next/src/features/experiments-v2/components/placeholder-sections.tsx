// §5–§8 占位区块（过程步 / 过程事件 / 表征·实测产物 / PVD）。本步只放骨架占位，
// 由下一步实现。§8 PVD 的显隐将由 §1 合成方法判别器驱动（本步先存合成方法值）。
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

const PLACEHOLDERS = [
  { index: '§5', key: 'processSteps' },
  { index: '§6', key: 'processEvents' },
  { index: '§7', key: 'characterization' },
  { index: '§8', key: 'pvd' },
] as const

export function PlaceholderSections() {
  const { t } = useTranslation()
  return (
    <>
      {PLACEHOLDERS.map((item) => (
        <Card key={item.index} className="border-dashed opacity-70">
          <CardHeader>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">
                {item.index}
              </span>
              <h2 className="text-lg font-semibold text-muted-foreground">
                {t(`experimentsV2.placeholders.${item.key}.title`)}
              </h2>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t('experimentsV2.placeholders.comingNext')}
            </p>
          </CardContent>
        </Card>
      ))}
    </>
  )
}
