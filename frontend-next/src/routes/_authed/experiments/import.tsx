import { createFileRoute } from '@tanstack/react-router'
import { ImportWizardPage } from '@/features/experiments/import-wizard-page'

export const Route = createFileRoute('/_authed/experiments/import')({
  component: ImportWizardPage,
})
