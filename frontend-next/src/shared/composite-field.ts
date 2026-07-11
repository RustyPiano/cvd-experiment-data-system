export const COMPOSITE_INPUTS = [
  '数值+下拉',
  '下拉+数值',
  '文本+下拉',
  '下拉+文本',
] as const

export type CompositeInput = (typeof COMPOSITE_INPUTS)[number]

export function isCompositeInput(input: string): input is CompositeInput {
  return COMPOSITE_INPUTS.includes(input as CompositeInput)
}

function isFreeFirst(input: CompositeInput): boolean {
  return input.startsWith('数值') || input.startsWith('文本')
}

export function formatCompositeValue(
  input: CompositeInput,
  freeValue: string,
  option: string,
): string {
  const free = freeValue
  const selected = option
  if (!free.trim()) return selected.trim()
  if (!selected.trim()) return free
  return isFreeFirst(input) ? `${free}（${selected}）` : `${selected}；${free}`
}

export function parseCompositeValue(
  input: CompositeInput,
  value: string,
  options: string[],
): { freeValue: string; option: string } {
  const stored = value
  const trimmed = stored.trim()
  if (!trimmed) return { freeValue: '', option: '' }
  if (options.includes(trimmed)) return { freeValue: '', option: trimmed }

  const match = isFreeFirst(input)
    ? (stored.match(/^(.*)（([^（）]+)）$/) ??
      stored.match(/^(.*)\(([^()]+)\)$/))
    : stored.match(/^([^；;，,]+)[；;，,]\s*(.+)$/)
  if (match) {
    const [freeValue, option] = isFreeFirst(input)
      ? [match[1], match[2].trim()]
      : [match[2], match[1].trim()]
    if (options.includes(option)) return { freeValue, option }
  }

  return { freeValue: stored, option: '' }
}

export function parseCompositeOptions(options: string | null): string[] {
  if (!options) return []
  const segments = options
    .split(/；|\s\+\s/)
    .map((part) => part.trim())
    .filter(Boolean)
  const selected =
    segments.find((part) => part.includes('/')) ?? segments.at(-1) ?? ''
  return selected
    .split(/\s*\/\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
}
