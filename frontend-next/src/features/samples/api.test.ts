import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

import type { components } from '@/shared/types/openapi'
import type { SampleLineage } from './api'

const client = vi.hoisted(() => ({
  apiDownload: vi.fn(),
  apiRequest: vi.fn(),
}))

vi.mock('@/shared/api/client', () => client)

beforeEach(() => vi.clearAllMocks())

describe('characterization attachment API', () => {
  it('uses the generated sample-lineage response contract', () => {
    expectTypeOf<SampleLineage>().toEqualTypeOf<
      components['schemas']['SampleLineageRead']
    >()
  })

  it('builds the record-linked multipart upload without a sample id', async () => {
    const samplesApi = (await import('./api')) as Record<string, unknown>
    const uploadExperimentFile = samplesApi['uploadExperimentFile']
    expect(uploadExperimentFile).toBeTypeOf('function')
    client.apiRequest.mockResolvedValue({ id: 'file-1' })
    const file = new File(['peak=404'], 'raman.txt', { type: 'text/plain' })

    await (
      uploadExperimentFile as (
        token: string,
        experimentId: string,
        payload: {
          file: File
          method: string
          characterizationRecordId: string
        },
      ) => Promise<unknown>
    )('token', 'run-1', {
      file,
      method: 'Raman',
      characterizationRecordId: 'record-1',
    })

    expect(client.apiRequest).toHaveBeenCalledWith(
      '/api/v1/experiments/run-1/files',
      expect.objectContaining({ method: 'POST', token: 'token' }),
    )
    const form = client.apiRequest.mock.calls[0][1].body as FormData
    expect(form).toBeInstanceOf(FormData)
    expect(form.get('file')).toBe(file)
    expect(form.get('method')).toBe('Raman')
    expect(form.get('characterization_record_id')).toBe('record-1')
    expect(form.get('sample_id')).toBeNull()
  })

  it('marks a pre-measurement analysis output as processed data', async () => {
    const { uploadExperimentFile } = await import('./api')
    client.apiRequest.mockResolvedValue({ id: 'file-1' })
    const file = new File(['result'], 'fit.csv', { type: 'text/csv' })

    await uploadExperimentFile('token', 'run-1', {
      file,
      method: 'Raman',
      sampleId: 'sample-1',
      assetRole: 'characterization_file',
      fileCategory: 'processed',
    })

    const form = client.apiRequest.mock.calls[0][1].body as FormData
    expect(form.get('file_category')).toBe('processed')
    expect(form.get('sample_id')).toBe('sample-1')
    expect(form.get('characterization_record_id')).toBeNull()
  })

  it('rejects an oversized file before making a request', async () => {
    const { MAX_UPLOAD_BYTES, uploadExperimentFile } = await import('./api')
    const file = new File(['x'], 'too-large.bin')
    Object.defineProperty(file, 'size', { value: MAX_UPLOAD_BYTES + 1 })

    await expect(
      uploadExperimentFile('token', 'run-1', {
        file,
        method: 'Raman',
        characterizationRecordId: 'record-1',
      }),
    ).rejects.toMatchObject({
      status: 413,
      detail: `Uploaded file exceeds ${MAX_UPLOAD_BYTES} bytes`,
    })
    expect(client.apiRequest).not.toHaveBeenCalled()
  })
})
