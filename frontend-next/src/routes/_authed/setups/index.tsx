import { createFileRoute } from '@tanstack/react-router'
import { EntityLibraryPage } from '@/features/entity-library/entity-library-page'

export const Route = createFileRoute('/_authed/setups/')({
  component: () => <EntityLibraryPage kind="setup" />,
})
