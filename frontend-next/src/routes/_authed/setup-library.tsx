import { createFileRoute } from '@tanstack/react-router'
import { Settings } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/_authed/setup-library')({
  component: SetupLibraryPlaceholder,
})

function SetupLibraryPlaceholder() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Setup 库
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          管理实验 Setup 方法库
        </p>
      </div>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Settings className="size-4 text-primary" />
            Setup 库模块
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Setup 库模块将在后续阶段实现，包括结构化 Setup
            方法的浏览、新建和关联实验等完整功能。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
