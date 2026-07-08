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
  validation: {
    required: 'This field is required',
  },
  entityLibrary: {
    materialLot: {
      name: 'Material lot',
      subtitle:
        'Register chemical / substrate / gas-cylinder lots for experiments to reference by (lot, version).',
    },
    setup: {
      name: 'Setup',
      subtitle:
        'Register CVD furnace setups for experiments to reference by (setup, version).',
    },
    instrument: {
      name: 'Instrument',
      subtitle:
        'Register characterization instruments for records to reference by (instrument, version).',
    },
    nav: {
      group: 'Entity libraries',
      materialLot: 'Material lots',
      setup: 'Setups',
      instrument: 'Instruments',
    },
    columns: {
      name: 'Name',
      code: 'Code',
      version: 'Current version',
      updatedAt: 'Updated at',
      actions: 'Actions',
    },
    actions: {
      create: 'New',
      viewDetail: 'View detail',
      editAsNewVersion: 'Edit (new version)',
      backToList: 'Back to list',
    },
    list: {
      empty: 'No records yet — use “New” in the top-right corner.',
      loadError: 'Failed to load',
    },
    detail: {
      currentVersion: 'Current version',
      versionHistory: 'Version history',
      versionLabel: 'v{{version}}',
      createdAt: 'Created at',
      updatedAt: 'Updated at',
      notFound: 'Entity record not found.',
      loadError: 'Failed to load',
      viewingHistorical: 'Viewing historical version v{{version}} (read-only)',
      backToCurrent: 'Back to current version',
      emptyValue: '—',
    },
    form: {
      createTitle: 'New {{name}}',
      newVersionTitle: 'Edit {{name}} (new version)',
      requiredHint: 'Fields marked * are required to submit.',
      newVersionBanner:
        'Saving creates v{{version}}; the previous version stays unchanged and existing references are unaffected.',
      selectPlaceholder: 'Select',
      inputPlaceholder: 'Enter a value',
      createSuccess: 'Created (v1)',
      newVersionSuccess: 'Saved as v{{version}}',
      submitError: 'Failed to save',
    },
  },
} as const
