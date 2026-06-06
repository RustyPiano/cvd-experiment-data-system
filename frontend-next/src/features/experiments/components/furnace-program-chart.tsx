import { useMemo } from 'react'
import { ParentSize } from '@visx/responsive'
import { scaleLinear } from '@visx/scale'
import { LinePath } from '@visx/shape'
import { GridRows, GridColumns } from '@visx/grid'

import type { FurnaceProgramValues } from '../editor-types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/shared/ui/empty-state'

interface ChartPoint {
  time: number
  temperature: number
  label: string
  note: string
}

interface ZoneSeries {
  zoneKey: string
  points: ChartPoint[]
}

// 系列配色：循环使用设计系统的 --chart-1..5。
const SERIES_COLORS = [
  'var(--chart-1)',
  'var(--chart-3)',
  'var(--chart-2)',
  'var(--chart-4)',
  'var(--chart-5)',
]

// 把炉温程序解析成多温区折线数据（与旧 @ant-design/plots 版本逻辑一致）：
// 每个温区从 time=0 的起始温度开始，按各区间时长累加 elapsed，得到目标温度折点。
function buildZoneSeries(value: FurnaceProgramValues): ZoneSeries[] {
  return value.zones.map((zone, zoneIndex) => {
    const zoneKey = zone.zoneKey || `zone_${zoneIndex + 1}`
    const startTemp = Number.parseFloat(zone.startTemperatureC)
    const currentStart = Number.isNaN(startTemp) ? 25 : startTemp

    const points: ChartPoint[] = [
      {
        time: 0,
        temperature: currentStart,
        label: '起始温度',
        note: zone.note || '',
      },
    ]

    let elapsed = 0
    let prevTemp = currentStart
    zone.segments.forEach((seg, segIndex) => {
      const dur = Number.parseFloat(seg.durationMin)
      const temp = Number.parseFloat(seg.targetTemperatureC)
      if (!Number.isNaN(dur) && dur > 0) {
        elapsed += dur
        const targetTemp = Number.isNaN(temp) ? prevTemp : temp
        points.push({
          time: elapsed,
          temperature: targetTemp,
          label: seg.label || `区间 ${segIndex + 1}`,
          note: seg.note || '',
        })
        prevTemp = targetTemp
      }
    })

    return { zoneKey, points }
  })
}

const MARGIN = { top: 12, right: 20, bottom: 36, left: 44 }

function ChartCanvas({
  series,
  width,
  height,
}: {
  series: ZoneSeries[]
  width: number
  height: number
}) {
  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 0)
  const innerHeight = Math.max(height - MARGIN.top - MARGIN.bottom, 0)

  const { xScale, yScale } = useMemo(() => {
    const allPoints = series.flatMap((s) => s.points)
    const maxTime = Math.max(...allPoints.map((p) => p.time), 1)
    const temps = allPoints.map((p) => p.temperature)
    const minTemp = Math.min(...temps)
    const maxTemp = Math.max(...temps)
    const pad = Math.max((maxTemp - minTemp) * 0.1, 10)
    return {
      xScale: scaleLinear({
        domain: [0, maxTime],
        range: [0, innerWidth],
        nice: true,
      }),
      yScale: scaleLinear({
        domain: [Math.max(0, minTemp - pad), maxTemp + pad],
        range: [innerHeight, 0],
        nice: true,
      }),
    }
  }, [series, innerWidth, innerHeight])

  const xTicks = xScale.ticks(6)
  const yTicks = yScale.ticks(5)

  return (
    <svg width={width} height={height} role="img" aria-label="炉温程序温度曲线">
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        <GridRows
          scale={yScale}
          width={innerWidth}
          stroke="var(--border)"
          strokeOpacity={0.6}
          strokeDasharray="2,3"
        />
        <GridColumns
          scale={xScale}
          height={innerHeight}
          stroke="var(--border)"
          strokeOpacity={0.4}
          strokeDasharray="2,3"
        />
        {/* axes baselines */}
        <line
          x1={0}
          y1={innerHeight}
          x2={innerWidth}
          y2={innerHeight}
          stroke="var(--border)"
        />
        <line x1={0} y1={0} x2={0} y2={innerHeight} stroke="var(--border)" />

        {/* x ticks */}
        {xTicks.map((t) => (
          <text
            key={`x-${t}`}
            x={xScale(t)}
            y={innerHeight + 18}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {t}
          </text>
        ))}
        {/* y ticks */}
        {yTicks.map((t) => (
          <text
            key={`y-${t}`}
            x={-8}
            y={yScale(t)}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {t}
          </text>
        ))}

        {/* axis titles */}
        <text
          x={innerWidth / 2}
          y={innerHeight + 33}
          textAnchor="middle"
          className="fill-muted-foreground text-[11px]"
        >
          时间 (分钟)
        </text>
        <text
          transform={`translate(${-36},${innerHeight / 2}) rotate(-90)`}
          textAnchor="middle"
          className="fill-muted-foreground text-[11px]"
        >
          温度 (°C)
        </text>

        {/* zone lines + markers */}
        {series.map((s, index) => {
          const color = SERIES_COLORS[index % SERIES_COLORS.length]
          return (
            <g key={s.zoneKey}>
              <LinePath
                data={s.points}
                x={(d) => xScale(d.time)}
                y={(d) => yScale(d.temperature)}
                stroke={color}
                strokeWidth={2.25}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.points.map((p, pi) => (
                <circle
                  key={pi}
                  cx={xScale(p.time)}
                  cy={yScale(p.temperature)}
                  r={3}
                  fill="var(--card)"
                  stroke={color}
                  strokeWidth={2}
                >
                  <title>{`${s.zoneKey} · ${p.label}\n${p.time} min → ${p.temperature} °C${p.note ? `\n${p.note}` : ''}`}</title>
                </circle>
              ))}
            </g>
          )
        })}
      </g>
    </svg>
  )
}

export function FurnaceProgramChart({
  value,
}: {
  value: FurnaceProgramValues
}) {
  const series = useMemo(() => buildZoneSeries(value), [value])
  const hasMultiplePoints = series.some((s) => s.points.some((p) => p.time > 0))

  return (
    <Card className="bg-muted/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">温度曲线预览</CardTitle>
      </CardHeader>
      <CardContent>
        {hasMultiplePoints ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {series.map((s, index) => (
                <span
                  key={s.zoneKey}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        SERIES_COLORS[index % SERIES_COLORS.length],
                    }}
                  />
                  {s.zoneKey}
                </span>
              ))}
            </div>
            <div className="h-60 w-full">
              <ParentSize>
                {({ width, height }) =>
                  width > 0 && height > 0 ? (
                    <ChartCanvas
                      series={series}
                      width={width}
                      height={height}
                    />
                  ) : null
                }
              </ParentSize>
            </div>
          </div>
        ) : (
          <EmptyState description="请在下方各温区添加区间和时长以生成温度曲线预览。" />
        )}
      </CardContent>
    </Card>
  )
}
