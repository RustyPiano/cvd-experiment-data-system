import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { ExperimentEditorPage } from '@/features/experiments/experiment-editor-page'

const searchSchema = z.object({
  inheritFrom: z.string().optional(),
})

export const Route = createFileRoute('/_authed/experiments/$experimentId/edit')(
  {
    validateSearch: searchSchema,
    component: ExperimentEditorPage,
  },
)
