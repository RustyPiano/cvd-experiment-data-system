import { Info } from 'lucide-react'

import type { PrecheckValues } from '../editor-types'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type TriValue = '' | 'true' | 'false'

// 三态分段控件：未检查 / 是 / 否。polarity="positive" 表示"是"是理想答案（绿），
// "negative" 表示"是"是风险答案（红）；"否"则取相反语义色。
function TriStateField({
  ariaLabel,
  description,
  disabled,
  label,
  onChange,
  polarity,
  value,
}: {
  ariaLabel: string
  description?: string
  disabled: boolean
  label: string
  onChange: (next: TriValue) => void
  polarity: 'positive' | 'negative'
  value: string
}) {
  const yesGood = polarity === 'positive'
  const options: {
    key: TriValue
    text: string
    tone: 'neutral' | 'good' | 'bad'
  }[] = [
    { key: '', text: '未检查', tone: 'neutral' },
    { key: 'true', text: '是', tone: yesGood ? 'good' : 'bad' },
    { key: 'false', text: '否', tone: yesGood ? 'bad' : 'good' },
  ]

  // Active segment lifts off the track with shadow + inset ring + a darker,
  // higher-contrast tone text so the chosen state reads at a glance.
  const toneActive: Record<'neutral' | 'good' | 'bad', string> = {
    neutral: 'bg-card text-foreground shadow-sm ring-1 ring-inset ring-border',
    good: 'bg-success-soft text-success-text shadow-sm ring-1 ring-inset ring-success/35',
    bad: 'bg-destructive-soft text-destructive-text shadow-sm ring-1 ring-inset ring-destructive/35',
  }

  return (
    <div className="editor-field">
      <Label asChild>
        <span>{label}</span>
      </Label>
      {description ? (
        <p className="-mt-1 text-xs text-muted-foreground">{description}</p>
      ) : null}
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className="inline-flex w-fit rounded-lg border border-input bg-muted/60 p-1"
      >
        {options.map((option) => {
          const active = value === option.key
          return (
            <button
              key={option.key || 'none'}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(option.key)}
              className={cn(
                'min-w-16 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                'disabled:pointer-events-none disabled:opacity-50',
                active
                  ? toneActive[option.tone]
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.text}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function PrecheckSection({
  disabled,
  inheritedFrom,
  onChange,
  value,
}: {
  disabled: boolean
  inheritedFrom?: string
  onChange: (nextValue: PrecheckValues) => void
  value: PrecheckValues
}) {
  return (
    <div className="flex flex-col gap-5">
      {inheritedFrom ? (
        <Alert className="border-primary/30 bg-primary-soft [&>svg]:text-primary">
          <Info />
          <AlertDescription className="text-foreground">
            以下参数继承自 {inheritedFrom}，请确认或修改。
          </AlertDescription>
        </Alert>
      ) : null}

      <TriStateField
        ariaLabel="密封完好"
        label="密封完好"
        description="如果检查失败，需要填写风险说明。"
        disabled={disabled}
        polarity="positive"
        value={value.sealIntact}
        onChange={(next) => onChange({ ...value, sealIntact: next })}
      />
      <TriStateField
        ariaLabel="通风橱已清洁"
        label="通风橱已清洁"
        disabled={disabled}
        polarity="positive"
        value={value.hoodClean}
        onChange={(next) => onChange({ ...value, hoodClean: next })}
      />
      <TriStateField
        ariaLabel="法兰已堵住"
        label="法兰已堵住"
        disabled={disabled}
        polarity="negative"
        value={value.flangeBlocked}
        onChange={(next) => onChange({ ...value, flangeBlocked: next })}
      />
      <TriStateField
        ariaLabel="瓷舟污染"
        label="瓷舟污染"
        disabled={disabled}
        polarity="negative"
        value={value.boatContaminationLevel}
        onChange={(next) =>
          onChange({ ...value, boatContaminationLevel: next })
        }
      />
      <TriStateField
        ariaLabel="石英管污染"
        label="石英管污染"
        disabled={disabled}
        polarity="negative"
        value={value.tubeContaminationLevel}
        onChange={(next) =>
          onChange({ ...value, tubeContaminationLevel: next })
        }
      />

      <div className="editor-field">
        <Label htmlFor="precheck-risk-note">风险说明</Label>
        <Textarea
          id="precheck-risk-note"
          aria-label="风险说明"
          disabled={disabled}
          rows={3}
          placeholder="密封、清洁或装片异常时填写"
          value={value.riskNote}
          onChange={(event) =>
            onChange({ ...value, riskNote: event.target.value })
          }
        />
      </div>
    </div>
  )
}
