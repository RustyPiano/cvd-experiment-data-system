import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@/shared/i18n'
import {
  emptyPeakSeries,
  peakSeriesIssue,
  peakSeriesValue,
  SpectralPeaksEditor,
} from './spectral-peaks-editor'

describe('objective spectral peaks', () => {
  it('requires a source when multiple spectra are uploaded and rejects zero width', () => {
    const value = {
      ...emptyPeakSeries('cm⁻¹'),
      status: 'recorded' as const,
      peaks: [
        {
          id: 1,
          position: '-20',
          fwhm: '2',
          height: '',
          area: '',
          d_spacing_nm: '',
        },
      ],
    }
    expect(peakSeriesIssue(value, [0, 1], 'Raman')).toBe('sourceRequired')
    expect(peakSeriesIssue(value, [0], 'Raman')).toBeNull()
    expect(peakSeriesValue(value, [0], ['raw']).peaks[0].position).toBe(-20)
    expect(peakSeriesValue(value, [0], ['raw'])).not.toHaveProperty(
      'extraction_method',
    )
    expect(peakSeriesValue(value, [0], ['raw'])).not.toHaveProperty(
      'baseline_method',
    )
    expect(
      peakSeriesIssue(
        { ...value, peaks: [{ ...value.peaks[0], fwhm: '0' }] },
        [0],
        'Raman',
      ),
    ).toBe('invalidPeak')
  })

  it('does not relabel existing PL numbers when changing units', async () => {
    await i18n.changeLanguage('zh')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    function Form() {
      const [value, setValue] = useState(emptyPeakSeries('nm'))
      return (
        <SpectralPeaksEditor
          value={value}
          onChange={setValue}
          units={['nm', 'eV']}
          method="PL"
          rawFiles={[]}
          rawIndexes={[]}
          disabled={false}
        />
      )
    }
    const user = userEvent.setup()
    render(<Form />)
    await user.click(screen.getByRole('button', { name: '添加峰' }))
    await user.type(screen.getByLabelText('峰 1 峰位 (nm)'), '650')
    await user.click(screen.getByLabelText('峰位单位'))
    await user.click(screen.getByRole('option', { name: 'eV' }))
    expect(screen.getByLabelText('峰 1 峰位 (nm)')).toHaveValue(650)
    confirm.mockReturnValue(true)
    await user.click(screen.getByLabelText('峰位单位'))
    await user.click(screen.getByRole('option', { name: 'eV' }))
    expect(screen.queryByLabelText(/峰 1 峰位/)).toBeNull()
    confirm.mockRestore()
  })
  it('keeps blank, explicit non-detection, and recorded peaks distinct', async () => {
    await i18n.changeLanguage('zh')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    function Form() {
      const [value, setValue] = useState(emptyPeakSeries('cm⁻¹'))
      return (
        <>
          <output data-testid="peak-draft">{JSON.stringify(value)}</output>
          <SpectralPeaksEditor
            value={value}
            onChange={setValue}
            units={['cm⁻¹']}
            method="Raman"
            rawFiles={[new File(['raw'], 'spectrum.txt')]}
            rawIndexes={[0]}
            disabled={false}
          />
        </>
      )
    }
    const user = userEvent.setup()
    render(<Form />)
    const draft = () => JSON.parse(screen.getByTestId('peak-draft').textContent)
    const absent = screen.getByRole('checkbox', { name: '未检出可分辨峰' })
    expect(draft().status).toBe('')
    expect(screen.queryByLabelText('峰提取状态')).toBeNull()
    await user.click(absent)
    expect(draft().status).toBe('not_detected')
    await user.click(absent)
    expect(draft().status).toBe('')
    await user.click(absent)
    await user.click(screen.getByRole('button', { name: '添加峰' }))
    expect(absent).not.toBeChecked()
    expect(draft().status).toBe('recorded')
    await user.type(screen.getByLabelText('峰 1 峰位 (cm⁻¹)'), '385')
    await user.click(absent)
    expect(confirm).toHaveBeenCalled()
    expect(draft().peaks).toHaveLength(1)
    confirm.mockReturnValue(true)
    await user.click(absent)
    expect(draft().status).toBe('not_detected')
    expect(draft().peaks).toEqual([])
    await user.click(screen.getByRole('button', { name: '添加峰' }))
    await user.click(screen.getByRole('button', { name: '删除峰 1' }))
    expect(draft().status).toBe('')
    expect(absent).not.toBeChecked()
    confirm.mockRestore()
  })
})
