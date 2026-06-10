import type { QualityLabel } from '@/shared/types/api'
import type {
  ResultSummaryValues,
  VocabularySelectOption,
} from '../editor-types'
import { VocabularyMultiSelect } from './vocabulary-multi-select'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const QUALITY_OPTIONS: { label: string; value: QualityLabel }[] = [
  { label: '未知', value: 'unknown' },
  { label: '成功', value: 'success' },
  { label: '部分成功', value: 'partial' },
  { label: '失败', value: 'failed' },
]

// 质量评级为这些值时，凸显失败信息采集（失败数据是数据集对 AI 有价值的关键）。
const FAILURE_RELEVANT: ReadonlySet<QualityLabel> = new Set<QualityLabel>([
  'failed',
  'partial',
])

export function ResultSummarySection({
  disabled,
  failureModeOptions,
  onChange,
  value,
}: {
  disabled: boolean
  failureModeOptions: VocabularySelectOption[]
  onChange: (nextValue: ResultSummaryValues) => void
  value: ResultSummaryValues
}) {
  const showFailureHint =
    FAILURE_RELEVANT.has(value.qualityLabel) || value.failureModes.length > 0
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
                onClick={() =>
                  onChange({ ...value, qualityLabel: option.value })
                }
                className={cn(
                  'min-w-16 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
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
        <Label asChild>
          <span>失败模式</span>
        </Label>
        <p className="text-sm text-muted-foreground">
          {showFailureHint
            ? '记录本次未达预期的原因（可多选）。失败数据同样是标准数据集的一部分——它让结果对 AI 有意义。'
            : '如本次实验存在未达预期之处，可在此标注失败模式（可多选）。'}
        </p>
        <VocabularyMultiSelect
          ariaLabel="失败模式"
          disabled={disabled}
          emptyHint="暂无失败模式词表"
          options={failureModeOptions}
          value={value.failureModes}
          onChange={(failureModes) => onChange({ ...value, failureModes })}
        />
      </div>

      <div className="editor-field">
        <Label htmlFor="result-summary-failure-detail">失败细节</Label>
        <Textarea
          id="result-summary-failure-detail"
          aria-label="失败细节"
          disabled={disabled}
          rows={3}
          placeholder="补充失败/异常的具体现象、可能原因或排查线索"
          value={value.failureDetail}
          onChange={(event) =>
            onChange({ ...value, failureDetail: event.target.value })
          }
        />
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
