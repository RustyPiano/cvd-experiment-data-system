import { createFileRoute } from '@tanstack/react-router'
import { EntityDetailPage } from '@/features/entity-library/entity-detail-page'

export const Route = createFileRoute('/_authed/setups/$entityId')({
  component: RouteComponent,
})

function RouteComponent() {
  const { entityId } = Route.useParams()
  return <EntityDetailPage kind="setup" entityId={entityId} />
}
