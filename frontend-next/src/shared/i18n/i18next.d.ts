// 模块增强：让 t() 的键在编译期受 zh 资源约束（D12）。
import type { defaultNS, resources } from './index'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS
    resources: (typeof resources)['zh']
  }
}
