import { beforeEach, describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({
  apiDownload: vi.fn(),
  apiRequest: vi.fn(),
}))

vi.mock('@/shared/api/client', () => client)

beforeEach(() => vi.clearAllMocks())

describe('characterization attachment API', () => {
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
})
