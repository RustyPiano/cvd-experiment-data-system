import { createFileRoute } from '@tanstack/react-router'
import { ExperimentFilesPage } from '@/features/experiments/experiment-files-page'

export const Route = createFileRoute(
  '/_authed/experiments/$experimentId/files',
)({
  component: ExperimentFilesPage,
})
