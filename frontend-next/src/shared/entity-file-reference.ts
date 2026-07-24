export interface EntityFileReference {
  file_asset_id: string
  sha256: string
  original_name?: string
  size_bytes?: number
}

const FILE_ASSET_REFERENCE_INPUT = 'FileAsset\u5f15\u7528'
const FREE_TEXT_SUFFIX = '+\u81ea\u7531'

export function isEntityFileInput(input: string): boolean {
  return input.includes(FILE_ASSET_REFERENCE_INPUT)
}

export function entityFileInputAllowsNote(input: string): boolean {
  return input.includes(FREE_TEXT_SUFFIX)
}

function asReference(raw: unknown, fieldKey: string): EntityFileReference {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError(`${fieldKey} must be a file reference`)
  }
  const record = raw as Record<string, unknown>
  const fileAssetId = record.file_asset_id
  const sha256 = record.sha256
  if (
    typeof fileAssetId !== 'string' ||
    fileAssetId.trim() === '' ||
    typeof sha256 !== 'string' ||
    sha256.trim() === ''
  ) {
    throw new TypeError(`${fieldKey} must be a complete file reference`)
  }
  return {
    file_asset_id: fileAssetId,
    sha256,
    ...(typeof record.original_name === 'string'
      ? { original_name: record.original_name }
      : {}),
    ...(typeof record.size_bytes === 'number' &&
    Number.isFinite(record.size_bytes)
      ? { size_bytes: record.size_bytes }
      : {}),
  }
}

export function parseEntityFileReference(
  value: unknown,
  fieldKey = 'attachment',
): EntityFileReference {
  let raw = value
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value) as unknown
    } catch {
      throw new TypeError(`${fieldKey} must be a file reference`)
    }
  }
  return asReference(raw, fieldKey)
}

export function tryParseEntityFileReference(
  value: unknown,
): EntityFileReference | null {
  if (value == null || value === '') return null
  try {
    return parseEntityFileReference(value)
  } catch {
    return null
  }
}

export function entityFileFormValue(
  value: unknown,
  fieldKey = 'attachment',
): string {
  if (value == null || value === '') return ''
  return JSON.stringify(parseEntityFileReference(value, fieldKey))
}

export function entityFilePayload(
  value: unknown,
  fieldKey: string,
): Pick<EntityFileReference, 'file_asset_id' | 'sha256'> {
  const reference = parseEntityFileReference(value, fieldKey)
  return {
    file_asset_id: reference.file_asset_id,
    sha256: reference.sha256,
  }
}

export function entityFileValueFromAsset(asset: {
  id: string
  sha256: string
  original_name: string
  size_bytes: number
}): string {
  return JSON.stringify({
    file_asset_id: asset.id,
    sha256: asset.sha256,
    original_name: asset.original_name,
    size_bytes: asset.size_bytes,
  } satisfies EntityFileReference)
}
