import { describe, expect, it, vi } from 'vitest'
import { recoverUploads } from './upload-recovery'
import { deleteExperimentFile, getExperimentFile } from '@/features/samples/api'

vi.mock('@/features/samples/api', () => ({
  getExperimentFile: vi.fn(),
  deleteExperimentFile: vi.fn(),
}))

describe('upload recovery', () => {
  it('keeps uncertain files, preserves committed files, and rechecks before retrying', async () => {
    vi.mocked(getExperimentFile).mockImplementation(async (_token, id) => {
      if (id === 'unknown') throw new Error('offline')
      return {
        characterization_record_id: id === 'saved' ? 'm1' : null,
      } as Awaited<ReturnType<typeof getExperimentFile>>
    })
    vi.mocked(deleteExperimentFile)
      .mockRejectedValueOnce(new Error('delete failed'))
      .mockResolvedValue(undefined)
    const files = ['saved', 'unknown', 'retry', 'clean'].map((id) => ({
      id,
      name: id + '.txt',
    }))
    const result = await recoverUploads('token', files)
    expect(result.committed).toEqual(['m1'])
    expect(result.pending.map((f) => f.id)).toEqual(['unknown', 'retry'])
    expect(deleteExperimentFile).not.toHaveBeenCalledWith('token', 'saved')
    expect(deleteExperimentFile).not.toHaveBeenCalledWith('token', 'unknown')
    vi.mocked(getExperimentFile).mockResolvedValue({
      characterization_record_id: 'm2',
    } as Awaited<ReturnType<typeof getExperimentFile>>)
    expect(await recoverUploads('token', result.pending)).toEqual({
      pending: [],
      committed: ['m2'],
    })
    expect(deleteExperimentFile).toHaveBeenCalledTimes(2)
  })
})
