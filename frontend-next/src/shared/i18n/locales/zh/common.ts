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
  validation: {
    required: '此项为必填',
  },
  entityLibrary: {
    materialLot: {
      name: '物料批次',
      subtitle: '登记化学品/衬底/气瓶批次，供实验按（批次·版本）锁版引用。',
    },
    setup: {
      name: '装置',
      subtitle: '登记 CVD 炉体装置，供实验按（装置·版本）锁版引用。',
    },
    instrument: {
      name: '表征仪器',
      subtitle: '登记表征仪器，供表征记录按（仪器·版本）锁版引用。',
    },
    nav: {
      group: '一等实体库',
      materialLot: '物料批次',
      setup: '装置库',
      instrument: '表征仪器',
    },
    columns: {
      name: '名称',
      code: '编号',
      version: '当前版本',
      updatedAt: '更新时间',
      actions: '操作',
    },
    actions: {
      create: '新建',
      viewDetail: '查看详情',
      editAsNewVersion: '编辑（生成新版本）',
      backToList: '返回列表',
    },
    list: {
      empty: '暂无记录，点击右上角「新建」。',
      loadError: '加载失败',
    },
    detail: {
      currentVersion: '当前版本',
      versionHistory: '版本历史',
      versionLabel: 'v{{version}}',
      createdAt: '创建时间',
      updatedAt: '更新时间',
      notFound: '未找到该实体记录。',
      loadError: '加载失败',
      viewingHistorical: '正在查看历史版本 v{{version}}（只读）',
      backToCurrent: '回到当前版本',
      emptyValue: '—',
    },
    form: {
      createTitle: '新建{{name}}',
      newVersionTitle: '编辑{{name}}（生成新版本）',
      requiredHint: '带 * 为提交前必填。',
      newVersionBanner:
        '保存将生成 v{{version}}，不会修改旧版本；既有实验引用不受影响。',
      selectPlaceholder: '请选择',
      inputPlaceholder: '请输入',
      createSuccess: '已创建（v1）',
      newVersionSuccess: '已保存为 v{{version}}',
      submitError: '保存失败',
    },
  },
  // v2 实验录入表单（P4 §1–§4）。字段标签走 field-metadata，此处只放 UI chrome。
  experimentsV2: {
    status: { draft: '草稿', submitted: '已提交', locked: '已锁定', invalid: '已作废', resultMissing: '结果缺失' },
    banner: { locked: '该炉次已锁定，仅管理员解锁后可编辑。', invalid: '该炉次已作废，不可编辑。' },
    actions: {
      submit: '提交实验', lock: '锁定实验', unlock: '解锁实验', returnToDraft: '退回草稿', invalidate: '作废实验',
      success: '状态已更新', error: '状态更新失败', missingTitle: '请先补齐以下 R0 字段：',
      invalidateTitle: '作废实验', invalidateDescription: '请输入作废原因。', reason: '作废原因',
    },
    nav: 'v2 实验录入',
    r0: {
      badge: 'R0',
      tooltip: 'R0 最小可复现集字段',
    },
    new: {
      title: '新建实验（v2）',
      subtitle: '按 v2 元数据标准录入炉次；填好 §1 即可创建并保存草稿。',
    },
    edit: {
      title: '编辑实验（v2）',
      subtitle: '可分模块保存草稿。',
      loadError: '加载实验失败',
    },
    list: {
      title: 'v2 实验记录',
      subtitle: '按 v2 元数据标准（cvd_v2）录入的炉次。',
      create: '新建实验',
      empty: '暂无 v2 实验，点击右上角「新建实验」。',
      loadError: '加载失败',
      edit: '编辑',
      columns: {
        runCode: '炉次编号',
        materialSystem: '材料体系',
        date: '实验日期',
        status: '状态',
        actions: '操作',
      },
    },
    form: {
      requiredHint: '带 * 为提交前必填；R0 为最小可复现集字段。',
      selectPlaceholder: '请选择',
      inputPlaceholder: '请输入',
      removeItem: '删除该条目',
      saveModule: '保存本模块',
      moduleSaved: '已保存',
      moduleSaveSuccess: '模块已保存',
      saveError: '保存失败',
      fixRequired: '请先补齐必填项',
      selectSetupFirst: '请先选择装置',
      createAction: '创建并保存草稿',
      createSuccess: '已创建炉次',
      createError: '创建失败',
      editingRun: '炉次：{{runCode}}',
    },
    formula: {
      parsedElements: '识别元素：{{elements}}',
      unknownSymbols: '非法元素符号：{{symbols}}',
      noElement: '未识别到有效元素符号',
    },
    components: {
      add: '新增组分',
      remove: '删除组分',
      empty: '尚无组分。',
      requiredHint: '结构类型≠本征时至少需一条组分。',
      formula: '化学式',
      role: '角色',
      concentration: '浓度(at%)',
      layerOrder: '层序',
    },
    reference: {
      placeholder: '请选择引用',
      empty: '实体库暂无可引用记录。',
      goToLibrary: '前往实体库登记',
    },
    sections: {
      basicInfo: {
        title: '基本信息',
        subtitle:
          '实验时间、合成方法、实验人等。合成方法决定后续 PVD 区块显隐。',
      },
      targetProduct: {
        title: '目标产物',
        subtitle:
          '结构类型判别复合体系；化学式带元素校验，显示串按渲染规则派生。',
        displayPreview: '显示串预览',
        displayNote: '与后端 formula_display 规则保持一致，待组内确认。',
      },
      equipment: {
        title: '设备',
        subtitle: '引用装置库中的装置；投影字段随引用冻结。',
        frozenNote:
          '以下为被引用装置 v{{version}} 的快照投影，随引用冻结（只读）。',
      },
      precursors: {
        title: '前驱体',
        subtitle: '可重复条目；相态决定用量是否必填、固态源展示外观描述。',
        add: '新增前驱体',
        empty: '尚无前驱体条目。',
        item: '前驱体 {{position}}',
      },
      substrates: {
        title: '衬底',
        subtitle: '可重复条目；衬底材料=SiO₂/Si 时展示并必填氧化层厚度。',
        add: '新增衬底',
        empty: '尚无衬底条目。',
        item: '衬底 {{position}}',
      },
      processSteps: {
        title: '过程步',
        subtitle:
          '每步先选阶段类型，随后只显示该阶段对应参数组字段；步序可上下移动。',
        add: '新增过程步',
        empty: '尚无过程步。',
        item: '过程步 {{position}}',
        moveUp: '上移',
        moveDown: '下移',
      },
      processEvents: {
        title: '过程事件',
        subtitle: '异常/干预等事件，选填、轻量。',
        add: '新增事件',
        empty: '尚无过程事件。',
        item: '事件 {{position}}',
      },
      results: {
        title: '表征 · 实测产物',
        subtitle: '以样品为关联主键；表征记录与实测产物走各自端点。',
        newModeHint: '创建炉次后可在编辑页添加表征记录与实测产物。',
        noSamples: '本炉次尚无样品；先创建一个样品才能挂接表征与实测产物。',
        sample: '样品',
        sampleRole: '样品角色',
        addSample: '新增样品',
        sampleCreated: '样品已创建',
        roles: {
          top: '上层',
          bottom: '下层',
          product: '产物',
          control: '对照',
        },
        characterization: '表征记录',
        method: '表征类型',
        instrument: '仪器（引用）',
        rawDataHint: '原始数据文件上传后续接入（占位）。',
        addRecord: '新增表征记录',
        recordAdded: '表征记录已添加',
        noRecords: '尚无表征记录。',
        untitledRecord: '（未命名表征）',
        measured: '实测产物',
        addProduct: '新增实测产物',
        productAdded: '实测产物已添加',
        noProducts: '尚无实测产物。',
        untitledProduct: '（未命名产物）',
      },
      pvd: {
        title: 'PVD',
        subtitle: '仅当 §1 合成方法为 PVD 体系时出现；字段条件必填。',
      },
    },
  },
} as const
