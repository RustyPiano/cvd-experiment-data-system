import { createFileRoute } from '@tanstack/react-router'
import { FieldDefinitionAdminPage } from '@/features/field-definitions/field-definition-admin-page'

export const Route = createFileRoute('/_authed/_admin/fields')({
  component: FieldDefinitionAdminPage,
})
