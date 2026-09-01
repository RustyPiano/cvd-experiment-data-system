import { createFileRoute } from '@tanstack/react-router'
import { CharacterizationListPage } from '@/features/characterizations/characterization-list-page'

export const Route = createFileRoute('/_authed/characterizations/')({
  validateSearch: (search: Record<string, unknown>) => ({
    runId: typeof search.runId === 'string' ? search.runId : undefined,
    sampleId: typeof search.sampleId === 'string' ? search.sampleId : undefined,
  }),
  component: CharacterizationRoute,
})

function CharacterizationRoute() {
  const { runId, sampleId } = Route.useSearch()
  return <CharacterizationListPage runId={runId} sampleId={sampleId} />
}
