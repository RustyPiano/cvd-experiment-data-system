import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// RTL 自动清理 DOM（测试在 P6 补齐；此文件保证测试基建就绪）。
afterEach(() => {
  cleanup()
})
