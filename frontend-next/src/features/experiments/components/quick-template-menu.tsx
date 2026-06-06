import { useMemo } from 'react'
import { ChevronDown } from 'lucide-react'

import type { RecipeRead } from '@/shared/types/api'
import type { QuickTemplate } from '../data/builtin-templates'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function materialSystemMatches(
  recipeMaterialSystem: string | null,
  currentMaterialSystem?: string,
) {
  if (!recipeMaterialSystem) {
    return true
  }
  return recipeMaterialSystem === currentMaterialSystem?.trim()
}

function toRecipeTemplate(
  recipe: RecipeRead,
  moduleKey: QuickTemplate['moduleKey'],
): QuickTemplate | null {
  const payload = asRecord(recipe.default_payload_json[moduleKey])
  if (!payload) {
    return null
  }
  return {
    key: `recipe:${recipe.id}:${moduleKey}`,
    label: recipe.name,
    materialSystem: recipe.material_system ?? undefined,
    moduleKey,
    payload,
  }
}

export function QuickTemplateMenu({
  disabled,
  materialSystem,
  moduleKey,
  onSelect,
  recipeTemplates = [],
  templates,
}: {
  disabled?: boolean
  materialSystem?: string
  moduleKey: QuickTemplate['moduleKey']
  onSelect: (template: QuickTemplate) => void
  recipeTemplates?: RecipeRead[]
  templates: QuickTemplate[]
}) {
  const { builtinItems, recipeItems, templateByKey } = useMemo(() => {
    const nextTemplateByKey = new Map<string, QuickTemplate>()

    const builtin = templates
      .filter((template) => template.moduleKey === moduleKey)
      .map((template) => {
        const key = `builtin:${template.key}`
        nextTemplateByKey.set(key, template)
        return { key, label: template.label }
      })

    const recipes = recipeTemplates
      .filter((recipe) =>
        materialSystemMatches(recipe.material_system ?? null, materialSystem),
      )
      .map((recipe) => toRecipeTemplate(recipe, moduleKey))
      .filter((template): template is QuickTemplate => Boolean(template))
      .map((template) => {
        nextTemplateByKey.set(template.key, template)
        return { key: template.key, label: template.label }
      })

    return {
      builtinItems: builtin,
      recipeItems: recipes,
      templateByKey: nextTemplateByKey,
    }
  }, [materialSystem, moduleKey, recipeTemplates, templates])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          套用模板
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>内置模板</DropdownMenuLabel>
        {builtinItems.map((item) => (
          <DropdownMenuItem
            key={item.key}
            onSelect={() => {
              const template = templateByKey.get(item.key)
              if (template) onSelect(template)
            }}
          >
            {item.label}
          </DropdownMenuItem>
        ))}

        {recipeItems.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>用户 Recipe 模板</DropdownMenuLabel>
            {recipeItems.map((item) => (
              <DropdownMenuItem
                key={item.key}
                onSelect={() => {
                  const template = templateByKey.get(item.key)
                  if (template) onSelect(template)
                }}
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
