import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

const storageValues = new Map<string, string>()
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storageValues.get(key) ?? null,
    setItem: (key: string, value: string) => storageValues.set(key, value),
    removeItem: (key: string) => storageValues.delete(key),
    clear: () => storageValues.clear(),
  },
})

// jsdom 缺少 Radix（Popover 等）依赖的若干浏览器 API，补齐 no-op 实现，
// 否则组件级测试会在挂载时抛错。
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
const elementProto = globalThis.Element?.prototype
if (elementProto) {
  elementProto.scrollIntoView ??= () => {}
  elementProto.hasPointerCapture ??= () => false
  elementProto.setPointerCapture ??= () => {}
  elementProto.releasePointerCapture ??= () => {}
}

// CI 机器较慢，waitFor/findBy 默认 1s 不够；超时的保存会串到下一个用例。
configure({ asyncUtilTimeout: 5000 })

// RTL 自动清理 DOM。
afterEach(() => {
  cleanup()
  storageValues.clear()
})
