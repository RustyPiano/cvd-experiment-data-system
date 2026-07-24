import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/shared/i18n'
import { EntityReferenceSelect } from './entity-reference-select'

const entityApi = vi.hoisted(() => ({
  createEntity: vi.fn(),
  listEntities: vi.fn(),
}))

vi.mock('@/features/entity-library/api', () => entityApi)
vi.mock('@/features/auth/use-auth', () => ({
  useAuth: () => ({
    session: {
      accessToken: 'token',
      isAuthenticated: true,
      currentUser: { id: 'user-1' },
    },
  }),
}))
vi.mock('@/features/entity-library/entity-form', () => ({
  EntityForm: ({
    onSubmit,
    onCancel,
    onDirtyChange,
  }: {
    onSubmit: (payload: Record<string, string>) => void
    onCancel: () => void
    onDirtyChange?: (dirty: boolean) => void
  }) => (
    <>
      <button type="button" onClick={() => onSubmit({ setup_code: 'SET-1' })}>
        Save inline reference
      </button>
      <button type="button" onClick={() => onDirtyChange?.(true)}>
        Dirty inline reference
      </button>
      <button type="button" onClick={onCancel}>
        Cancel inline reference
      </button>
    </>
  ),
}))

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('en')
  entityApi.listEntities.mockResolvedValue({ items: [], total: 0 })
})

it('creates a reference in place and selects it immediately', async () => {
  const entity = {
    id: 'setup-1',
    latest_version: { version: 1, data: { setup_code: 'SET-1' } },
  }
  entityApi.createEntity.mockResolvedValue(entity)
  const onChange = vi.fn()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const user = userEvent.setup()
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <EntityReferenceSelect kind="setup" value="" onChange={onChange} />
      </QueryClientProvider>
    </I18nextProvider>,
  )

  await user.click(
    await screen.findByRole('button', { name: /Add Experimental setup/i }),
  )
  await user.click(
    screen.getByRole('button', { name: 'Save inline reference' }),
  )

  await waitFor(() =>
    expect(entityApi.createEntity).toHaveBeenCalledWith(
      'setup',
      { setup_code: 'SET-1' },
      'token',
    ),
  )
  expect(onChange).toHaveBeenCalledWith('setup-1', entity)
})

it('keeps an unsaved inline entity form open when the user cancels discard', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const user = userEvent.setup()
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <EntityReferenceSelect kind="setup" value="" onChange={vi.fn()} />
      </QueryClientProvider>
    </I18nextProvider>,
  )

  await user.click(
    await screen.findByRole('button', { name: /Add Experimental setup/i }),
  )
  await user.click(
    screen.getByRole('button', { name: 'Dirty inline reference' }),
  )
  await user.click(
    screen.getByRole('button', { name: 'Cancel inline reference' }),
  )

  expect(confirm).toHaveBeenCalled()
  expect(
    screen.getByRole('heading', { name: /New Experimental setup/i }),
  ).toBeInTheDocument()
  confirm.mockRestore()
})

it('shows a retryable error instead of treating a failed query as an empty library', async () => {
  entityApi.listEntities.mockRejectedValueOnce(new Error('offline'))
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const user = userEvent.setup()
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <EntityReferenceSelect kind="setup" value="" onChange={vi.fn()} />
      </QueryClientProvider>
    </I18nextProvider>,
  )

  expect(
    await screen.findByText('Failed to load reference data'),
  ).toBeInTheDocument()
  expect(
    screen.queryByText('No records are available in reference data.'),
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(entityApi.listEntities).toHaveBeenCalledTimes(2))
})
