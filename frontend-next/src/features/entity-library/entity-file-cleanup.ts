import { deleteEntityFile } from './api'
import type { EntityFileAssetRead } from './api'

export async function cleanupPendingEntityFiles(
  token: string,
  files: EntityFileAssetRead[],
): Promise<EntityFileAssetRead[]> {
  const results = await Promise.allSettled(
    files.map((file) => deleteEntityFile(token, file.id)),
  )
  return files.filter((_, index) => results[index]?.status === 'rejected')
}
