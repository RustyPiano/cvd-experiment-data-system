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
  // v2 experiment entry form (P4 §1–§4). Field labels come from field-metadata.
  experimentsV2: {
    status: { draft: 'Draft', submitted: 'Submitted', locked: 'Locked', invalid: 'Invalid', resultMissing: 'Results missing' },
    banner: { locked: 'Process parameters are locked. Results can still be added.', invalid: 'This run is invalid and cannot be edited.' },
    actions: {
      submit: 'Submit experiment', lock: 'Lock experiment', unlock: 'Unlock experiment', returnToDraft: 'Return to draft', invalidate: 'Invalidate experiment',
      success: 'Status updated', error: 'Failed to update status', missingTitle: 'Complete these R0 fields first:',
      invalidateTitle: 'Invalidate experiment', invalidateDescription: 'Enter the reason for invalidation.', reason: 'Invalidation reason',
    },
    nav: 'v2 experiment entry',
    r0: {
      badge: 'R0',
      tooltip: 'R0 minimal reproducible set field',
    },
    new: {
      title: 'New experiment (v2)',
      subtitle:
        'Record a run per the v2 metadata standard; fill §1 to create and save a draft.',
    },
    edit: {
      title: 'Edit experiment (v2)',
      subtitle: 'Drafts can be saved per module.',
      loadError: 'Failed to load experiment',
    },
    list: {
      title: 'v2 experiments',
      subtitle: 'Runs recorded under the v2 metadata standard (cvd_v2).',
      create: 'New experiment',
      empty: 'No v2 experiments yet — use “New experiment” in the top-right.',
      loadError: 'Failed to load',
      edit: 'Edit',
      columns: {
        runCode: 'Run code',
        materialSystem: 'Material system',
        date: 'Date',
        status: 'Status',
        actions: 'Actions',
      },
    },
    form: {
      requiredHint:
        'Fields marked * are required to submit; R0 marks minimal-reproducible-set fields.',
      selectPlaceholder: 'Select',
      inputPlaceholder: 'Enter a value',
      removeItem: 'Remove this item',
      saveModule: 'Save this module',
      moduleSaved: 'Saved',
      moduleSaveSuccess: 'Module saved',
      saveError: 'Failed to save',
      fixRequired: 'Please complete the required fields first',
      selectSetupFirst: 'Select a setup first',
      createAction: 'Create and save draft',
      createSuccess: 'Run created',
      createError: 'Failed to create',
      editingRun: 'Run: {{runCode}}',
    },
    formula: {
      parsedElements: 'Elements: {{elements}}',
      unknownSymbols: 'Invalid element symbols: {{symbols}}',
      noElement: 'No valid element symbol recognized',
    },
    components: {
      add: 'Add component',
      remove: 'Remove component',
      empty: 'No components yet.',
      requiredHint:
        'At least one component is required when structure type ≠ intrinsic.',
      formula: 'Formula',
      role: 'Role',
      concentration: 'Concentration (at%)',
      layerOrder: 'Layer order',
    },
    reference: {
      placeholder: 'Select a reference',
      empty: 'No entities to reference yet.',
      goToLibrary: 'Register in the entity library',
    },
    sections: {
      basicInfo: {
        title: 'Basic info',
        subtitle:
          'Time, synthesis method, operator, etc. Synthesis method drives the later PVD block.',
      },
      targetProduct: {
        title: 'Target product',
        subtitle:
          'Structure type discriminates composite systems; formula is element-validated, display string is derived.',
        displayPreview: 'Display string preview',
        displayNote:
          'Consistent with the backend formula_display rule, pending group confirmation.',
      },
      equipment: {
        title: 'Equipment',
        subtitle:
          'Reference a setup from the library; projected fields are frozen on reference.',
        frozenNote:
          'Below is the snapshot projection of referenced setup v{{version}}, frozen on reference (read-only).',
      },
      precursors: {
        title: 'Precursors',
        subtitle:
          'Repeatable items; phase state drives whether amount is required and shows appearance for solids.',
        add: 'Add precursor',
        empty: 'No precursor items yet.',
        item: 'Precursor {{position}}',
      },
      substrates: {
        title: 'Substrates',
        subtitle:
          'Repeatable items; oxide thickness is shown and required when material = SiO₂/Si.',
        add: 'Add substrate',
        empty: 'No substrate items yet.',
        item: 'Substrate {{position}}',
      },
      processSteps: {
        title: 'Process steps',
        subtitle:
          'Pick a stage type per step; only that stage’s parameter-group fields show. Steps can be reordered.',
        add: 'Add process step',
        empty: 'No process steps yet.',
        item: 'Step {{position}}',
        moveUp: 'Move up',
        moveDown: 'Move down',
      },
      processEvents: {
        title: 'Process events',
        subtitle: 'Anomalies / interventions; optional and lightweight.',
        add: 'Add event',
        empty: 'No process events yet.',
        item: 'Event {{position}}',
      },
      results: {
        title: 'Characterization · measured products',
        subtitle:
          'Keyed by sample; characterization records and measured products use their own endpoints.',
        newModeHint:
          'Add characterization records and measured products on the edit page after creating the run.',
        noSamples:
          'This run has no samples yet; create a sample to attach characterization and measured products.',
        sample: 'Sample',
        sampleRole: 'Sample role',
        addSample: 'Add sample',
        sampleCreated: 'Sample created',
        roles: {
          top: 'Top',
          bottom: 'Bottom',
          product: 'Product',
          control: 'Control',
        },
        characterization: 'Characterization records',
        method: 'Method',
        instrument: 'Instrument (reference)',
        uploadAttachmentLabel: 'Upload attachment for {{method}}',
        downloadAttachment: 'Download',
        downloadAttachmentLabel: 'Download {{filename}}',
        deleteAttachment: 'Delete',
        deleteAttachmentLabel: 'Delete {{filename}}',
        deleteAttachmentTitle: 'Delete attachment?',
        deleteAttachmentDescription:
          'Soft-delete {{filename}} while retaining its audit trail and stored evidence.',
        cancelDeleteAttachment: 'Cancel',
        confirmDeleteAttachment: 'Delete attachment',
        attachmentUploadError: 'Attachment upload failed',
        attachmentDownloadError: 'Attachment download failed',
        attachmentDeleteError: 'Attachment deletion failed',
        addRecord: 'Add characterization record',
        recordAdded: 'Characterization record added',
        noRecords: 'No characterization records yet.',
        untitledRecord: '(untitled record)',
        measured: 'Measured products',
        addProduct: 'Add measured product',
        productAdded: 'Measured product added',
        noProducts: 'No measured products yet.',
        untitledProduct: '(untitled product)',
      },
      pvd: {
        title: 'PVD',
        subtitle:
          'Shown only when the §1 synthesis method is a PVD family; fields are conditionally required.',
      },
    },
  },
} as const
