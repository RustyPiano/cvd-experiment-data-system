import { createFileRoute } from '@tanstack/react-router'
import { SampleListPage } from '@/features/samples/sample-list-page'

export const Route = createFileRoute('/_authed/samples/')({
  component: SampleListPage,
})
