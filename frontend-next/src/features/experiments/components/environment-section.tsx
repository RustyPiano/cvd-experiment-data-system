import { Info } from 'lucide-react'

import type { EnvironmentValues } from '../editor-types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function EnvironmentSection({
  disabled,
  inheritedFrom,
  onChange,
  value,
}: {
  disabled: boolean
  inheritedFrom?: string
  onChange: (nextValue: EnvironmentValues) => void
  value: EnvironmentValues
}) {
  return (
    <div className="editor-grid">
      {inheritedFrom ? (
        <Alert className="editor-field-wide border-primary/30 bg-primary-soft [&>svg]:text-primary">
          <Info />
          <AlertDescription className="text-foreground">
            以下参数继承自 {inheritedFrom}，请确认或修改。
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="editor-field">
        <Label htmlFor="env-indoor-temp">环境温度 (°C)</Label>
        <Input
          id="env-indoor-temp"
          aria-label="环境温度 (°C)"
          autoComplete="off"
          disabled={disabled}
          placeholder="例如 25"
          value={value.indoorTemperatureC}
          onChange={(event) =>
            onChange({ ...value, indoorTemperatureC: event.target.value })
          }
        />
      </div>

      <div className="editor-field">
        <Label htmlFor="env-indoor-humidity">室内湿度 (%)</Label>
        <Input
          id="env-indoor-humidity"
          aria-label="室内湿度 (%)"
          autoComplete="off"
          disabled={disabled}
          placeholder="例如 45"
          value={value.indoorHumidityPercent}
          onChange={(event) =>
            onChange({ ...value, indoorHumidityPercent: event.target.value })
          }
        />
      </div>

      <div className="editor-field">
        <Label htmlFor="env-sample-env">样品环境</Label>
        <Input
          id="env-sample-env"
          aria-label="样品环境"
          autoComplete="off"
          disabled={disabled}
          placeholder="例如 clean"
          value={value.sampleEnv}
          onChange={(event) =>
            onChange({ ...value, sampleEnv: event.target.value })
          }
        />
      </div>

      <div className="editor-field editor-field-wide">
        <Label htmlFor="env-abnormal-note">异常备注</Label>
        <Textarea
          id="env-abnormal-note"
          aria-label="异常备注"
          disabled={disabled}
          rows={3}
          placeholder="记录当日环境或设备异常"
          value={value.abnormalNote}
          onChange={(event) =>
            onChange({ ...value, abnormalNote: event.target.value })
          }
        />
      </div>
    </div>
  )
}
