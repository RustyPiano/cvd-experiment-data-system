import { createFileRoute } from '@tanstack/react-router'
import { SampleDetailPage } from '@/features/samples/sample-detail-page'

export const Route = createFileRoute('/_authed/samples/$sampleId')({
  component: SampleDetailPage,
})
