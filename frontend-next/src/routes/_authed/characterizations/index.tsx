import { createFileRoute } from '@tanstack/react-router'
import { CharacterizationListPage } from '@/features/characterizations/characterization-list-page'

export const Route = createFileRoute('/_authed/characterizations/')({
  validateSearch: (search: Record<string, unknown>) => ({
    runId: typeof search.runId === 'string' ? search.runId : undefined,
  }),
  component: CharacterizationRoute,
})

function CharacterizationRoute() {
  const { runId } = Route.useSearch()
  return <CharacterizationListPage runId={runId} />
}
