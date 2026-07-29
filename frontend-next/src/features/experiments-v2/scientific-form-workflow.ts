export function tubeUsageParts(value: string): [string, string] {
  const [resetCount = '', useNumber = ''] = value.split(',', 2)
  return [resetCount.trim(), useNumber.trim()]
}
