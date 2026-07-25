import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/shared/i18n'
import { EntityForm } from './entity-form'

const entityFilesApi = vi.hoisted(() => ({
  deleteEntityFile: vi.fn(),
  downloadEntityFile: vi.fn(),
  getEntityFile: vi.fn(),
  listEntities: vi.fn(),
  uploadEntityFile: vi.fn(),
}))
const download = vi.hoisted(() => ({ triggerBlobDownload: vi.fn() }))

vi.mock('./api', () => entityFilesApi)
vi.mock('@/shared/lib/download', () => download)

afterEach(async () => {
  await i18n.changeLanguage('zh')
})

function renderForm(props: Partial<React.ComponentProps<typeof EntityForm>>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <EntityForm
          kind="material_lot"
          mode="create"
          nextVersion={1}
          submitting={false}
          token="token"
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          {...props}
        />
      </QueryClientProvider>
    </I18nextProvider>,
  )
}

const unboundAttachment = {
  id: 'file-1',
  experiment_run_id: null,
  entity_type: null,
  entity_id: null,
  entity_version: null,
  sample_id: null,
  characterization_record_id: null,
  uploaded_by_id: 'user-1',
  deleted_by_id: null,
  original_name: 'coa.pdf',
  storage_path: 'entity/file-1',
  download_url: '/api/v1/entity-files/file-1/download',
  content_type: 'application/pdf',
  size_bytes: 11,
  sha256: 'abc123',
  method: 'entity_attachment',
  file_category: 'reference',
  asset_role: 'attachment',
  note: null,
  metadata_json: {},
  created_at: '2026-07-24T00:00:00Z',
  updated_at: '2026-07-24T00:00:00Z',
  deleted_at: null,
  is_deleted: false,
}

const oneZoneTemperatureSensors = [
  {
    sensor_name: 'TC-1',
    sensor_type: 'K',
    zone_index: 1,
    uncertainty_C: 1,
    uncertainty_source: 'calibration',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  entityFilesApi.uploadEntityFile.mockResolvedValue(unboundAttachment)
  entityFilesApi.listEntities.mockResolvedValue({ items: [], total: 0 })
  entityFilesApi.getEntityFile.mockResolvedValue(unboundAttachment)
  entityFilesApi.deleteEntityFile.mockResolvedValue(undefined)
  entityFilesApi.downloadEntityFile.mockResolvedValue({
    blob: new Blob(['certificate']),
    filename: 'coa.pdf',
  })
})

describe('EntityForm — "改动即新版本" semantics prompt', () => {
  it('shows no version banner in create mode', () => {
    renderForm({ mode: 'create', nextVersion: 1 })
    expect(screen.queryByTestId('new-version-banner')).toBeNull()
  })

  it('warns that saving generates the next version, leaving old refs intact', () => {
    renderForm({
      mode: 'newVersion',
      nextVersion: 3,
      defaultData: { lot_category: '衬底', substance_name: 'MoO₃' },
    })
    const banner = screen.getByTestId('new-version-banner')
    // interpolated target version + the "old references unaffected" promise
    expect(banner).toHaveTextContent('v3')
    expect(banner).toHaveTextContent('历史版本')
    expect(banner).toHaveTextContent('制备实验记录不会改变')
  })
})

describe('EntityForm — required markers (导师 B93 明显标识)', () => {
  it('renders red asterisks for required fields', () => {
    renderForm({ mode: 'create' })
    // required labels (批次类别 / 物质名称 / 化学式 / 批号) each carry a "*"
    expect(screen.getAllByText('*').length).toBeGreaterThan(0)
    // the accessible label is announced too
    expect(screen.getAllByText('（必填）').length).toBeGreaterThan(0)
  })

  it('hides conditional substrate/gas sub-fields until a category is chosen', () => {
    renderForm({ mode: 'create' })
    // ▸气瓶·纯度等级 must not appear before lot_category is set
    expect(screen.queryByText('▸气瓶·纯度等级')).toBeNull()
    expect(screen.queryByText('▸衬底·材料')).toBeNull()
    // but always-visible required fields are present
    expect(screen.getByText('批次类别')).toBeInTheDocument()
  })
})

describe('EntityForm — select with other accessibility', () => {
  it('associates the field label with the custom select trigger', () => {
    renderForm({ kind: 'setup' })

    expect(
      screen.getByRole('combobox', { name: '品牌与型号' }),
    ).toBeInTheDocument()
  })

  it('reuses non-empty values from the latest entity versions as options', async () => {
    await i18n.changeLanguage('en')
    entityFilesApi.listEntities.mockResolvedValue({
      items: [
        {
          id: 'lot-1',
          latest_version: {
            version: 2,
            data: { supplier: 'Aladdin' },
          },
        },
      ],
      total: 1,
    })
    const user = userEvent.setup()
    renderForm({})

    const supplier = screen.getByRole('combobox', { name: 'Supplier' })
    await waitFor(() =>
      expect(entityFilesApi.listEntities).toHaveBeenCalledWith(
        'material_lot',
        'token',
      ),
    )
    await user.click(supplier)
    expect(
      await screen.findByRole('option', { name: 'Aladdin' }),
    ).toBeInTheDocument()
  })
})

describe('EntityForm — multi-select values', () => {
  it('submits multiple setup devices as an array', async () => {
    const onSubmit = vi.fn()
    renderForm({
      kind: 'setup',
      onSubmit,
      defaultData: {
        setup_code: 'SETUP-001',
        setup_name: 'Main setup',
        zone_count: '1',
        temperature_sensors: oneZoneTemperatureSensors,
        orientation: '水平',
      },
    })

    fireEvent.click(screen.getByRole('checkbox', { name: '光' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '电' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      field_devices: ['light', 'electric_field'],
    })
  })
})

describe('EntityForm — unsaved changes', () => {
  it('reports dirty state to its dialog owner', async () => {
    const onDirtyChange = vi.fn()
    renderForm({ onDirtyChange })

    fireEvent.change(document.querySelector('input')!, {
      target: { value: 'MoO3' },
    })

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))
  })
})

describe('EntityForm — generated numeric validation', () => {
  it('uses generated constraints and blocks an invalid setup value', async () => {
    await i18n.changeLanguage('en')
    const onSubmit = vi.fn()
    renderForm({
      kind: 'setup',
      onSubmit,
      defaultData: {
        setup_code: 'SETUP-001',
        setup_name: 'Main setup',
        zone_count: '2.5',
        temperature_sensors: oneZoneTemperatureSensors,
        orientation: 'horizontal',
      },
    })

    const zoneCount = screen.getByRole('spinbutton', {
      name: /Number of heating zones/,
    })
    expect(zoneCount).toHaveAttribute('min', '1')
    expect(zoneCount).toHaveAttribute('step', '1')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Enter an integer')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('EntityForm — first-class entity attachments', () => {
  it('reports an in-flight upload and blocks form actions until it settles', async () => {
    await i18n.changeLanguage('en')
    let finishUpload!: (value: typeof unboundAttachment) => void
    entityFilesApi.uploadEntityFile.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishUpload = resolve
        }),
    )
    const onUploadPendingChange = vi.fn()
    renderForm({ onUploadPendingChange })

    const file = new File(['certificate'], 'coa.pdf')
    fireEvent.change(
      screen.getByLabelText('Upload Certificate of analysis (CoA)'),
      { target: { files: [file] } },
    )

    await waitFor(() =>
      expect(onUploadPendingChange).toHaveBeenLastCalledWith(true),
    )
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    finishUpload(unboundAttachment)
    await waitFor(() =>
      expect(onUploadPendingChange).toHaveBeenLastCalledWith(false),
    )
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })

  it('uploads a real file, submits only the immutable reference, and stays retryable', async () => {
    await i18n.changeLanguage('en')
    const onSubmit = vi.fn()
    const onDirtyChange = vi.fn()
    const onPendingFilesChange = vi.fn()
    renderForm({
      onSubmit,
      onDirtyChange,
      onPendingFilesChange,
      defaultData: {
        lot_category: 'chemical',
        substance_name: 'MoO3',
        chemical_formula: 'MoO3',
        batch_number: 'LOT-1',
        cas_number: '1313-27-5',
        purity: '99.9',
      },
    })
    expect(
      screen.queryByRole('textbox', {
        name: /Certificate of analysis/,
      }),
    ).not.toBeInTheDocument()

    const file = new File(['certificate'], 'coa.pdf', {
      type: 'application/pdf',
    })
    fireEvent.change(
      screen.getByLabelText('Upload Certificate of analysis (CoA)'),
      { target: { files: [file] } },
    )

    expect(await screen.findByText('coa.pdf')).toBeInTheDocument()
    expect(entityFilesApi.uploadEntityFile).toHaveBeenCalledWith('token', {
      file,
      note: undefined,
    })
    expect(onPendingFilesChange).toHaveBeenLastCalledWith([unboundAttachment])
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].coa_attachment).toEqual({
      file_asset_id: 'file-1',
      sha256: 'abc123',
    })
    // The owner closes the dialog only after a successful entity mutation.
    // A rejected save therefore leaves the uploaded reference visible for retry.
    expect(screen.getByText('coa.pdf')).toBeInTheDocument()
  })

  it('downloads a bound file and never offers destructive deletion', async () => {
    await i18n.changeLanguage('en')
    const bound = {
      ...unboundAttachment,
      id: 'bound-file',
      original_name: 'existing-coa.pdf',
      size_bytes: 2048,
      entity_type: 'material_lot',
      entity_id: 'lot-1',
      entity_version: 1,
    }
    entityFilesApi.getEntityFile.mockResolvedValue(bound)
    renderForm({
      mode: 'newVersion',
      defaultData: {
        lot_category: 'chemical',
        substance_name: 'MoO3',
        chemical_formula: 'MoO3',
        batch_number: 'LOT-1',
        cas_number: '1313-27-5',
        purity: '99.9',
        coa_attachment: {
          file_asset_id: 'bound-file',
          sha256: 'abc123',
          original_name: 'existing-coa.pdf',
          size_bytes: 2048,
        },
      },
    })

    expect(await screen.findByText('existing-coa.pdf')).toBeInTheDocument()
    expect(screen.getByText('2 KB')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Delete existing-coa.pdf' }),
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Download existing-coa.pdf' }),
    )
    await waitFor(() =>
      expect(entityFilesApi.downloadEntityFile).toHaveBeenCalledWith(
        'token',
        'bound-file',
      ),
    )
    expect(download.triggerBlobDownload).toHaveBeenCalledWith(
      expect.any(Blob),
      'coa.pdf',
    )
  })

  it('deletes an unbound upload and clears its pending cleanup record', async () => {
    await i18n.changeLanguage('en')
    const onPendingFilesChange = vi.fn()
    renderForm({ onPendingFilesChange })
    const file = new File(['certificate'], 'coa.pdf')
    fireEvent.change(
      screen.getByLabelText('Upload Certificate of analysis (CoA)'),
      { target: { files: [file] } },
    )
    expect(await screen.findByText('coa.pdf')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete coa.pdf' }))
    await waitFor(() =>
      expect(entityFilesApi.deleteEntityFile).toHaveBeenCalledWith(
        'token',
        'file-1',
      ),
    )
    await waitFor(() =>
      expect(onPendingFilesChange).toHaveBeenLastCalledWith([]),
    )
    expect(screen.queryByText('coa.pdf')).not.toBeInTheDocument()
  })

  it('sends the optional setup-diagram note with the selected file', async () => {
    await i18n.changeLanguage('en')
    renderForm({
      kind: 'setup',
      defaultData: {
        setup_code: 'SETUP-1',
        setup_name: 'Main reactor',
        zone_count: 1,
        temperature_sensors: oneZoneTemperatureSensors,
        orientation: 'horizontal',
      },
    })
    fireEvent.change(
      screen.getByLabelText('Note for Setup diagram and description'),
      { target: { value: 'Reactor geometry' } },
    )
    const file = new File(['diagram'], 'setup.svg', {
      type: 'image/svg+xml',
    })
    fireEvent.change(
      screen.getByLabelText('Upload Setup diagram and description'),
      { target: { files: [file] } },
    )

    await waitFor(() =>
      expect(entityFilesApi.uploadEntityFile).toHaveBeenCalledWith('token', {
        file,
        note: 'Reactor geometry',
      }),
    )
  })
})
