import { createFileRoute } from '@tanstack/react-router'
import { FlaskConical } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute(
  '/_authed/experiments/$experimentId/files',
)({
  component: ExperimentFilesPlaceholder,
})

function ExperimentFilesPlaceholder() {
  const { experimentId } = Route.useParams()
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          实验文件
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          实验 ID：{experimentId}
        </p>
      </div>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <FlaskConical className="size-4 text-primary" />
            实验文件管理
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
