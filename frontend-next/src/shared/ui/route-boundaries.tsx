import type { ErrorComponentProps } from '@tanstack/react-router'
import { Link, useRouter } from '@tanstack/react-router'
import { FileQuestion, Home, RotateCcw, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

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
      <div className="flex size-14 items-center justify-center rounded-lg bg-muted text-muted-foreground">
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
  const { t } = useTranslation()
  return (
    <CenteredBoundary
      icon={<FileQuestion className="size-7" />}
      title={t('routeBoundaries.notFound.title')}
      description={t('routeBoundaries.notFound.description')}
      actions={
        <Button asChild>
          <Link to="/experiments">
            <Home className="size-4" />
            {t('routeBoundaries.backToRuns')}
          </Link>
        </Button>
      }
    />
  )
}

export function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation()
  const router = useRouter()

  return (
    <CenteredBoundary
      icon={<TriangleAlert className="size-7 text-destructive" />}
      title={t('routeBoundaries.error.title')}
      description={resolveErrorMessage(
        error,
        t('routeBoundaries.error.description'),
      )}
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
            {t('routeBoundaries.retry')}
          </Button>
          <Button asChild>
            <Link to="/experiments">
              <Home className="size-4" />
              {t('routeBoundaries.backToRuns')}
            </Link>
          </Button>
        </>
      }
    />
  )
}
