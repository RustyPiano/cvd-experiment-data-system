// datetime-local（'YYYY-MM-DDTHH:mm'）↔ ISO 互转。表单里 started_at 用 datetime-local
// 控件承载，提交/存储统一转 ISO（与后端 create_run 存 isoformat 一致）。
export function toIsoDateTime(local: string): string {
  const trimmed = local.trim()
  if (trimmed === '') return trimmed
  const date = new Date(trimmed)
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed) ||
    Number.isNaN(date.getTime())
  ) {
    return trimmed
  }
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absolute = Math.abs(offsetMinutes)
  const pad = (value: number) => String(value).padStart(2, '0')
  const offset = `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
  return `${trimmed}:00${offset}`
}
