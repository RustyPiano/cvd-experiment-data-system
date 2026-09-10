import { deleteExperimentFile, getExperimentFile } from '@/features/samples/api'

export type PendingUpload = { id: string; name: string }

/** Recheck ownership before every deletion, including user-triggered retries. */
export async function recoverUploads(token: string, files: PendingUpload[]) {
  const pending: PendingUpload[] = []
  const committed = new Set<string>()
  for (const file of files) {
    try {
      const uploaded = await getExperimentFile(token, file.id)
      if (uploaded.characterization_record_id) {
        committed.add(uploaded.characterization_record_id)
      } else if (uploaded.characterization_record_id === null) {
        await deleteExperimentFile(token, file.id)
      } else {
        pending.push(file)
      }
    } catch {
      // An unavailable lookup is not evidence that the file is unreferenced.
      pending.push(file)
    }
  }
  return { pending, committed: [...committed] }
}
