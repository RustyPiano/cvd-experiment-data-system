// en locale. Mirrors the key shape of zh/common.ts (the authoritative default).
// English UI polish is a post-v2.0 task (D12); keep keys in sync as文案 lands.
export const common = {
  actions: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    confirm: 'Confirm',
  },
  language: {
    zh: '中文',
    en: 'English',
    switch: 'Switch language',
  },
  example: {
    greeting: 'Hello, world',
  },
} as const
