import type { QualityLabel } from '@/shared/types/api'
import type { ResultSummaryValues } from '../editor-types'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const QUALITY_OPTIONS: { label: string; value: QualityLabel }[] = [
  { label: '未知', value: 'unknown' },
  { label: '成功', value: 'success' },
  { label: '部分成功', value: 'partial' },
  { label: '失败', value: 'failed' },
]

export function ResultSummarySection({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean
  onChange: (nextValue: ResultSummaryValues) => void
  value: ResultSummaryValues
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="editor-field">
        <Label asChild>
          <span>质量评级</span>
        </Label>
        <div
          role="radiogroup"
          aria-label="质量评级"
          className="inline-flex w-fit rounded-md border border-input bg-background p-0.5"
        >
          {QUALITY_OPTIONS.map((option) => {
            const active = value.qualityLabel === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => onChange({ ...value, qualityLabel: option.value })}
                className={cn(
                  'min-w-16 rounded-[5px] px-3 py-1.5 text-sm font-medium transition-colors',
                  'disabled:pointer-events-none disabled:opacity-50',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="editor-field">
        <Label htmlFor="result-summary-result">总结结论</Label>
        <Textarea
          id="result-summary-result"
          aria-label="总结结论"
          disabled={disabled}
          rows={4}
          placeholder="记录当前实验的结果结论、成膜情况或下一步判断"
          value={value.summaryResult}
          onChange={(event) =>
            onChange({ ...value, summaryResult: event.target.value })
          }
        />
      </div>

      <div className="editor-field">
        <Label htmlFor="result-summary-next-step">下一步建议</Label>
        <Textarea
          id="result-summary-next-step"
          aria-label="下一步建议"
          disabled={disabled}
          rows={3}
          placeholder="记录下一轮实验或分析动作"
          value={value.nextStep}
          onChange={(event) =>
            onChange({ ...value, nextStep: event.target.value })
          }
        />
      </div>
    </div>
  )
}
