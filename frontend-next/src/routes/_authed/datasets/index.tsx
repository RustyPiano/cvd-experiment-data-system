import { createFileRoute } from '@tanstack/react-router'

import { DatasetQueryPage } from '@/features/datasets/dataset-query-page'

export const Route = createFileRoute('/_authed/datasets/')({
  component: DatasetQueryPage,
})
