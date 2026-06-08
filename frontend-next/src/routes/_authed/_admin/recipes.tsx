import { createFileRoute } from '@tanstack/react-router'
import { RecipeAdminPage } from '@/features/recipes/recipe-admin-page'

export const Route = createFileRoute('/_authed/_admin/recipes')({
  component: RecipeAdminPage,
})
