import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/shared/i18n'
import { ExperimentAttachments } from './experiment-attachments'

const filesApi = vi.hoisted(() => ({
  deleteExperimentFile: vi.fn(),
  downloadExperimentFile: vi.fn(),
  listExperimentFiles: vi.fn(),
  uploadExperimentFile: vi.fn(),
}))

vi.mock('@/features/samples/api', () => filesApi)
vi.mock('@/features/auth/use-auth', () => ({
  useAuth: () => ({
    session: { accessToken: 'token', isAuthenticated: true },
  }),
}))

function renderAttachments({
  cleanupUncommitted,
  saved,
  role = 'process_event_attachment',
}: {
  cleanupUncommitted?: boolean
  saved?: boolean
  role?: 'process_event_attachment' | 'temperature_timeseries'
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = (nextSaved = saved) => (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ExperimentAttachments
          runId="run-1"
          role={role}
          bindingType={
            role === 'temperature_timeseries' ? 'process_step' : 'process_event'
          }
          bindingId={
            role === 'temperature_timeseries'
              ? 'reaction_conditions'
              : 'event-1'
          }
          readOnly={false}
          cleanupUncommitted={cleanupUncommitted}
          saved={nextSaved}
        />
      </QueryClientProvider>
    </I18nextProvider>
  )
  return { ...render(view()), view }
}

async function uploadAttachment() {
  const user = userEvent.setup()
  await user.upload(
    screen.getByLabelText('Upload attachment for process_event_attachment'),
    new File(['data'], 'event.csv', { type: 'text/csv' }),
  )
  await waitFor(() =>
    expect(filesApi.listExperimentFiles).toHaveBeenCalledTimes(2),
  )
}

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('en')
  filesApi.listExperimentFiles.mockResolvedValue({ items: [], total: 0 })
  filesApi.uploadExperimentFile.mockResolvedValue({
    id: 'uploaded-file-1',
    original_name: 'event.csv',
    size_bytes: 4,
  })
  filesApi.deleteExperimentFile.mockResolvedValue(undefined)
})

describe('uncommitted attachment cleanup', () => {
  it('limits temperature time-series selection to CSV and XLSX', () => {
    renderAttachments({ role: 'temperature_timeseries' })

    expect(
      screen.getByLabelText('Upload attachment for temperature_timeseries'),
    ).toHaveAttribute('accept', '.csv,.xlsx')
  })

  it('soft-deletes a file uploaded by this component when it unmounts', async () => {
    const { unmount } = renderAttachments({ cleanupUncommitted: true })

    await uploadAttachment()
    unmount()

    expect(filesApi.deleteExperimentFile).toHaveBeenCalledWith(
      'token',
      'uploaded-file-1',
    )
  })

  it('keeps the uploaded file after its module save succeeds', async () => {
    const { rerender, unmount, view } = renderAttachments({
      cleanupUncommitted: true,
      saved: false,
    })

    await uploadAttachment()
    rerender(view(true))
    unmount()

    expect(filesApi.deleteExperimentFile).not.toHaveBeenCalled()
  })

  it('does not clean up result-style attachments unless opted in', async () => {
    const { unmount } = renderAttachments()

    await uploadAttachment()
    unmount()

    expect(filesApi.deleteExperimentFile).not.toHaveBeenCalled()
  })
})
