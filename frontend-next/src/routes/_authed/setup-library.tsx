import { createFileRoute } from '@tanstack/react-router'
import { SetupLibraryPage } from '@/features/setup-library/setup-library-page'

export const Route = createFileRoute('/_authed/setup-library')({
  component: SetupLibraryPage,
})
