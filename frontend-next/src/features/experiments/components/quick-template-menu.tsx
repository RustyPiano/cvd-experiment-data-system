import { useMemo } from 'react'
import { ChevronDown } from 'lucide-react'

import type { QuickTemplate } from '../data/builtin-templates'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function QuickTemplateMenu({
  disabled,
  moduleKey,
  onSelect,
  templates,
}: {
  disabled?: boolean
  moduleKey: QuickTemplate['moduleKey']
  onSelect: (template: QuickTemplate) => void
  templates: QuickTemplate[]
}) {
  const { builtinItems, templateByKey } = useMemo(() => {
    const nextTemplateByKey = new Map<string, QuickTemplate>()
    const builtin = templates
      .filter((template) => template.moduleKey === moduleKey)
      .map((template) => {
        const key = `builtin:${template.key}`
        nextTemplateByKey.set(key, template)
        return { key, label: template.label }
      })
    return { builtinItems: builtin, templateByKey: nextTemplateByKey }
  }, [moduleKey, templates])

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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
