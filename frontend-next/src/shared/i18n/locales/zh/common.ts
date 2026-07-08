// zh 默认 locale（权威）。新 UI 文案加在这里，禁止硬编码进组件（D12 红线）。
// 字段标签（labelZh/labelEn）不放这里——它们由生成器⑤从 field-source.yaml 产出，
// 见 src/shared/generated/field-metadata.ts。
export const common = {
  actions: {
    save: '保存',
    cancel: '取消',
    delete: '删除',
    confirm: '确认',
  },
  language: {
    zh: '中文',
    en: 'English',
    switch: '切换语言',
  },
  // 仅作 t() 使用范式的示例键，可在存量文案迁移时删除。
  example: {
    greeting: '你好，世界',
  },
} as const
