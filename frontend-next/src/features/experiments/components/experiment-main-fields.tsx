import type { BasicInfoValues, VocabularySelectOption } from '../editor-types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { RequiredMark } from '@/shared/ui/required-mark'
import { VocabularyCombobox } from './vocabulary-combobox'

const layerCountOptions = [
  { label: '1', value: '1' },
  { label: '2', value: '2' },
  { label: '3', value: '3' },
  { label: '多层', value: '多层' },
]

export function ExperimentMainFields({
  disabled,
  materialSystemOptions,
  onChange,
  value,
}: {
  disabled: boolean
  materialSystemOptions: VocabularySelectOption[]
  onChange: (nextValue: BasicInfoValues) => void
  value: BasicInfoValues
}) {
  return (
    <div className="editor-grid">
      <p className="editor-field-wide text-sm text-muted-foreground">
        草稿可修正实验日期；编号保持创建时的历史标识。带{' '}
        <span className="text-destructive">*</span> 的字段为提交前必填。
      </p>

      <div className="editor-field">
        <Label htmlFor="main-experiment-type">
          实验类型
          <RequiredMark />
        </Label>
        <Input
          id="main-experiment-type"
          aria-label="实验类型"
          autoComplete="off"
          disabled={disabled}
          placeholder="例如 cvd_2zone"
          value={value.experimentType}
          onChange={(event) =>
            onChange({ ...value, experimentType: event.target.value })
          }
        />
      </div>

      <div className="editor-field">
        <Label htmlFor="main-material-system">
          材料体系
          <RequiredMark />
        </Label>
        <VocabularyCombobox
          ariaLabel="材料体系"
          disabled={disabled}
          onChange={(nextValue) =>
            onChange({ ...value, materialSystem: nextValue })
          }
          options={materialSystemOptions}
          placeholder="选择或输入材料体系"
          value={value.materialSystem}
        />
      </div>

      <div className="editor-field">
        <Label htmlFor="main-experiment-date">
          实验日期
          <RequiredMark />
        </Label>
        <Input
          id="main-experiment-date"
          aria-label="实验日期"
          autoComplete="off"
          disabled={disabled}
          type="date"
          value={value.experimentDate}
          onChange={(event) =>
            onChange({ ...value, experimentDate: event.target.value })
          }
        />
      </div>

      <div className="editor-field">
        <Label htmlFor="main-layer-count">层数</Label>
        <Select
          disabled={disabled}
          value={value.layerCount || undefined}
          onValueChange={(nextValue) =>
            onChange({ ...value, layerCount: nextValue })
          }
        >
          <SelectTrigger id="main-layer-count" aria-label="层数">
            <SelectValue placeholder="选择层数" />
          </SelectTrigger>
          <SelectContent>
            {layerCountOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="editor-field editor-field-wide">
        <Label htmlFor="main-objective">实验目的</Label>
        <Textarea
          id="main-objective"
          aria-label="实验目的"
          disabled={disabled}
          rows={3}
          placeholder="记录当前实验的目标、变量或预期结果"
          value={value.objective}
          onChange={(event) =>
            onChange({ ...value, objective: event.target.value })
          }
        />
      </div>
    </div>
  )
}
