import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  GasFeedsEditor,
  deriveGasFlowShareSegments,
  gasFeedsAreValid,
  materialLotMatchesGas,
  snapshotPurity,
} from './gas-feeds-editor'
import type { GasFeed, GasFeedsEditorLabels } from './gas-feeds-editor'

vi.mock('./entity-reference-select', () => ({
  EntityReferenceSelect: ({
    onChange,
    triggerId,
    filter,
  }: {
    onChange: (id: string, entity: unknown) => void
    triggerId?: string
    filter?: (entity: unknown) => boolean
  }) => (
    <button
      id={triggerId}
      type="button"
      onClick={() => {
        const entities = [
          {
            id: 'argon-lot',
            latest_version: {
              version: 3,
              data: {
                lot_category: 'gas_cylinder',
                substance_name: 'Argon',
                chemical_formula: 'Ar',
              },
            },
          },
          {
            id: 'ammonia-lot',
            latest_version: {
              version: 2,
              data: {
                lot_category: 'gas_cylinder',
                substance_name: 'NH3',
                chemical_formula: 'NH3',
                attrs: { purity: 99.995, gas_purity_grade: '5N' },
              },
            },
          },
        ]
        const entity = entities.find((candidate) => filter?.(candidate) ?? true)
        onChange(entity?.id ?? '', entity ?? null)
      }}
    >
      Select lot
    </button>
  ),
}))

const labels: GasFeedsEditorLabels = {
  addFeed: 'Add gas',
  feed: (position) => `Gas ${position}`,
  species: 'Species',
  selectSpecies: 'Select species',
  speciesOptions: {
    Ar: 'Argon',
    N2: 'Nitrogen',
    H2: 'Hydrogen',
    O2: 'Oxygen',
    CH4: 'Methane',
    other: 'Other gas',
  },
  otherGasName: 'Other gas name',
  lotReference: 'Gas lot',
  purity: 'Purity',
  measurementSource: 'Measurement source',
  selectMeasurementSource: 'Select measurement source',
  measurementSourceOptions: {
    mfc: 'MFC',
    rotameter: 'Rotameter',
    other: 'Other source',
  },
  otherMeasurementSource: 'Other source name',
  addInterval: 'Add interval',
  interval: (position) => `Interval ${position}`,
  startMinutes: 'Start (min)',
  endMinutes: 'End (min)',
  flowSccm: 'Flow (sccm)',
  removeFeed: 'Remove gas',
  removeInterval: 'Remove interval',
  moveUp: 'Move up',
  moveDown: 'Move down',
  flowShareTitle: 'Gas flow share',
  flowShareDescription: 'Derived from supply intervals.',
  flowShareInterval: 'Time interval',
  flowShareComposition: 'Gas, flow, and share',
}

function Wrapper({ initial = [] }: { initial?: GasFeed[] }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <GasFeedsEditor
        value={value}
        onChange={setValue}
        showErrors
        labels={labels}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  )
}

function topRows(container: HTMLElement): HTMLFieldSetElement[] {
  return Array.from(
    container.querySelectorAll(
      ':scope > div:first-child > fieldset[data-row-id]',
    ),
  )
}

const argon: GasFeed = {
  species: 'Ar',
  lot_ref: {
    entity_id: 'argon-lot',
    version: 1,
    snapshot: {
      lot_category: 'gas_cylinder',
      chemical_formula: 'Ar',
      purity: 99.999,
    },
  },
  measurement_source: 'mfc',
  intervals: [{ start_min: 0, end_min: 30, flow_sccm: 80 }],
}

const hydrogen: GasFeed = {
  species: 'H2',
  lot_ref: {
    entity_id: 'hydrogen-lot',
    version: 2,
    snapshot: {
      lot_category: 'gas_cylinder',
      chemical_formula: 'H2',
      gas_purity_grade: '5N',
    },
  },
  measurement_source: 'rotameter',
  intervals: [{ start_min: 0, end_min: 30, flow_sccm: 10 }],
}

describe('GasFeedsEditor', () => {
  it('captures a gas, frozen lot snapshot and one or more typed intervals', async () => {
    const user = userEvent.setup()
    render(<Wrapper />)

    await user.click(screen.getByRole('button', { name: 'Add gas' }))
    await user.click(screen.getByRole('combobox', { name: 'Species' }))
    await user.click(screen.getByRole('option', { name: 'Other gas' }))
    await user.type(screen.getByLabelText('Other gas name'), 'NH3')
    await user.click(screen.getByRole('button', { name: 'Gas lot' }))
    expect(screen.getByText('Purity: 99.995% · 5N')).toBeInTheDocument()

    await user.click(
      screen.getByRole('combobox', { name: 'Measurement source' }),
    )
    await user.click(screen.getByRole('option', { name: 'Other source' }))
    await user.type(screen.getByLabelText('Other source name'), 'Bubble meter')
    await user.type(screen.getByLabelText('Start (min)'), '5')
    await user.type(screen.getByLabelText('End (min)'), '25')
    await user.type(screen.getByLabelText('Flow (sccm)'), '12.5')

    const value = JSON.parse(
      screen.getByTestId('value').textContent ?? '',
    ) as GasFeed[]
    expect(value).toEqual([
      {
        species: 'other',
        other_name: 'NH3',
        lot_ref: {
          entity_id: 'ammonia-lot',
          version: 2,
          snapshot: {
            lot_category: 'gas_cylinder',
            substance_name: 'NH3',
            chemical_formula: 'NH3',
            attrs: { purity: 99.995, gas_purity_grade: '5N' },
          },
        },
        measurement_source: 'other',
        measurement_source_other: 'Bubble meter',
        intervals: [{ start_min: 5, end_min: 25, flow_sccm: 12.5 }],
      },
    ])
    expect(gasFeedsAreValid(value)).toBe(true)
  })

  it('preserves feed identity while changing order', async () => {
    const user = userEvent.setup()
    const { container } = render(<Wrapper initial={[argon, hydrogen]} />)
    const before = topRows(container).map((row) => row.dataset.rowId)

    await user.click(
      within(topRows(container)[0]).getAllByRole('button', {
        name: 'Move down',
      })[0],
    )

    const value = JSON.parse(
      screen.getByTestId('value').textContent ?? '',
    ) as GasFeed[]
    expect(value.map((feed) => feed.species)).toEqual(['H2', 'Ar'])
    expect(topRows(container).map((row) => row.dataset.rowId)).toEqual([
      before[1],
      before[0],
    ])
  })

  it('rejects overlapping intervals and incomplete conditional names', () => {
    expect(
      gasFeedsAreValid([
        {
          ...argon,
          intervals: [
            { start_min: 0, end_min: 20, flow_sccm: 80 },
            { start_min: 10, end_min: 30, flow_sccm: 80 },
          ],
        },
      ]),
    ).toBe(false)
    expect(
      gasFeedsAreValid([{ ...argon, species: 'other', other_name: '' }]),
    ).toBe(false)
  })

  it('derives and displays shares for every flow boundary', () => {
    const segments = deriveGasFlowShareSegments([
      {
        ...argon,
        intervals: [
          { start_min: 0, end_min: 10, flow_sccm: 80 },
          { start_min: 20, end_min: 30, flow_sccm: 60 },
        ],
      },
      {
        ...hydrogen,
        intervals: [{ start_min: 5, end_min: 25, flow_sccm: 10 }],
      },
    ])

    expect(
      segments.map((segment) => [
        segment.start_min,
        segment.end_min,
        segment.shares.map((share) => [
          share.species,
          share.flow_sccm,
          Number(share.percent.toFixed(2)),
        ]),
      ]),
    ).toEqual([
      [0, 5, [['Ar', 80, 100]]],
      [
        5,
        10,
        [
          ['Ar', 80, 88.89],
          ['H2', 10, 11.11],
        ],
      ],
      [10, 20, [['H2', 10, 100]]],
      [
        20,
        25,
        [
          ['Ar', 60, 85.71],
          ['H2', 10, 14.29],
        ],
      ],
      [25, 30, [['Ar', 60, 100]]],
    ])

    render(
      <GasFeedsEditor
        value={[argon, hydrogen]}
        onChange={() => undefined}
        labels={labels}
      />,
    )
    expect(screen.getByText('Gas flow share')).toBeInTheDocument()
    expect(
      screen.getByText('Argon: 80 sccm · 88.89%; Hydrogen: 10 sccm · 11.11%'),
    ).toBeInTheDocument()
  })

  it('handles empty, overlapping, and zero-flow intervals without failing', () => {
    expect(deriveGasFlowShareSegments([])).toEqual([])
    expect(
      deriveGasFlowShareSegments([
        {
          ...argon,
          intervals: [
            { start_min: 0, end_min: 10, flow_sccm: 20 },
            { start_min: 5, end_min: 15, flow_sccm: 30 },
          ],
        },
        {
          ...hydrogen,
          intervals: [{ start_min: 5, end_min: 10, flow_sccm: 50 }],
        },
      ])[1],
    ).toMatchObject({
      start_min: 5,
      end_min: 10,
      total_flow_sccm: 100,
      shares: [
        { species: 'Ar', flow_sccm: 50, percent: 50 },
        { species: 'H2', flow_sccm: 50, percent: 50 },
      ],
    })
    expect(
      deriveGasFlowShareSegments([
        {
          ...argon,
          intervals: [{ start_min: 0, end_min: 10, flow_sccm: 0 }],
        },
      ]),
    ).toEqual([])
  })

  it('reads nested purity and clears a lot when the selected identity changes', async () => {
    expect(
      snapshotPurity({
        entity_id: 'nested',
        version: 1,
        snapshot: { attrs: { purity: 99.999, gas_purity_grade: '6N' } },
      }),
    ).toBe('99.999% · 6N')
    expect(
      materialLotMatchesGas(
        {
          lot_category: 'gas_cylinder',
          attrs: { chemical_formula: 'N₂' },
        },
        'N2',
      ),
    ).toBe(true)

    const user = userEvent.setup()
    render(<Wrapper initial={[argon]} />)
    await user.click(screen.getByRole('combobox', { name: 'Species' }))
    await user.click(screen.getByRole('option', { name: 'Hydrogen' }))

    expect(outputValue()).toMatchObject([{ species: 'H2', lot_ref: null }])
  })
})

function outputValue(): GasFeed[] {
  return JSON.parse(screen.getByTestId('value').textContent ?? '') as GasFeed[]
}
