import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import '@/shared/i18n'
import { EmptyState } from './empty-state'
import { LoadingState } from './loading-state'

describe('async state announcements', () => {
  it('exposes loading and empty states to assistive technology', () => {
    const loading = render(<LoadingState />)
    expect(screen.getByRole('status')).toHaveTextContent('正在加载')
    loading.unmount()

    render(<EmptyState description="暂无记录" />)
    expect(screen.getByRole('status')).toHaveTextContent('暂无记录')
  })
})
