import { createFileRoute } from '@tanstack/react-router'
import { FlaskConical } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/_authed/experiments/new')({
  component: ExperimentNewPlaceholder,
})

function ExperimentNewPlaceholder() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          新建实验
        </h1>
      </div>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <FlaskConical className="size-4 text-primary" />
            新建实验
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            将在后续阶段（P3）实现。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
