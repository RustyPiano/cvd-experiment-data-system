import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { FlaskConical } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { RegisterForm } from '@/features/auth/register-form'
import { getStoredSession } from '@/features/auth/session'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { LanguageToggle } from '@/shared/ui/language-toggle'

export const Route = createFileRoute('/register')({
  beforeLoad: () => {
    if (getStoredSession().isAuthenticated) {
      throw redirect({ to: '/experiments' })
    }
  },
  component: RegisterPage,
})

function RegisterPage() {
  const { t } = useTranslation()
  return (
    <div className="relative flex min-h-svh items-center justify-center bg-background p-4">
      <div className="absolute right-4 top-4">
        <LanguageToggle />
      </div>
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
                  {t('auth.brand.subtitle')}
                </span>
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {t('auth.register.title')}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('auth.register.subtitle')}
              </p>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <RegisterForm />
            <p className="text-center text-sm text-muted-foreground">
              {t('auth.register.hasAccount')}{' '}
              <Link
                to="/login"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {t('auth.register.loginLink')}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
