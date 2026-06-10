import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

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

// RTL 自动清理 DOM。
afterEach(() => {
  cleanup()
})
