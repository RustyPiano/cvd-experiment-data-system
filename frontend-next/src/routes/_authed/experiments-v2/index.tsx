import { createFileRoute } from '@tanstack/react-router'
import { ExperimentV2ListPage } from '@/features/experiments-v2/experiment-v2-list-page'

export const Route = createFileRoute('/_authed/experiments-v2/')({
  component: ExperimentV2ListPage,
})
