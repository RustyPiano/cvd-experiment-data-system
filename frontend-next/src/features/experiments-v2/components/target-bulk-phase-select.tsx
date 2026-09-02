import { useEffect, useId, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  commonSuggestedBulkSpaceGroups,
  hermannMauguinSymbol,
  spaceGroupNumber,
  suggestedBulkSpaceGroups,
} from '../space-groups'
import { SpaceGroupInput } from './space-group-input'

export function TargetBulkPhaseSelect({
  formula,
  candidateFormulas,
  phase,
  spaceGroupNumber: selectedSpaceGroup,
  onChange,
  disabled,
  label = '目标晶体结构（选填）',
}: {
  formula: string
  candidateFormulas?: string[]
  phase?: string
  spaceGroupNumber?: number
  onChange: (phase?: string, spaceGroupNumber?: number) => void
  disabled?: boolean
  label?: string
}) {
  const id = useId()
  const candidates = candidateFormulas
    ? commonSuggestedBulkSpaceGroups(candidateFormulas)
    : suggestedBulkSpaceGroups(formula)
  const matchingCandidate = candidates.find(
    (candidate) =>
      candidate.phase === phase && candidate.number === selectedSpaceGroup,
  )
  const [customSelected, setCustomSelected] = useState(
    Boolean(phase && !matchingCandidate),
  )
  const [customSpaceGroupText, setCustomSpaceGroupText] = useState(
    selectedSpaceGroup === undefined ? '' : String(selectedSpaceGroup),
  )
  useEffect(() => {
    if (phase === undefined) setCustomSelected(false)
  }, [phase])
  useEffect(() => {
    setCustomSpaceGroupText(
      selectedSpaceGroup === undefined ? '' : String(selectedSpaceGroup),
    )
  }, [selectedSpaceGroup])
  const custom = customSelected || Boolean(phase && !matchingCandidate)
  const value = custom
    ? 'custom'
    : matchingCandidate
      ? `${matchingCandidate.phase}:${matchingCandidate.number}`
      : 'none'
  const formulaMissing = candidateFormulas
    ? candidateFormulas.some((candidate) => !candidate.trim())
    : !formula.trim()

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <Select
        value={value}
        disabled={disabled || formulaMissing}
        onValueChange={(next) => {
          if (next === 'none') {
            setCustomSelected(false)
            onChange()
            return
          }
          if (next === 'custom') {
            setCustomSelected(true)
            onChange('', undefined)
            return
          }
          const candidate = candidates.find(
            (item) => `${item.phase}:${item.number}` === next,
          )
          if (candidate) {
            setCustomSelected(false)
            onChange(candidate.phase, candidate.number)
          }
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="请选择" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="none">不指定</SelectItem>
            {candidates.map((candidate) => (
              <SelectItem
                key={`${candidate.phase}-${candidate.number}`}
                value={`${candidate.phase}:${candidate.number}`}
              >
                {candidate.phase} · {candidate.symbol} · No. {candidate.number}
              </SelectItem>
            ))}
            <SelectItem value="custom">其他或未收录</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      {formulaMissing ? (
        <p className="text-xs text-muted-foreground">请先填写材料化学式。</p>
      ) : null}
      {custom ? (
        <div className="grid gap-4 rounded-lg border p-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-phase`}>
              自定义体相/多型 <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`${id}-phase`}
              value={phase ?? ''}
              disabled={disabled}
              placeholder="例如 2Ha"
              onChange={(event) =>
                onChange(event.target.value, selectedSpaceGroup)
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-space-group`}>体相空间群</Label>
            <SpaceGroupInput
              id={`${id}-space-group`}
              value={customSpaceGroupText}
              onChange={(next) => {
                setCustomSpaceGroupText(next)
                onChange(phase, spaceGroupNumber(next))
              }}
              disabled={disabled}
              placeholder="搜索编号或符号"
            />
            {selectedSpaceGroup ? (
              <p className="text-xs text-muted-foreground">
                {hermannMauguinSymbol(selectedSpaceGroup)} · No.{' '}
                {selectedSpaceGroup}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
