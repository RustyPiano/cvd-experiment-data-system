# 字段名称、前端文字与分类体系审核

审核日期：2026-09-20—2026-09-21。对象：`ac4a25b` 加 `v4.0-alpha.48` 工作区修改。

**当前系统尚未达到全部术语含义明确、分类平行且完整的要求。确认 30 项语义、分类或一致性问题，另列 4 项文字精确化建议。** 主要问题是分类维度交叉、量的定义不完整、界面名称遗漏限定条件，以及不同页面对同一概念的表述不一致。

“保存”“取消”“其他说明”等操作文字使用准确的普通语言即可。科学对象、物理量、方法名称和分类选项需要专业定义。是否属于自行杜撰，不能仅凭词语不够常见判断；本报告具体指出词义、分类依据和实际使用中存在的冲突。

## 1. 覆盖范围与判定方法

核对内容包括字段中英文名称、含义、选项、单位、示例、提示、适用条件，以及实际表单、详情和词语映射。针对每组分类检查：分类依据是否统一；同一对象是否存在多种无法区分的选择；有效对象是否有入口；未知状态是否被错误归入已知类别。多选项目允许同时成立的属性并存。

### 字段与界面覆盖

| 审核对象 | 数量与范围 |
|---|---|
| 实验字段源 | 126 项；91 项进入现行生成元数据，35 项为未发布或历史定义 |
| 基础实体字段源 | 67 项：物料批次 36、实验装置 21、表征仪器 10；55 项进入现行生成元数据 |
| 表征条件 | 10 个方法定义、314 项条件；279 项具有新录入资格，其余为字段级或方法级历史定义 |
| 表征结果 | 26 项结果定义；同时核对当前结果编辑器的实际使用范围 |
| 表征选项与设备配置 | 64 个现行选择字段的全部选项，以及 OM、Raman、PL、SHG 四套配置中的 13 个分组 |
| 其他字段定义 | `scientific_contract`、气体种类、晶面候选、共享中英文选项、结构化编辑器子字段 |
| 中英文公共文案 | 每种语言 1,468 项，共 2,936 项；两种语言的键集合一致 |
| 前端直接显示文字 | 对排除 `.test.` 文件及 `generated/`、`locales/` 目录后的 141 个 TS/TSX 文件作语法树提取；检查 837 处含中文的字符串或 JSX 文本、74 个中文模板片段、20 处直接写入 JSX 或显示属性的英文文字 |
| 结构化显示标签 | 完整读取 `structured-editor-labels.ts` 的 509 行，并核对相关调用 |

141 个文件的提取结果包含领域别名和旧组件，数量不等于当前页面可见文案数量。问题表中的前端项目均另外核对了实际调用。未进行生产环境或浏览器逐页渲染检查；后台运行时临时返回的自由文本不属于本次静态文案清单。

### 制备字段覆盖

| 模块 | 全部定义 | 现行生成元数据 |
|---|---:|---:|
| 基本信息 | 10 | 10 |
| 目标产物 | 12 | 12 |
| 实验装置与设计 | 19 | 19 |
| 前驱体装载 | 16 | 14 |
| 衬底 | 20 | 14 |
| 实验过程 | 21 | 10 |
| 过程事件 | 12 | 12 |
| 旧扁平结果 | 10 | 0 |
| PVD 占位定义 | 6 | 0 |
| 合计 | 126 | 91 |

### 表征条件覆盖

| 方法 | 全部条件定义 | 具有新录入资格 |
|---|---:|---:|
| 光学显微镜（OM） | 39 | 36 |
| Raman 光谱 | 41 | 38 |
| 低频 Raman 历史入口 | 6 | 0 |
| 光致发光（PL） | 54 | 49 |
| 原子力显微镜（AFM） | 20 | 20 |
| 扫描电子显微镜（SEM） | 32 | 30 |
| X 射线衍射（XRD） | 23 | 22 |
| 透射电子显微镜（TEM） | 41 | 40 |
| 其他方法 | 3 | 3 |
| 二次谐波产生（SHG） | 55 | 41 |
| 合计 | 314 | 279 |

279 项还受仪器配置、采集方式和条件选择控制，不会同时显示。当前新记录使用 Raman 入口；旧低频 Raman 仪器能力可以匹配这个入口。历史条件有 29 项字段级标记，另有整个低频 Raman 入口的 6 项。

## 2. 制备字段：8 项

### P01 气体分类缺少有效入口，并混用分类依据

**位置：**[气体种类选择](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/experiments-v2/simple-preparation-editors.tsx:3438)、[实际选项](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/experiments-v2/simple-preparation-editors.tsx:3468)、[气瓶匹配](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/experiments-v2/components/reference-snapshot.ts:48)。

“气体种类”并列 9 种化学物种和“预混气”，没有“其他”。预混气描述供应组成类别。基础资料允许登记其他具名气体，当前生长条件却无法选择这些单组分气瓶。只读函数验证中，单组分 HCl 气瓶对现有 10 个选项全部匹配失败，对 `other + HCl` 匹配成功。

**建议：**直接选择气瓶批次并展示已登记的组成。保留分类筛选时，使用“单组分气体／预混气”，单组分下允许选择现有物种或其他具名物种。

### P02 结构形式混用分类维度，且缺少组合关系

**位置：**[结构形式选项](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/experiments-v2/simple-target-editor.tsx:676)、[结构映射](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/experiments-v2/simple-preparation-editors.tsx:346)。

“单一区域”描述数据中区域的数量，“垂直堆叠／横向拼接”描述空间关系和连接方式，三者没有统一的分类依据。“堆叠／拼接”也没有明确结构对象是否为异质结构。字段源和后端支持的 `mixed_architecture` 在这里被归为 `single`，造成组合关系无法准确显示。

二维异质结构文献使用 lateral、in-plane、vertical 等术语。“横向／垂直”有专业文献依据；中文界面采用“面内／面外”可以明确以材料层面为参照。Gong 等的原始研究区分了层间堆叠与同一层内的边缘连接。[原论文](https://www.nature.com/articles/nmat4091)、[研究机构对该论文的介绍](https://www.ornl.gov/publication/vertical-and-plane-heterostructures-ws2mos2-monolayers)。

**建议：**对于异质结构目标，字段使用“异质结构类型”，采用“面内异质结构（lateral / in-plane heterostructure）”“面外异质结构（vertical / out-of-plane heterostructure）”。没有异质结构的目标不参与这组分类；区域数量由材料记录表达，不能单凭区域数量认定同质或异质。面内与面外关系同时存在时分别记录，保留组合关系。[组合结构的原始研究预印本，结果 §2.1 与图 1](https://arxiv.org/pdf/2602.02871)。

### P03 “目标晶体结构”遗漏参考体相限定

**位置：**[界面标签](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/experiments-v2/components/target-bulk-phase-select.tsx:29)、[字段源定义](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:5854)。

字段源定义的是参考体相空间群；常见候选界面却只写“目标晶体结构”，显示如 `2H · P6₃/mmc · No. 194`，同一表单还允许目标层数为 1。这个限定缺失会使体相空间群被理解为目标单层的实际对称性。2H、3R 体相的层间堆垛与孤立单层应分别讨论。[原始研究中的结构说明](https://www.nature.com/articles/lsa2016131)。

**建议：**统一写“参考体相／多型及空间群”，并说明“空间群描述参考体相；目标层数另行记录”。

### P04 掺杂含量缺少组成单元与计量基准

**位置：**[目标掺杂含量与单位](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/experiments-v2/simple-target-editor.tsx:515)、[后端组成关系](/Users/rustypiano/项目/CVD实验数据采集系统/backend/app/schemas/scientific.py:174)。

只给出 `at.%`、`mol.%` 和掺杂位点，未说明计量基准。原子分数、某一类晶格位点的占有分数和以化学式单元计算的比例不能混用。例如 Nb₀.₀₁Mo₀.₉₉S₂ 中，Nb 占金属位点 1%，占全部原子约 0.333%。原始研究确实存在将 atomic percent 明确定义为相对于主体 Mo 位点的用法，因此不能仅凭 at.% 自动推断分母。[Nb 掺杂 MoS₂ 原始研究，Results](https://pmc.ncbi.nlm.nih.gov/articles/PMC5768716/)。物质的量分数也必须明确组成实体。[IUPAC 定义](https://goldbook.iupac.org/terms/view/A00296/plain)。

**建议：**含量同时记录表示方式和计量基准，明确分母是全部原子、指定子晶格位点，还是其他已定义的组成单元。`at.%` 与 `mol.%` 均不能替代这项定义。

### P05 掺杂占位、空间位置与记录状态混为一组分类

**位置：**[分组逻辑](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/experiments-v2/simple-target-editor.tsx:107)、[未指定与其他选项](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/experiments-v2/simple-target-editor.tsx:567)。

所有不以 `_site` 结尾的代码都被放入“非取代位点”，其中包括“间隙位点／层间位置／表面位置／未指定／其他”。这些选项涉及不同概念：

| 概念 | 专业含义 | 对当前分类的影响 |
|---|---|---|
| 替位掺杂，也称取代掺杂（substitutional doping） | 掺杂原子替代主体晶格中的原子 | 应明确替代的主体元素及已知晶格位置；不能仅靠字符串后缀确定科学分类 |
| 间隙掺杂（interstitial doping） | 掺杂原子占据主体晶格间隙 | 层状晶体的层间位置也可能属于间隙，不能与“层间”预设为互斥类别 |
| 表面、层间 | 空间位置 | 表面可以发生替位；这两个位置不能直接归为“非取代” |
| 插层、表面吸附 | 掺入或吸附过程及相应结构关系 | 需要与具体占位分别说明，不能仅凭“层间／表面”推断机制 |
| 未指定、其他 | 记录状态或现有词表未覆盖的描述 | 不归入任何已知占位类别 |

原始计算研究将层间四面体和八面体位置称为间隙位点，又用插层描述层间掺入。[原论文，正文 II、III.B 与图 1](https://arxiv.org/pdf/0806.1411)。原研究团队还直接报道了 Te 薄膜的表面 Se 替位掺杂，证明“表面”与“替位”可以同时成立。[中国科学院物理所，PRL 133, 236201 对应研究](https://iop.cas.cn/xwzx/kydt/202412/t20241213_7456832.html)。另一项原始研究明确区分替代 Mo/S 原子与吸附于 Mo/S 原子上方、桥位或空心位。[原论文，正文 II 与图 1](https://arxiv.org/pdf/1304.8056)。

**建议：**对晶格掺杂记录“目标晶格占位”，使用“替位／间隙”等有依据的类型；替位时再记录“被替代的主体元素”，需要具体不等价位点时依据已知晶体结构填写。表面、层间等空间位置另行描述，并允许与占位信息同时记录。插层和表面吸附按实际目标关系说明。“未指定”作为记录状态独立保留。

所有填写内容表达制备目标；实测占位结论需要表征证据。

### P06 异常处理结果混合恢复状态与实验终止

**位置：**[处理结果](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/experiments-v2/simple-preparation-editors.tsx:4459)。

单选“已恢复／部分恢复／实验终止／不确定”包含两种维度。部分恢复后仍可终止，未恢复时也可能继续运行；“未恢复”没有选项。

**建议：**分别记录“异常恢复状态”和“实验是否终止”。恢复状态至少区分已恢复、部分恢复、未恢复、不确定及未记录；不适用时明确表达。

### P07 名称未准确表达设定值与仪器类别

**位置：**[流量测量方式](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/experiments-v2/simple-preparation-editors.tsx:3524)、[工作绝对压力](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/experiments-v2/simple-preparation-editors.tsx:3907)。

“流量测量方式”实际选择质量流量控制器（MFC）、浮子流量计等装置；选择 MFC 时保存 `source_type=setpoint`。下方数值标签已写“流量设定值”。“工作绝对压力”同样固定保存为设定值，但标签没有这个限定。

**建议：**分别使用“流量控制／测量装置”和“工作绝对压力设定值”。设定值与测量值的含义保持独立。[厂商对流量控制反馈的说明](https://www.bronkhorst.com/knowledge-base/flow-control-with-real-time-compensation/)。

### P08 标准体积流量缺少参考状态

**位置：**[流量单位选择](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/experiments-v2/simple-preparation-editors.tsx:3615)、[字段源中的转换约束](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:181)。

界面提供 `sccm/slm/mL/min/L/min`，但未找到标准体积流量的参考温度、绝对压力定义或填写入口。仅有单位不足以完整定义数值。厂商采用的参考条件可以调整；例如 Alicat 明确给出默认 25 ℃、1 atm，因此不能自行假设所有仪器采用同一条件。[Alicat 定义与参考状态](https://www.alicat.com/support/what-is-mass-flow/)。

**建议：**在仪器配置中保存参考温度与绝对压力，并随实验引用；字段说明区分标准体积流量和实际体积流量。

## 3. 基础资料：7 项

### E01 存储方式混合存放设备与环境条件

**位置：**[存储方式](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:7988)。

单选“干燥器／手套箱／常温避光／冷藏／其他”同时包含设备、温度和光照条件。手套箱存放与避光可以同时成立。选择“其他”能够写说明，但现有枚举无法按同一依据分类。

**建议：**名称统一为“储存条件”，分别表达存放设备、温度和气氛／避光条件，允许同时适用的条件共同记录。

### E02 装置来源混合制造来源与改造状态

**位置：**[装置来源](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:8447)、[自制装置信息的适用条件](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:8507)。

“商业设备／实验室自制／改造设备”不在同一维度。商业设备和自制设备都可以经过改造。选择“改造设备”后只能按原制造商、原型号填写，设计或建造单位及内部型号只对“实验室自制”开放，原始来源信息与改造状态无法同时完整表达。

**建议：**制造来源与是否改造分别记录；改造说明保留。原始来源使用“商业制造／实验室自制／其他”。

### E03 物料形态中的“靶”属于用途分类

**位置：**[物料形态](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:7950)。

“粉末／颗粒／块／液体／箔／靶／其他”作为方便选取的供货描述可以被理解，但无法直接作为同一维度的物理形态分类。“液体”描述物态，“粉末、箔”描述形态，“靶”描述用途；块状材料同时可以是靶材。

**建议：**物态、固体形态分别定义；靶材身份放在产品名称或用途说明中。若只保留供应商的供货描述，明确称为“供货形态（标签原文）”，不将其宣称为互斥的形态分类。

### E04 纯度数值不能保留规格限定与分析依据

**位置：**[纯度定义与提示](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:7925)、[数值模型](/Users/rustypiano/项目/CVD实验数据采集系统/backend/app/schemas/generated/v2_module_payload.py:951)。

“纯度（%）”只能保存一个数值，提示要求照录标签百分数，却未区分 `≥99.9%` 与实测 `99.9%`，也未在该量中表达总体含量与 trace metals basis 等依据。产品等级原文和附件能保留补充信息，但都是另行选填，不能由单独的数值恢复。厂商资料明确说明 trace metals basis 依赖所检测的金属杂质范围。[Sigma-Aldrich 原始说明](https://www.sigmaaldrich.com/VC/en/products/materials-science/energy-materials/high-purity-inorganics)。

**建议：**称“供应商声明纯度”，保留比较符号和标签中的分析依据原文。不同依据的数值不可直接当作相同指标比较。

### E05 气体组成强制使用 vol%，不能忠实保留 mole% 声明

**位置：**[气体组成及单位](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:8350)。

当前要求所有气瓶组成按体积分数录入。公开的气体分析证书实际存在以 Mole% 声明浓度的情况；该量是物质的量分数。即使在理想气体近似下数值可以相等，也不能在未声明近似和参考条件时改变证书量的含义。[Airgas／Agilent 原始批次分析证书](https://www.agilent.com/cs/library/certificateofanalysis/Part%20G3440-85017%20CofA%20Lot%20160-400827053-1.pdf)。

**建议：**记录组成表示依据，按证书保留“物质的量分数”或“体积分数”及单位。归一化的标称组成与杂质纯度继续分别解释。

### E06 “标称测温精度（±℃）”不够符合计量术语

**位置：**[温度传感器子字段](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/shared/i18n/locales/zh/common.ts:484)、[实体定义](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:8597)。

国际计量学词汇 VIM 将 measurement accuracy 作为定性概念，不给它赋予数值。当前直接填写 ±℃，实际需要说明的是哪种误差限或其他计量指标。“精度”也不能替代测量不确定度。[VIM 2.13](https://jcgm.bipm.org/vim/en/2.13.html)、[VIM 4.26 最大允许误差](https://jcgm.bipm.org/vim/en/4.26.html)。

**建议：**只有厂家明确给出误差限时，将数值项称为“厂家标称测温误差限（±℃）”，同时保留适用条件。不能从一个未说明含义的 Accuracy 数字自动推断误差限或不确定度。

### E07 最近校准与维护共用一个日期

**位置：**[最近校准或维护日期](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:8899)。

单个日期没有操作类型。记录后无法判断当天进行了校准还是维护，也无法同时保留两者各自的最近日期。校准需要建立测量标准与仪器示值的关系，维护记录本身不提供这项信息。[VIM 2.39](https://jcgm.bipm.org/vim/en/2.39.html)。

**建议：**分别显示“最近校准日期”和“最近维护日期”，或通过已有生命周期记录按操作类型分别展示。

## 4. 表征字段：8 项

### C01 尺度校准名称包含当前方法没有的衍射对象

**位置：**[AFM](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:3141)、[SEM](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:3359)、[OM 英文](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:1455)。

AFM、SEM 显示“图像/衍射尺度校准来源”。AFM 该字段针对横向尺度；当前 SEM 表单只提供二次电子、背散射电子和能谱采集，没有衍射分支。OM 的英文也保留了衍射表述。

**建议：**AFM 使用“横向尺寸校准依据”；OM 和当前 SEM 使用“图像像素尺度校准依据”。TEM 的图像与衍射分别采用对应名称。

### C02 通用文件说明把非光谱数据称为光谱

**位置：**[文件强度标签](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/experiments-v2/measurement-file-editor.tsx:100)、[详情标签](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/characterizations/measurement-details.tsx:566)、[通用上传提示](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/experiments-v2/simple-characterization-workspace.tsx:2213)。

SHG 相机与单通道信号同样显示“光谱强度单位”；所有方法的上传区域都提示保留“逐谱参数”，包括显微图像方法。

**建议：**通用路径使用“信号强度单位”“逐次采集参数”。确实针对光谱时保留光谱专用名称。

### C03 OM 自动方式的泛称与具体方式没有选择边界

**位置：**[曝光方式](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:1298)、[白平衡方式](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:1346)。

“自动”“一次自动后锁定”“连续自动”同时出现。“自动”未限定为方式未知，同一次连续自动采集可以被记入两种编码。官方相机文档明确区分 Once 和 Continuous。[Basler 曝光说明](https://docs.baslerweb.com/exposure-auto)、[白平衡说明](https://docs.baslerweb.com/balance-white-auto)。

**建议：**泛称明确为“自动（具体方式未记录）”；已知方式使用“一次自动后锁定”或“连续自动”。

### C04 温度条件混合实验条件与记录状态

**位置：**[Raman 温度条件](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:2070)、[PL 温度条件](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:2759)。

“室温、未控温／记录温度”分别描述实验条件和有无数值记录。室温且未控温也可以有温度记录；当前第一项会隐藏温度数值及来源。

**建议：**将字段明确为“温度记录”，选项写“室温未控温，未记录温度数值”“已记录温度数值”。已记录分支继续区分环境温度、样品台设定和样品实测。

### C05 XRD 扫描几何与扫描程序混在一个分类中

**位置：**[扫描几何](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:3555)。

“对称扫描／掠入射／摇摆曲线／面内扫描”混合几何和扫描程序。摇摆曲线可对应不同反射几何；现有 `scan_axis` 和 `axis_coupling` 已分别描述轴和联动。对相同 ω 单轴参数，现行校验允许 `symmetric` 与 `rocking_curve` 两种几何编码，未给出唯一选择规则。[Rigaku 原文 §4.1、图 8—10](https://rigaku.com/hubfs/2024%20Rigaku%20Global%20Site/Resource%20Hub/Knowledge%20Library/Rigaku%20Journals/Volume%2025%282%29%20-%20Summer%202009/RJ25-2_1.pdf?hsLang=en)。

**建议：**几何与扫描程序分别表达，摇摆测量结合实际扫描轴及联动方式描述。

### C06 STEM 暗场选项与 HAADF 未定义包含关系

**位置：**[成像模式](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:3931)。

扫描透射电子显微镜（STEM）分支提供“暗场”和“HAADF”。高角环形暗场（HAADF）属于暗场成像，泛称未限定为其他暗场或方式未细分。同一 HAADF 图像存在两种合理选法；两个编码均被现行校验接受。[JEOL STEM 术语说明](https://www.jeol.com/words/emterms/20121023.055058.php)。

**建议：**明确显示“高角环形暗场（HAADF）”与“其他或未细分暗场”。

### C07 PL 脉冲激发下的样品功率未定义为平均或峰值

**位置：**[样品处功率](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:2754)。

PL 当前支持脉冲激发，但现行字段只写“样品处功率（mW）”。平均功率与脉冲峰值功率是不同的物理量；旧字段中的平均功率说明没有进入这个现行字段。[Thorlabs 脉冲功率定义与公式](https://www.thorlabs.com/catalogpages/Obsolete/2024/T505.pdf)。

**建议：**明确为“样品处平均功率”，并在脉冲模式提示填写平均值。

### C08 PL 发射光谱带宽容易与样品发射宽度混淆

**位置：**[狭缝设置及发射光谱带宽](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:2882)。

该字段由“狭缝设置方式＝光谱带宽”触发，记录仪器通带，却命名为“发射光谱带宽”。这也可被理解为样品发射谱的宽度。当前同时支持阵列采集和扫描采集；仪器带宽与样品光谱宽度需要明确所属对象。[HORIBA 对光谱仪、单色器及其带宽的说明](https://www.horiba.com/usa/scientific/technologies/spectrometers-and-monochromators/choosing-a-monochromator-spectrograph/)。

**建议：**使用“发射端仪器光谱带宽 / Emission spectral bandpass (instrument setting)”。实际采用单色器时可具体称为“发射单色器带宽”。

## 5. 前端跨页面文字：5 项

| 编号 | 位置与当前文字 | 问题及建议 |
|---|---|---|
| U01 | [样品列表](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/samples/sample-list-page.tsx:143)“实际结果”；[详情](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/samples/sample-detail-page.tsx:200)“已有表征结论／生长状态／材料结论” | [后端](/Users/rustypiano/项目/CVD实验数据采集系统/backend/app/services/scientific_measurement_service.py:1481)已不再从新测量生成这些整片判定，状态保持 unknown。已有测量仍会被显示为“尚无结论”，容易混淆数据与材料判定。页面改称“样品信息与表征记录”，显示实际存在的测量信息。 |
| U02 | [录入](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/experiments-v2/simple-preparation-editors.tsx:2032)“倾斜”；[字段源映射](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:5157)“倾角” | `tilted` 在[样品详情](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/samples/sample-detail-page.tsx:99)显示为“放置方式：倾角”。状态与角度量混用；该状态统一称“倾斜”，“倾角”用于数值字段。 |
| U03 | [英文附加能力标签](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/shared/i18n/locales/en/common.ts:439)：`Field type`、`Other field parameters`；[实体英文字段名](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:8685)：`External field capabilities` | 当前支持机械振动等其他附加能力，英文仍限定为物理场。统一为 `Additional capability`、`Additional capability parameters`、`Additional capabilities`。 |
| U04 | [目标分类](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/experiments-v2/simple-target-editor.tsx:676)、[制备字段](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/experiments-v2/simple-preparation-editors.tsx:3438)、[样品表头](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/samples/sample-list-page.tsx:139) | 当前主要页面有直接写入组件的中文，切换英文后仍显示中文。两份 locale 键一致不能证明界面双语完整。可见标签应使用现有翻译系统和领域词表。 |
| U05 | [异常附件调用](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/experiments-v2/simple-preparation-editors.tsx:4524)、[上传辅助标签](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/experiments-v2/components/experiment-attachments.tsx:277)、[删除提示](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/shared/i18n/locales/zh/common.ts:1771) | 辅助阅读文字含 `process_event_attachment`；删除提示使用“软删除”“存储证据”等开发用语。改为“上传异常事件附件”，删除提示直接说明附件是否从记录中移除及保留的操作记录。 |

## 6. 字段字典内部：2 项

| 编号 | 位置 | 问题及建议 |
|---|---|---|
| D01 | [处理类型声明](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:101)与[现行处理方式](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:6449) | 同一权威源仍有两套不一致的前驱体处理清单。前者含 mix、pre_anneal，缺少 melt、drop_cast、dip_coat、dry；后者与实际界面一致，并说明旧处理按历史兼容。现行声明需要统一，历史编码明确标识。 |
| D02 | [化学式含义](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:7780)：化学身份：分子式 | “化学式”不能全部解释为“分子式”。分子式适用于具有离散分子的对象，固体材料还涉及组成式等表达。字段名“化学式”保留，含义写“表达物料元素组成及化学计量关系的化学式”。依据 [IUPAC Red Book，IR-4.1—IR-4.2，印刷页 54](https://iupac.org/cms/wp-content/uploads/2016/07/Red_Book_2005.pdf)。本项属于字典含义，前端没有直接显示这句 meaning。 |

## 7. 文字精确化：4 项

以下项目与前述 30 项分别计数。

| 编号 | 当前文字 | 建议文字与范围 |
|---|---|---|
| W01 | Raman、PL、SHG 数值字段“光栅”，单位 lines/mm；[示例位置](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:1757) | “光栅刻线密度”。字段记录的数值对象更明确。 |
| W02 | “功率设置单位”，选项含“档位”；[示例位置](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:2740) | “功率设置表示方式”。档位属于仪器设置表达；数值单位仍分别保留。 |
| W03 | OM 中文“图像尺寸”，英文 `Sampling points`；[位置](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:1440) | 英文统一为 `Image dimensions (pixels)`。 |
| W04 | 历史 Raman、PL、SHG 的“强度处理口径／原始计数口径”；[示例位置](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:1949) | “强度表示方式／未归一化采集计数”。这些词条带 legacy_only，新表单不显示，但[详情](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/characterizations/measurement-details.tsx:473)会按历史条件显示它们。此项仅涉及历史显示文字。 |

## 8. 完备性的适用范围

本次已经证实的范围内缺口包括其他单组分气体、组合结构、未恢复状态，以及量的参考条件。其余分类还存在以下边界，不能据此声称覆盖所有实验场景：

| 范围 | 已知边界 | 判断 |
|---|---|---|
| 炉体方向 | [选项](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:8613)仅有水平、垂直；市场已有可在 0—90° 调整的管式炉。[制造商资料](https://nabertherm.com/en/products/labor/tube-furnaces/tube-furnaces-stand-horizontal-and-vertical-operation-1500-degc) | 当前只覆盖两种方向。尚未核实课题组是否使用倾斜装置，不能把增加字段写成已确认需求。 |
| 形态分类边界 | 线状与棒状、颗粒状与块状、截角三角形与六边形，缺少组内可执行的归类说明 | 不凭空指定长宽比或尺寸阈值；现有证据不足以判定每个词错误。 |
| 成膜形式 | “分立片状／连续膜”对部分并合状态的归类依据未明确 | 需要明确目标描述范围和判定依据，不能直接把中间状态归入两端之一。 |
| 表征方法 | “其他方法”能记录范围外的方法；部分方法内部只支持列出的采集模式 | 完备性应按已声明支持的模式判定，不能由方法名称推断它覆盖该技术的全部模式。 |

## 9. 验证记录

- 使用 PyYAML 读取字段源，复算实验、实体、各表征方法和历史定义数量；使用 Bun 读取生成元数据核对 91 项实验字段及 55 项实体字段。
- 执行现有 `check_field_source.py`，结果：126 项实验字段、67 项实体字段、26 项 R0，Excel 与 YAML 渲染逐格一致。
- 对气瓶匹配函数执行只读输入验证，确认 HCl 案例的所有现行选项均不匹配；对现有表征条件校验执行 XRD 与 STEM 分类输入验证。
- 用现有实体字段函数核实“存储方式”为单选、“最近校准或维护日期”在当前仪器表单可见。
- 核实实际路由、条件显示和详情读取，学术争议引用标准、原始研究或制造商技术资料。数值示例重新计算。

本次仅新增审核报告，业务字段、前端代码和数据未修改。
