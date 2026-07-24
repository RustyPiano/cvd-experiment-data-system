export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

export function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}
