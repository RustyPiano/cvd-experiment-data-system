import { ChevronRight } from 'lucide-react'

import type { DiffRow, DiffStatus, ModuleDiff } from '../diff-utils'
import { getDiffStatusLabel } from '../diff-utils'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const statusBadgeClass: Record<DiffStatus, string> = {
  added: 'bg-primary-soft text-primary',
  modified: 'bg-warning-soft text-warning',
  removed: 'bg-destructive-soft text-destructive',
  same: 'bg-muted text-muted-foreground',
}

function formatDiffValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">-</span>
  }

  if (typeof value === 'boolean') {
    return value ? '是' : '否'
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }

  return (
    <code className="whitespace-pre-wrap font-mono text-xs">
      {JSON.stringify(value, null, 2)}
    </code>
  )
}

function StatusBadge({ status }: { status: DiffStatus }) {
  return (
    <Badge className={cn(statusBadgeClass[status])}>
      {getDiffStatusLabel(status)}
    </Badge>
  )
}

export function DiffSection({
  collapseSame,
  moduleDiff,
}: {
  collapseSame: boolean
  moduleDiff: ModuleDiff
}) {
  const rows = collapseSame
    ? moduleDiff.rows.filter((row) => row.status !== 'same')
    : moduleDiff.rows
  const visibleRows: DiffRow[] = rows.length > 0 ? rows : moduleDiff.rows
  const isSame = moduleDiff.status === 'same'
  const defaultOpen = !(isSame && collapseSame)

  return (
    <details
      open={defaultOpen}
      className="group rounded-lg border bg-card [&[open]_.diff-chevron]:rotate-90"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRight className="diff-chevron size-4 text-muted-foreground transition-transform" />
        <span>{moduleDiff.moduleLabel}</span>
        <StatusBadge status={moduleDiff.status} />
      </summary>
      <div className="border-t">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-56">字段名</TableHead>
              <TableHead>来源值</TableHead>
              <TableHead>当前值</TableHead>
              <TableHead className="w-28">状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="font-medium">{row.label}</TableCell>
                <TableCell>{formatDiffValue(row.sourceValue)}</TableCell>
                <TableCell>{formatDiffValue(row.currentValue)}</TableCell>
                <TableCell>
                  <StatusBadge status={row.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </details>
  )
}
