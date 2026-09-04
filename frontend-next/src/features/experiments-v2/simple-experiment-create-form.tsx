import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useAuth } from '@/features/auth/use-auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { RequiredMark } from '@/shared/ui/required-mark'

import { createRun, listContributors } from './api'
import {
  buildSimpleCreatePayload,
  simpleCreateIssue,
} from './simple-form-adapters'

function currentDateTimeLocal() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
}

export function SimpleExperimentCreateForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { session } = useAuth()
  const token = session.accessToken || ''
  const currentUser = session.currentUser
  const [startedAt, setStartedAt] = useState(currentDateTimeLocal)
  const [performerIds, setPerformerIds] = useState<string[]>(() =>
    currentUser?.id ? [currentUser.id] : [],
  )
  const [ambientTemperature, setAmbientTemperature] = useState('')
  const [ambientHumidity, setAmbientHumidity] = useState('')
  const [issue, setIssue] = useState<string | null>(null)

  const contributors = useQuery({
    queryKey: ['contributors', token],
    queryFn: () => listContributors(token),
    enabled: Boolean(token),
  })
  const selectedContributors = (contributors.data ?? []).filter((item) =>
    performerIds.includes(item.id),
  )
  const selectedNames =
    selectedContributors.length > 0
      ? selectedContributors.map((item) => item.name).join('、')
      : currentUser?.name || t('experimentsV2.new.noPerformer')

  const createMutation = useMutation({
    mutationFn: () =>
      createRun(
        buildSimpleCreatePayload({
          startedAt,
          performerIds,
          ambientTemperature,
          ambientHumidity,
        }),
        token,
      ),
    onSuccess: (run) =>
      navigate({
        to: '/experiments/$runId/edit',
        params: { runId: run.id },
      }),
    onError: (error) =>
      toast.error(resolveErrorMessage(error, t('experimentsV2.new.error'))),
  })

  const submit = () => {
    const nextIssue = simpleCreateIssue({
      startedAt,
      performerIds,
      ambientTemperature,
      ambientHumidity,
    })
    if (nextIssue) {
      setIssue(t(`experimentsV2.new.validation.${nextIssue}`))
      return
    }
    setIssue(null)
    createMutation.mutate()
  }

  return (
    <Card className="mx-auto w-full max-w-3xl">
      <CardHeader className="sr-only">
        <CardTitle>{t('experimentsV2.new.formTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          id="simple-experiment-create"
          className="grid gap-5 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-experiment-started-at">
              {t('experimentsV2.new.startedAt')} <RequiredMark />
            </Label>
            <Input
              id="new-experiment-started-at"
              type="datetime-local"
              required
              value={startedAt}
              onChange={(event) => setStartedAt(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label id="new-experiment-performers-label">
              {t('experimentsV2.new.performers')} <RequiredMark />
            </Label>
            <div
              className="flex min-h-9 items-center justify-between gap-3 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
              aria-labelledby="new-experiment-performers-label"
            >
              <span className="truncate">{selectedNames}</span>
              <Dialog>
                <DialogTrigger asChild>
                  <Button type="button" variant="ghost" size="sm">
                    <UserPlus data-icon="inline-start" />
                    {t('experimentsV2.new.addPerformer')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {t('experimentsV2.new.performerDialog.title')}
                    </DialogTitle>
                    <DialogDescription>
                      {t('experimentsV2.new.performerDialog.description')}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex max-h-72 flex-col gap-3 overflow-y-auto py-1">
                    {(contributors.data ?? []).map((contributor) => {
                      const checked = performerIds.includes(contributor.id)
                      const isCurrent = contributor.id === currentUser?.id
                      return (
                        <Label
                          key={contributor.id}
                          className="flex items-center gap-3 rounded-md border p-3"
                        >
                          <Checkbox
                            checked={checked}
                            disabled={isCurrent}
                            onCheckedChange={(value) =>
                              setPerformerIds((current) =>
                                value === true
                                  ? [...current, contributor.id]
                                  : current.filter(
                                      (id) => id !== contributor.id,
                                    ),
                              )
                            }
                          />
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span>{contributor.name}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {contributor.email}
                            </span>
                          </span>
                        </Label>
                      )
                    })}
                  </div>
                  <DialogFooter showCloseButton />
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="new-experiment-temperature">
              {t('experimentsV2.new.temperature')}
            </Label>
            <Input
              id="new-experiment-temperature"
              type="number"
              step="any"
              value={ambientTemperature}
              onChange={(event) => setAmbientTemperature(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="new-experiment-humidity">
              {t('experimentsV2.new.humidity')}
            </Label>
            <Input
              id="new-experiment-humidity"
              type="number"
              min="0"
              max="100"
              step="any"
              value={ambientHumidity}
              onChange={(event) => setAmbientHumidity(event.target.value)}
            />
          </div>
        </form>
        {issue ? (
          <Alert variant="destructive" className="mt-5">
            <AlertDescription>{issue}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter>
        <Button
          type="submit"
          form="simple-experiment-create"
          disabled={createMutation.isPending}
        >
          {createMutation.isPending
            ? t('experimentsV2.new.creating')
            : t('experimentsV2.new.submit')}
        </Button>
      </CardFooter>
    </Card>
  )
}
