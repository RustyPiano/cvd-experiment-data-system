import { getRun, listAllMeasurements } from '@/features/experiments-v2/api'
import type { MeasurementSummary } from '@/features/experiments-v2/api'
import { listSamples } from '@/features/samples/api'
import type { SampleRead } from '@/shared/types/api'

export type CharacterizationListItem = {
  sample: SampleRead
  measurements: MeasurementSummary[]
}

export async function listCharacterizationItems(
  token: string,
): Promise<CharacterizationListItem[]> {
  const [samplePage, measurementPage] = await Promise.all([
    listSamples(token),
    listAllMeasurements(token),
  ])
  const runIds = [
    ...new Set(samplePage.items.map((sample) => sample.experiment_run_id)),
  ]
  const currentRevisionByRun = new Map(
    (await Promise.all(runIds.map((runId) => getRun(runId, token)))).map(
      (run) => [run.id, run.current_revision_id],
    ),
  )
  const measurementsBySample = new Map<string, MeasurementSummary[]>()
  for (const measurement of measurementPage.items) {
    const group = measurementsBySample.get(measurement.sample_id) ?? []
    group.push(measurement)
    measurementsBySample.set(measurement.sample_id, group)
  }

  return samplePage.items
    .map((sample) => ({
      sample,
      measurements: (measurementsBySample.get(sample.id) ?? []).sort(
        (left, right) => right.measured_at.localeCompare(left.measured_at),
      ),
    }))
    .filter(({ sample, measurements }) => {
      if (
        sample.role === 'growth' &&
        sample.run_revision_id !==
          currentRevisionByRun.get(sample.experiment_run_id)
      ) {
        return false
      }
      return (
        sample.lifecycle_state === 'active' ||
        measurements.some((measurement) => measurement.evidence_present)
      )
    })
    .sort((left, right) =>
      (
        right.measurements[0]?.measured_at ??
        right.sample.updated_at ??
        ''
      ).localeCompare(
        left.measurements[0]?.measured_at ?? left.sample.updated_at ?? '',
      ),
    )
}
