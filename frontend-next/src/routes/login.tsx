import { createFileRoute, Link } from '@tanstack/react-router'
import { FlaskConical } from 'lucide-react'
import { z } from 'zod/v4'

import { LoginForm } from '@/features/auth/login-form'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
})

export const Route = createFileRoute('/login')({
  validateSearch: loginSearchSchema,
  component: LoginPage,
})

function LoginPage() {
  const { redirect } = Route.useSearch()

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <Card className="shadow-lg">
          <CardHeader className="pb-2">
            {/* Brand lockup */}
            <div className="flex items-center gap-3 mb-4">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <FlaskConical className="size-5" />
              </span>
              <div className="flex flex-col leading-tight">
                <span className="text-base font-bold text-foreground">
                  CVD Lab
                </span>
                <span className="text-xs text-muted-foreground">
                  实验数据采集系统
                </span>
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                登录
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                使用账号登录，或通过内部邀请码注册。
              </p>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <LoginForm redirect={redirect} />
            <p className="text-center text-sm text-muted-foreground">
              没有账号？{' '}
              <Link
                to="/register"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                使用邀请码注册
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
