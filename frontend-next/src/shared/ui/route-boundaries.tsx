import type { ErrorComponentProps } from '@tanstack/react-router'
import { Link, useRouter } from '@tanstack/react-router'
import { FileQuestion, Home, RotateCcw, TriangleAlert } from 'lucide-react'

import { resolveErrorMessage } from '@/shared/api/http-error'
import { Button } from '@/components/ui/button'

function CenteredBoundary({
  icon,
  title,
  description,
  actions,
}: {
  icon: React.ReactNode
  title: string
  description: string
  actions: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {actions}
      </div>
    </div>
  )
}

export function RootNotFound() {
  return (
    <CenteredBoundary
      icon={<FileQuestion className="size-7" />}
      title="页面不存在"
      description="你访问的地址不存在或已被移动。请检查链接，或返回实验记录列表。"
      actions={
        <Button asChild>
          <Link to="/experiments">
            <Home className="size-4" />
            返回实验记录
          </Link>
        </Button>
      }
    />
  )
}

export function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter()

  return (
    <CenteredBoundary
      icon={<TriangleAlert className="size-7 text-destructive" />}
      title="页面出错了"
      description={resolveErrorMessage(error, '页面渲染时发生未知错误，请重试或返回首页。')}
      actions={
        <>
          <Button
            variant="outline"
            onClick={() => {
              reset()
              void router.invalidate()
            }}
          >
            <RotateCcw className="size-4" />
            重试
          </Button>
          <Button asChild>
            <Link to="/experiments">
              <Home className="size-4" />
              返回实验记录
            </Link>
          </Button>
        </>
      }
    />
  )
}
