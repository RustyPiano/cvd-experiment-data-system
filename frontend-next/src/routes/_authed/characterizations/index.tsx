import { createFileRoute } from '@tanstack/react-router'
import { CharacterizationListPage } from '@/features/characterizations/characterization-list-page'

export const Route = createFileRoute('/_authed/characterizations/')({
  component: CharacterizationListPage,
})
