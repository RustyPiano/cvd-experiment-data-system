import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { ExperimentListPage } from '@/features/experiments/experiment-list-page'

const experimentStatusValues = [
  'draft',
  'submitted',
  'locked',
  'invalid',
] as const

const searchSchema = z.object({
  q: z.string().optional(),
  status: z.array(z.enum(experimentStatusValues)).optional(),
  mine: z.boolean().optional(),
  materialSystem: z.string().optional(),
  ownerId: z.string().optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  sortBy: z
    .enum([
      'run_code',
      'material_system',
      'experiment_date',
      'status',
      'updated_at',
    ])
    .nullable()
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).nullable().optional(),
})

export const Route = createFileRoute('/_authed/experiments/')({
  validateSearch: searchSchema,
  component: ExperimentListPage,
})
