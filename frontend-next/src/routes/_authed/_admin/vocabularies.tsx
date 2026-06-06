import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tags } from 'lucide-react'

export const Route = createFileRoute('/_authed/_admin/vocabularies')({
  component: VocabulariesPlaceholder,
})

function VocabulariesPlaceholder() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          受控词表
        </h1>
      </div>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Tags className="size-4 text-primary" />
            受控词表模块
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            将在后续阶段（P5）实现。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
