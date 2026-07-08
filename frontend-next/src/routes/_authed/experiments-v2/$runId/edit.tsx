import { createFileRoute } from '@tanstack/react-router'
import { ExperimentV2EditPage } from '@/features/experiments-v2/experiment-v2-edit-page'

export const Route = createFileRoute('/_authed/experiments-v2/$runId/edit')({
  component: RouteComponent,
})

function RouteComponent() {
  const { runId } = Route.useParams()
  return <ExperimentV2EditPage runId={runId} />
}
