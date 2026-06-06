import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod/v4'
import { toast } from 'sonner'

import { resolveErrorMessage } from '@/shared/api/http-error'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { createSessionSnapshot } from './auth-store'
import { login } from './api'
import { useAuth } from './use-auth'

const loginSchema = z.object({
  email: z.email('请输入有效邮箱地址'),
  password: z.string().min(1, '请输入密码'),
})

type LoginFormValues = z.infer<typeof loginSchema>

type LoginFormProps = {
  redirect?: string
}

export function LoginForm({ redirect }: LoginFormProps) {
  const navigate = useNavigate()
  const { setSession } = useAuth()

  const form = useForm<LoginFormValues>({
    defaultValues: { email: '', password: '' },
    resolver: zodResolver(loginSchema),
  })

  const loginMutation = useMutation({ mutationFn: login })

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const response = await loginMutation.mutateAsync(values)
      setSession(createSessionSnapshot(response.access_token, response.user))
      toast.success('登录成功')
      await navigate({ to: redirect ?? '/experiments', replace: true })
    } catch {
      // error rendered inline
    }
  })

  const errorMessage = loginMutation.error
    ? resolveErrorMessage(loginMutation.error, '登录失败')
    : null

  return (
    <Form {...form}>
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
        autoComplete="off"
      >
        {errorMessage ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>邮箱</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="email"
                  autoComplete="email"
                  placeholder="admin@example.com"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>密码</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  autoComplete="current-password"
                  placeholder="请输入密码"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full"
          disabled={loginMutation.isPending}
          aria-label="登录"
        >
          {loginMutation.isPending ? '登录中…' : '登录'}
        </Button>
      </form>
    </Form>
  )
}
