import { createFileRoute } from '@tanstack/react-router'
import { ExperimentNewPage } from '@/features/experiments/experiment-new-page'

export const Route = createFileRoute('/_authed/experiments/new')({
  component: ExperimentNewPage,
})
