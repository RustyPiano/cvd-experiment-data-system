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
import { register } from './api'
import { useAuth } from './use-auth'

const registerSchema = z
  .object({
    name: z.string().trim().min(1, '请输入姓名'),
    email: z.email('请输入有效邮箱地址'),
    password: z.string().min(8, '密码至少 8 位'),
    password_confirmation: z.string().min(8, '请再次输入至少 8 位密码'),
    invite_code: z.string().trim().min(1, '请输入邀请码'),
  })
  .refine((values) => values.password === values.password_confirmation, {
    message: '两次输入的密码不一致',
    path: ['password_confirmation'],
  })

type RegisterFormValues = z.infer<typeof registerSchema>

export function RegisterForm() {
  const navigate = useNavigate()
  const { setSession } = useAuth()

  const form = useForm<RegisterFormValues>({
    defaultValues: {
      name: '',
      email: '',
      password: '',
      password_confirmation: '',
      invite_code: '',
    },
    resolver: zodResolver(registerSchema),
  })

  const registerMutation = useMutation({ mutationFn: register })

  const onSubmit = form.handleSubmit(async (values) => {
    const response = await registerMutation
      .mutateAsync(values)
      .catch(() => null)
    if (!response) return

    setSession(createSessionSnapshot(response.access_token, response.user))
    toast.success('注册成功，欢迎加入！')
    await navigate({ to: '/experiments', replace: true })
  })

  const errorMessage = registerMutation.error
    ? resolveErrorMessage(registerMutation.error, '注册失败')
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
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>姓名</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="name"
                  placeholder="请输入姓名"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
                  placeholder="member@example.com"
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
                  autoComplete="new-password"
                  placeholder="至少 8 位"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password_confirmation"
          render={({ field }) => (
            <FormItem>
              <FormLabel>确认密码</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  autoComplete="new-password"
                  placeholder="再次输入密码"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="invite_code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>邀请码</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  autoComplete="off"
                  placeholder="请输入内部邀请码"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full"
          disabled={registerMutation.isPending}
          aria-label="注册并登录"
        >
          {registerMutation.isPending ? '注册中…' : '注册并登录'}
        </Button>
      </form>
    </Form>
  )
}
