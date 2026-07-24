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
import { register } from './api'
import { useAuth } from './use-auth'

const createRegisterSchema = () =>
  z
    .object({
      name: z.string().trim().min(1, i18n.t('auth.validation.nameRequired')),
      email: z.email(i18n.t('auth.validation.email')),
      password: z.string().min(8, i18n.t('auth.validation.passwordLength')),
      password_confirmation: z
        .string()
        .min(8, i18n.t('auth.validation.confirmPasswordLength')),
      invite_code: z
        .string()
        .trim()
        .min(1, i18n.t('auth.validation.inviteCodeRequired')),
    })
    .refine((values) => values.password === values.password_confirmation, {
      message: i18n.t('auth.validation.passwordMismatch'),
      path: ['password_confirmation'],
    })

type RegisterFormValues = z.infer<ReturnType<typeof createRegisterSchema>>

export function RegisterForm() {
  const { i18n: i18nInstance, t } = useTranslation()
  const registerSchema = useMemo(createRegisterSchema, [i18nInstance.language])
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
    toast.success(t('auth.register.success'))
    await navigate({ to: '/experiments', replace: true })
  })

  const errorMessage = registerMutation.error
    ? resolveErrorMessage(registerMutation.error, t('auth.register.error'))
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
              <FormLabel>{t('auth.fields.name')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="name"
                  placeholder={t('auth.placeholders.name')}
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
              <FormLabel>{t('auth.fields.email')}</FormLabel>
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
              <FormLabel>{t('auth.fields.password')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  autoComplete="new-password"
                  placeholder={t('auth.placeholders.newPassword')}
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
              <FormLabel>{t('auth.fields.confirmPassword')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  autoComplete="new-password"
                  placeholder={t('auth.placeholders.confirmPassword')}
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
              <FormLabel>{t('auth.fields.inviteCode')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  autoComplete="off"
                  placeholder={t('auth.placeholders.inviteCode')}
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
          aria-label={t('auth.register.submit')}
        >
          {registerMutation.isPending
            ? t('auth.register.submitting')
            : t('auth.register.submit')}
        </Button>
      </form>
    </Form>
  )
}
