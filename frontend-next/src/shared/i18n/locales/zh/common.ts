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
} as const
