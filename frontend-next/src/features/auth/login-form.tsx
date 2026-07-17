import { useMutation } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod/v4'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import i18n from '@/shared/i18n'

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

const createLoginSchema = () =>
  z.object({
    email: z.email(i18n.t('auth.validation.email')),
    password: z.string().min(1, i18n.t('auth.validation.passwordRequired')),
  })

type LoginFormValues = z.infer<ReturnType<typeof createLoginSchema>>

type LoginFormProps = {
  redirect?: string
}

export function LoginForm({ redirect }: LoginFormProps) {
  const { i18n: i18nInstance, t } = useTranslation()
  const loginSchema = useMemo(createLoginSchema, [i18nInstance.language])
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
      toast.success(t('auth.login.success'))
      await navigate({ to: redirect ?? '/experiments', replace: true })
    } catch {
      // error rendered inline
    }
  })

  const errorMessage = loginMutation.error
    ? resolveErrorMessage(loginMutation.error, t('auth.login.error'))
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
              <FormLabel>{t('auth.fields.email')}</FormLabel>
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
              <FormLabel>{t('auth.fields.password')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  autoComplete="current-password"
                  placeholder={t('auth.placeholders.password')}
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
          aria-label={t('auth.login.submit')}
        >
          {loginMutation.isPending
            ? t('auth.login.submitting')
            : t('auth.login.submit')}
        </Button>
      </form>
    </Form>
  )
}
