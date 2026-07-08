import { createFileRoute } from '@tanstack/react-router'
import { ExperimentV2NewPage } from '@/features/experiments-v2/experiment-v2-new-page'

export const Route = createFileRoute('/_authed/experiments-v2/new')({
  component: ExperimentV2NewPage,
})
