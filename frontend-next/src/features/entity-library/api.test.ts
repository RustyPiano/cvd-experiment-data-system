import { beforeEach, describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({
  apiDownload: vi.fn(),
  apiRequest: vi.fn(),
}))

vi.mock('@/shared/api/client', () => client)

beforeEach(() => vi.clearAllMocks())

describe('entity attachment API', () => {
  it('uploads an unbound entity file with an optional note', async () => {
    const { uploadEntityFile } = await import('./api')
    const file = new File(['certificate'], 'coa.pdf', {
      type: 'application/pdf',
    })
    client.apiRequest.mockResolvedValue({ id: 'file-1' })

    await uploadEntityFile('token', {
      file,
      note: 'supplier certificate',
    })

    expect(client.apiRequest).toHaveBeenCalledWith('/api/v1/entity-files', {
      method: 'POST',
      body: expect.any(FormData),
      token: 'token',
    })
    const form = client.apiRequest.mock.calls[0][1].body as FormData
    expect(form.get('file')).toBe(file)
    expect(form.get('note')).toBe('supplier certificate')
  })

  it('gets, downloads, and deletes through the entity-file namespace', async () => {
    const { deleteEntityFile, downloadEntityFile, getEntityFile } =
      await import('./api')
    client.apiRequest.mockResolvedValue({ id: 'file-1' })
    client.apiDownload.mockResolvedValue({ blob: new Blob(['file']) })

    await getEntityFile('token', 'file-1')
    await downloadEntityFile('token', 'file-1')
    await deleteEntityFile('token', 'file-1')

    expect(client.apiRequest).toHaveBeenNthCalledWith(
      1,
      '/api/v1/entity-files/file-1',
      { token: 'token' },
    )
    expect(client.apiDownload).toHaveBeenCalledWith(
      '/api/v1/entity-files/file-1/download',
      { token: 'token' },
    )
    expect(client.apiRequest).toHaveBeenNthCalledWith(
      2,
      '/api/v1/entity-files/file-1',
      { method: 'DELETE', token: 'token' },
    )
  })
})
