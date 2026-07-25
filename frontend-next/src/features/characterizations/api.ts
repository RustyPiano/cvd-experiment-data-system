import { listResults } from '@/features/experiments-v2/api'
import type { V2ResultRead } from '@/features/experiments-v2/api'
import { listSamples } from '@/features/samples/api'
import type { SampleRead } from '@/shared/types/api'

export type CharacterizationListItem = {
  sample: SampleRead
  results: V2ResultRead[]
}

export async function listCharacterizationItems(
  token: string,
): Promise<CharacterizationListItem[]> {
  const samples = (await listSamples(token)).items
  // ponytail: reuse the existing unified per-sample result API; add a server-side
  // aggregate endpoint only when real list volume makes this fan-out measurable.
  const resultGroups = await Promise.all(
    samples.map((sample) => listResults(sample.id, token)),
  )

  return samples
    .map((sample, index) => ({
      sample,
      results: [...resultGroups[index].items].sort((left, right) =>
        right.created_at.localeCompare(left.created_at),
      ),
    }))
    .sort((left, right) =>
      (
        right.results[0]?.created_at ??
        right.sample.updated_at ??
        ''
      ).localeCompare(
        left.results[0]?.created_at ?? left.sample.updated_at ?? '',
      ),
    )
}
