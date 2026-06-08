import { createFileRoute } from '@tanstack/react-router'
import { VocabularyAdminPage } from '@/features/vocabularies/vocabulary-admin-page'

export const Route = createFileRoute('/_authed/_admin/vocabularies')({
  component: VocabularyAdminPage,
})
