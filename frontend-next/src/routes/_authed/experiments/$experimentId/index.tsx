import { createFileRoute } from '@tanstack/react-router'
import { ExperimentDetailPage } from '@/features/experiments/experiment-detail-page'

export const Route = createFileRoute('/_authed/experiments/$experimentId/')({
  component: ExperimentDetailPage,
})
