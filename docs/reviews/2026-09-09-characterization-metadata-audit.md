**表征表单元数据与字段分类审查建议 · 2026-09-09**

后续：用户已确认开始修改；首批本地实施及剩余项目见[实施记录](./2026-09-09-characterization-metadata-implementation.md)。下文的“当前”与校验探针均指审查时的 alpha.42 基线，保留作为改动前证据。

结论：当前表单可以留存部分观测和文件，但对采集条件、数据处理来源、模式间的关系记录不足，尚不足以支撑多种表征结果的独立复核。OM 的曝光和白平衡缺失属实；另外，若干已有科学意义明确的字段也被一起隐藏了。建议先补齐影响解释的采集参数及来源关系，再考虑增加结果指标。

本报告为建议稿，不改变现行字段、必填规则或已确认的产品决策。范围覆盖当前全部 9 个新录入入口：OM、Raman、PL、SHG、AFM、SEM、TEM、XRD、其他；包含 SEM/TEM 中的 EDS、TEM 中的 EELS，以及合并进 Raman 的低频采集。未将未实现的方法逐一设计成新模块。

**1. 审查基线与证据边界**

- 本地 HEAD 为 `1c99d4c`，提交内字段版本为 `v4.0-alpha.41`，工作树为 `v4.0-alpha.42`。逐对象比较确认，两者的 `characterization_profiles` 和 `characterization_properties` 完全相同。因此，本报告不把当前衬底修改误认为表征修改。
- 已核对字段单一源、生成元数据的实际消费逻辑、表单提交载荷、Pydantic 校验、测量服务、详情与 JSON 导出路径；使用 UV 直接运行了 8 组模型校验探针。没有登录生产、读写真实实验数据，也没有把本次静态审查称为浏览器或仪器实测验收。
- 外部依据采用正式数据模型/词典、原始研究、厂商及分析软件官方资料。NeXus 的 contributed definition 是参考方案，不能表述成所有实验必须遵守的强制国际标准；显微成像的通用原则可借鉴 OME，但生物显微镜的全部字段不直接照搬到 CVD。
- 下文的“核心”是我对本项目新采集记录的建议；来源支持其科学必要性，不代表来源规定了本项目的必填级别。仪器是否能导出这些值，仍需用课题组实际机型和一个真实原生文件确认。

代码入口：[字段单一源](/Users/rustypiano/项目/CVD实验数据采集系统/docs/standard/field-source.yaml:517)、[表单筛选与条件校验](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/experiments-v2/simple-characterization-workspace.tsx:887)、[后端条件模型](/Users/rustypiano/项目/CVD实验数据采集系统/backend/app/schemas/scientific.py:1601)、[测量保存](/Users/rustypiano/项目/CVD实验数据采集系统/backend/app/services/scientific_measurement_service.py:222)、[JSON 导出](/Users/rustypiano/项目/CVD实验数据采集系统/backend/app/services/v2_reporting_service.py:968)。

**2. 当前字段全量盘点**

下面的数量按“方法内字段键”计数，尺寸的两个分量算一个字段，含条件展开项；不是每次都显示这么多，也不含公共样品、时间、仪器和文件项。共 57 个可用于新录入的条件字段，另外有 17 个历史/兼容条件字段被隐藏。

| 入口 | 新录入条件字段：粗体为现行必填 | 可新录入的结果 | 被隐藏的相关条件 |
| --- | --- | --- | --- |
| OM，1 项 | 物镜规格；无必填条件 | 观察说明 | 照明模式、图像标尺、统计对象、尺寸定义 |
| Raman，8 项 | **激光波长**；功率数值、功率口径、物镜、单次采集时间、累积次数、采集范围、测量温度 | 编号峰、观察说明 | 滤光配置 |
| PL，8 项 | **激发波长**；功率数值、功率口径、单次采集时间、光谱范围、测量温度、物镜、累积次数 | 编号峰、观察说明 | 无 |
| SHG，10 项 | **数据类型、激发波长**；功率数值、功率口径、单次采集时间、物镜、激光输出、脉宽、重复频率、旋转对象 | 光谱类型可填编号峰；各类型可填观察说明 | 入射偏振、检偏设置、角度零点、角度范围 |
| AFM，6 项 | **扫描尺寸**；模式、探针型号、采样点数、扫描频率、其他模式说明 | 台阶高度、观察说明 | 高度数据处理 |
| SEM，6 项 | **加速电压、模式**；工作距离、束流、倾角、视场尺寸 | 观察说明 | 探测器、导电处理/镀膜、统计对象、尺寸定义 |
| TEM，6 项 | **加速电压、数据类型**；TEM/STEM、成像模式、衍射模式、能谱方法 | 图像/衍射可填晶格间距；各类型可填观察说明 | 表征前制样、旧的混合模式字段 |
| XRD，11 项 | **辐射源、波长、扫描轴、扫描范围**；扫描几何、步长、每步计数时间、扫描速率、入射角、采集方式、其他几何说明 | 与扫描轴对应的编号峰、观察说明 | 旧 2θ 范围字段 |
| 其他，1 项 | **方法说明** | 观察说明 | 无 |

仪器与文件：OM 两者均可不填；“其他”仪器可不填但需要文件；其余方法需要仪器版本与至少一个文件。OM 仅填一条观察说明也能通过模型校验。

历史低频 Raman 单独入口已停止新录入，这本身合理；图像统计、粗糙度、元素定量和材料判定的暂缓也不应自动等同于设计错误。应重新评估的是：暂缓结果指标时，是否同时去掉了仍然影响现有图像、谱峰、台阶高度解释的条件。

**3. 先解决五类共性问题**

| 优先项 | 已确认的现状 | 建议与依据 |
| --- | --- | --- |
| 条件对应到具体数据 | 一次测量只有一个 `typed_conditions`，可以上传多个文件；一组峰只指向一个文件，不能再指定文件内的某条曲线或某帧 | 先约定“同一条记录的原始数据共享同一套条件”；不同曝光/功率/倍率优先分记录，完整扫描文件保留逐点参数。峰/高度/间距增加文件与曲线/通道标识。OME 将曝光放到 Plane，pdCIF 允许计数时间随测点记录，说明条件可能属于数据内部，而非整次实验。依据：[OME 字段模型](https://www.openmicroscopy.org/Schemas/Documentation/Generated/OME-2016-06/ome.indexList.html)、[pdCIF 计数时间](https://www.iucr.org/__data/iucr/cifdic_html/1/cif_pd.dic/Ipd_meas_step_count_time.html)。 |
| 原始与处理后文件 | 新表单上传统一传 `fileCategory: 'raw'`，提交固定 `analyses: []`；用户即使选择了拟合图/校平图，系统也无法忠实表达其性质 | 恢复逐文件“原始采集/处理后/说明性附件”分类，保留原文件；有处理时，记录来源文件及最少处理信息。不要求每张图都填代码提交号和分析时间。依据：[QUAREP-LiMi 关于硬件、采集、处理与质量控制元数据](https://arxiv.org/abs/2101.09153)。 |
| 采集值与设备能力 | 仪器固定配置可以记录“有 300/600/1800 光栅”，本次采集却没有光栅字段；物镜是一个可随意省略 NA 的文本 | 固定能力留在仪器版本，本次实际选用的光栅、物镜、相机和探测器绑定到测量。可从配置预填，但要留下实际选用值。依据：[NXraman](https://manual.nexusformat.org/classes/applications/NXraman.html)、[OME 的 Objective 与 DetectorSettings](https://www.openmicroscopy.org/Schemas/Documentation/Generated/OME-2016-06/ome.indexList.html)。 |
| 条件展开与适用性 | `when` 控制显示/允许提交，未使展开项自动必填；TEM 的成像模式只按数据类型过滤，未按 TEM/STEM 过滤 | 为明确分支规定最少依赖，前后端使用同一规则。先修正科学上不相容的组合；缺信息仍可留存，但必须明确缺了什么，不能声称条件完整。具体反例见第 13 节。 |
| 样品在测量时的状态 | SEM 镀膜、TEM 制样字段被隐藏；公共表单没有专门表达转移后载体、清洗、退火或导电层的入口 | 记录实际处理与测量时载体；已有样品转化模型应复用，不在多条测量中重复维护同一段制样历史。至少让镀层材料/厚度（已知时）、转移载体/支撑膜可追溯。镀层会改变信号，制样也可能引入污染或损伤。依据：[JEOL SEM 原理](https://www.jeol.com/products/science/sem.php)、[Gatan EELS 样品要求](https://eels.info/book/export/html/42)。 |

文件分类的代码依据：[上传与保存载荷](/Users/rustypiano/项目/CVD实验数据采集系统/frontend-next/src/features/experiments-v2/simple-characterization-workspace.tsx:1104)。后端已有分析输入/输出文件关系，可在现有能力上补最小入口；这项建议不等于恢复此前整个通用分析面板。

**4. OM：曝光、白平衡之外，还需要哪些信息**

目前只有物镜规格可填，连照明方式都没有新录入入口。曝光和白平衡均不在后端条件模型中，不能只在前端添加控件。

| 建议字段组 | 内容、单位与适用条件 | 建议级别及理由 |
| --- | --- | --- |
| 记录方式 | 目视观察 / 数字图像 | 核心。目视记录可没有图像；数字成像应关联图像和仪器/相机。不要要求目视观察填写曝光。 |
| 光路与衬比方式 | 反射 / 透射；另选明场 / 暗场 / DIC / 实际使用的其他方式；偏振片与检偏器设置按需展开 | 核心。反射/透射与明暗场是不同维度，不宜放进一个互斥列表。当前隐藏的自由文本应改成定义明确的选择。 |
| 实际物镜 | 物镜标识、倍率、NA；浸没介质按适用情况 | 核心，优先选择仪器已有配置。倍率不等于 NA，也不能单独推出图像标尺。 |
| 曝光 | 本张实际曝光时间，ms 或 s；手动/一次自动后锁定/连续自动 | 数字图像核心。只记“自动”不能复核本张实际曝光；序列每帧可能不同，优先读原文件。 |
| 增益与偏置 | 本次增益、原机单位/档位；模拟与数字增益可区分时分别记录；黑电平/offset 按仪器提供情况 | 增益为核心，偏置推荐。不要把各机型“增益 1”当成同一物理量，也不要把相机灰度 counts 当成光子数。 |
| 白平衡 | 关闭/手动/一次自动/连续自动；实际 RGB 增益或可回溯的白平衡配置；参考对象/参考图像；色温仅在软件提供时保留 | 彩色图像核心。黑白相机不适用。单写“自动”或一个色温不能完整描述色彩变换；不要要求用户猜测 RGB 值。 |
| 照明与滤光 | 实际光源、亮度读数及原机单位；滤光片/波段；相关孔径设置在可获取时记录 | 光源与亮度推荐进入常用项；用于颜色/反射衬比比较时成为核心。仪器的亮度百分比不等于样品处辐照度。 |
| 空间尺度 | X/Y 像素尺寸，μm/px，及校准/元数据来源；或可核验的标尺 | 尺寸、跨图比较时核心。应恢复尺度记录；本轮暂缓面积统计不构成删除标尺的理由。裁剪不一定改变像素尺度，重采样会改变。 |
| 图像编码与采集组合 | 像素宽高、位深、颜色/通道、binning；多曝光 HDR、拼接、景深合成仅在使用时记录 | 优先自动提取；不要全变成人工输入。保留各组合图的原始输入文件。 |
| 图像处理 | 白平衡应用阶段、gamma、对比度/饱和度变换、归一化、降噪、锐化、裁剪/重采样；只登记实际发生的处理及设置/报告 | 用于颜色、亮度或尺寸比较时核心；无记录应显示“处理情况未记录”，不能默认“未处理”。 |

依据分工：OME 明确包含 `Plane.ExposureTime`、`DetectorSettings.Gain/Binning`、物镜 NA 与图像物理尺度，支持把采集参数与仪器身份分开；Andor 说明增益、位深与像素饱和之间的关系。因此曝光、增益和位深是解释图像计数所需的信息。[OME 模型](https://www.openmicroscopy.org/Schemas/Documentation/Generated/OME-2016-06/ome.indexList.html)、[Andor：CCD 饱和、满阱与位深](https://andor.oxinst.com/learning/view/article/understanding-ccd-saturation%3A-pixel-well-depth-vs.-bit-depth)。

Nikon 的白平衡说明展示了照明光谱、RGB 调整和自动白平衡如何改变相同视野的颜色，并说明相同色温也可能对应不同光谱。由此建议记录实际白平衡和光源，不能只加一个“白平衡色温 K”。[Nikon：Color Balance in Digital Imaging](https://www.microscopyu.com/digital-imaging/color-balance-in-digital-imaging)。

对二维材料，这些差异尤其不能忽略：Castellanos-Gomez 等在 MoS₂/NbSe₂ 与 SiO₂/Si 体系中实测了衬比随照明波长和厚度的变化。这支持保留波段及当时载体，但不意味着只凭颜色即可给出层数或生长结论。[原始研究，Applied Physics Letters 96, 213116 (2010)](https://arxiv.org/abs/1003.2602)。

建议的第一批常用界面为：仪器/相机、物镜、光路/成像方式、曝光、增益、白平衡、光源亮度、数据文件；尺度和处理信息从文件/配置读取后核对。其他参数按使用情况展开。

**5. Raman：保留低频合并，补足光学与处理条件**

现有波长、功率口径、单次时间、累积次数、有符号采集范围、物镜与温度均应保留。功率数值与口径配对、百分比上限校验也是已有的正确设计。

| 建议 | 具体记录与级别 | 影响及依据 |
| --- | --- | --- |
| 把功率、单次时间、累积次数和物镜提为新采集的核心信息 | 优先记录样品处实测 mW；仅有仪器 % 时保留 % 和实际机型/配置，不换算成 mW；物镜含 NA | 功率、聚焦和照射时长影响信号及热损伤。厂商明确将功率、曝光及聚焦作为联合采集条件。[Nanophoton 激光照射条件](https://www.nanophoton.net/lecture-room/technics/measurements/lesson-3-1-3)。 |
| 新增实际光栅、狭缝与共焦孔径 | 光栅 lines/mm 或配置标识，狭缝 μm，共焦孔径 μm/实际档位；适用仪器记录 | 光谱分辨率与空间选择性不同；填写 FWHM 却不知光栅/狭缝时，难以比较峰展宽。光谱采样间隔也不应命名为分辨率。[HORIBA 分辨率说明](https://www.horiba.com/usa/scientific/technologies/raman-imaging-and-spectroscopy/raman-explained-faq/how-do-you-obtain-the-best-raman-spectral-resolution/)、[光路及狭缝/共焦说明](https://www.horiba.com/vnm/scientific/technologies/raman-imaging-and-spectroscopy/raman-spectrometer-presentation/)。 |
| 恢复滤光配置并记录可测范围 | 实际 edge/notch/超低频组件标识；仪器能提供时保留截止/阻断范围；不统一猜一个阈值 | 特别是低频 Raman，“没有峰”可能是滤光组件无法测到。继续合并到 Raman 入口合理，仍需保存低频配置。[HORIBA 的 Rayleigh filtering 说明](https://www.horiba.com/vnm/scientific/technologies/raman-imaging-and-spectroscopy/raman-spectrometer-presentation/)。 |
| 增加采集形式及偏振条件 | 单谱 / 映射 / 时间或参数扫描；扫描保留文件内坐标轴、步距、每点时间；偏振实验记录入射/检测偏振、参照与收集几何 | 同一方法不只有单谱；偏振会改变可见模与相对强度。无需让普通用户填写晶体轴的峰归属。[NXraman 支持的实验与散射配置](https://manual.nexusformat.org/classes/applications/NXraman.html)。 |
| 精简地保留峰提取来源 | 仪器报告/软件导出/人工读数；有拟合时记录软件版本、基线、模型、拟合区间或关联报告；注明累积后求和还是平均、是否归一化 | 可复核峰位、宽度和面积的计算。这里记录计算步骤，不加入 E₂g/A₁g 等归属或材料结论。[Raman 数据处理原始研究：累积平均与基线算法](https://pmc.ncbi.nlm.nih.gov/articles/PMC9941747/)。 |

温度建议区分环境温度、样品台设定和样品实测；可让用户按习惯填 °C，再规范换算为 K。不要把未测样品温度自动填成室温。气氛、压力或外加偏压仅在控温/原位等实验使用时展开。

**6. PL：除了采集条件，还要说明强度是什么**

现有八项条件应保留，适用的功率、时间、累积和光学配置与 Raman 一致复用。额外建议如下。

| 建议 | 适用条件与理由 |
| --- | --- |
| 明确记录的是稳态发射谱、映射，还是时间分辨/激发扫描 | 当前表单实质支持稳态发射谱。若以后记录 TRPL/PLE，应使用自己的时间轴/扫描轴条件，不能把寿命或激发扫描伪装成发射峰。先用具名“其他”与原始文件留存，实际有需求再加模板。 |
| 增加实际光栅、狭缝/带宽、探测器及滤光配置 | 微区 PL 由激发、收集光路、光谱仪和探测器共同决定。更换探测器或波段可能改变测得的谱形。[HORIBA：Micro-Photoluminescence](https://www.horiba.com/sgp/sms/micro-photoluminescence/)。 |
| 记录强度口径及已应用的响应校正 | 区分仪器计数、计数率、归一化相对强度；响应校正记录已应用/未应用/未记录及配置或报告。不能只因单位是 a.u. 就认为不同仪器结果可比。[HORIBA Dual-FL 官方手册：Spectral correction](https://www.horiba.com/fileadmin/uploads/Scientific/Downloads/UserArea/Fluorescence/Manuals/Dual-FL_Manual.pdf)。 |
| 记录测量时载体、温度口径及激光输出形式 | 实际使用脉冲时保留平均功率、脉宽和重复频率；低温测量注明测温位置/设定或实测。衬底和已转移/封装状态从样品历史引用；不能直接假设还是生长衬底。 |
| 为峰高/面积恢复最少处理证据 | 同 Raman，说明去背景、拟合或积分区间和归一化来源；无需让用户填写激子归属。原始谱与处理后报告应分别保存。 |

现行 PL 的 nm/eV 切换会确认并清除旧峰，避免直接换标签，这点应保留。若以后做自动转换，峰位可按能量关系换算，但 FWHM 不可把一个 nm 宽度数字直接标成 eV；谱密度与积分面积转换还依赖横轴定义，不能只改显示单位。这是量纲与变量变换的要求，不是新增材料判定。

**7. SHG：当前“偏振扫描”缺少定义扫描的核心参数**

现有“光谱/偏振扫描/图像/功率扫描”混合了数据形态和扫描变量。实际可以对每个偏振角记录一条光谱，也可以逐功率成像。建议分成“采集数据形式”和“变化参数”；第一步也可保留原入口，但明确组合数据及扫描轴都在文件中。

| 建议字段组 | 记录内容和规则 |
| --- | --- |
| 激发脉冲 | 输出形式作为核心；脉冲时记录平均功率口径、脉宽及来源（标称/实测）、重复频率；已测光斑尺寸及定义推荐记录。不能将平均功率写成峰值功率。 |
| 偏振配置 | 恢复入射偏振和检偏设置，用明确选项及角度替代宽泛文本；区分不加检偏器、固定检偏、随动保持平行/交叉。 |
| 角度轴 | 核心为旋转的实际元件、文件中角度列表示的量、实验室零点与正方向；范围/步距可由原文件提供。机械半波片角、入射偏振角、检偏角和样品转角不能共用一个未定义角度。 |
| 收集与滤光 | 反射/透射收集几何、实际滤光片/检测波段、探测器和增益；光谱/图像/点探测按实际设备展开。 |
| 功率或空间扫描 | 功率扫描保留每点样品处功率/设置值及每点信号、时间；图像保留视场/像素尺度、驻留或曝光时间。单个“激光功率”不能表达整个功率扫描。 |

原始 SHG 实验会明确记录平均功率、脉宽、重复频率、激发/检测偏振；另有研究明确写出相对于实验室偏振方向的角度参照。这些证据支持恢复采集元数据，而非要求用户判定晶向、堆垛或层数。[Shree 等，Nature Communications 12, 6894 (2021)](https://www.nature.com/articles/s41467-021-27213-8)、[All-optical polarization and amplitude modulation，Nature Photonics (2021)](https://www.nature.com/articles/s41566-021-00859-y)。

先定义实验室零点即可，不需要用尚未测定的晶体学方向定义零点。“角度参照不确定”应促使明确参照或保留原始读数，而不应把整个偏振配置从新记录中删去。

**8. AFM：保留台阶高度，就必须能解释高度从哪里来**

现有扫描尺寸、模式、探针、采样点数与扫描频率都有用。模式和探针建议作为核心；“扫描频率 Hz”应明确按机型是每秒扫描线/往返周期的哪一种，不能与 μm/s 的探针速度混同。

| 建议字段组 | 记录内容及适用条件 |
| --- | --- |
| 反馈设定 | 轻敲记录自由振幅及设定振幅/比例，接触模式记录挠曲/力设定值，峰值力模式记录峰值力；保留原机单位及模式。不要把所有 setpoint 强制当成 nN。 |
| 采集通道和方向 | Height/其他实际通道、Trace/Retrace、快扫描方向；取数值台阶高度时应能识别用于分析的高度通道。 |
| 反馈与探针状态 | 反馈增益和驱动频率/振幅优先随原始元数据留存；对力相关实验再要求弹簧常数、灵敏度及其校准来源。普通高度测量无需一律填写整套力学标定。 |
| 高度处理 | 恢复处理记录：未处理/校平方式、阶数、剔除区域或关联处理报告；每项明确“未记录”的可能。 |
| 台阶结果依据 | 指向源文件、通道以及剖面线/两平台定义的图或报告；有多个台阶则分别编号。保留 nm，不把它自动当成原子层数。 |
| 环境和尺度校准 | 空气/液体/真空等实际环境；控温时记录温度口径；按需关联 Z 高度及 XY 校准。 |

NeXus 的 AFM/SPM 扩展将探针、振动、反馈位置控制、扫描和环境分别描述，支持按模式展开这些条件；这些扩展可参考，不能作为要求全填的依据。[NeXus SPM 结构](https://manual.nexusformat.org/classes/contributed_definitions/spm-structure.html)、[NXafm](https://manual.nexusformat.org/classes/contributed_definitions/NXafm.html)、[NXspm_positioner](https://manual.nexusformat.org/classes/contributed_definitions/NXspm_positioner.html)。

Gwyddion 明确区分不同校平/背景去除方法，并指出高阶处理可能去除真实形貌；其台阶工具也存在不同拟合和平台处理方式。因此，“暂不录入粗糙度”不能推出“台阶高度无需处理依据”。[Gwyddion 校平文档](https://gwyddion.net/documentation/user-guide-en/leveling-and-background.html)、[Feature Measurement](https://gwyddion.net/documentation/user-guide-en/feature-measurement.html)。

**9. SEM 和 EDS：将电子成像与 X 射线采谱分开描述**

现行模式是 SE/BSE/EDS 三选一，且这三种模式共用同一套六项条件。SE、BSE 是电子信号/衬比类型，EDS 是 X 射线能谱分析；它们可以在同一位置配合采集。建议先保留一个 SEM 入口，再按“电子图像/EDS 谱/EDS 映射”等数据分支显示参数，探测器与采集任务分开。

| 分支 | 保留/补充的核心条件 | 推荐及条件项 |
| --- | --- | --- |
| SEM 图像 | 电压、实际探测器/信号、工作距离、束流（有读数时）、视场/像素尺度、像素数、每像素驻留时间或原机扫描速度、帧平均/积分 | 样品台角度、低真空模式和压力、样品偏压、实测束流来源；无法取得物理量时保留原机档位，不能擅自换算。 |
| 导电与制样 | 是否处理；有镀膜时材料、厚度（已知时）、依据或处理记录；导电胶/固定方式适用时记录 | 不知道镀层厚度应留作未记录，不能默认 0。 |
| EDS 谱/映射 | 加速电压、探测器、束流/原机设置、谱或映射类型、能量范围/通道间隔、live time；映射增加采样网格、驻留/帧数 | real time、dead time、process time、输入/输出计数率、样品与探测器几何/出射角和相应校准元数据，优先从仪器导出。 |

JEOL 说明 SE/BSE 来源及镀膜对二次电子信号的影响，支持恢复探测器和导电处理；NeXus 也单列扫描控制中的驻留时间及实际探测器工作模式。[JEOL SEM](https://www.jeol.com/products/science/sem.php)、[NXem](https://manual.nexusformat.org/classes/applications/NXem.html)。

Oxford Instruments 解释了 EDS process time 对能量分辨率、可处理计数和 dead time 的影响。因此这些条件不能被“加速电压＋EDS”替代；但厂商给某一型号的推荐 dead time 不应变成全系统固定合格阈值。[Oxford Instruments：EDS dead time](https://nano.oxinst.com/blogs/what-dead-time-you-should-choose-for-your-eds-/-edx-analysis)。

元素定量目前暂缓可以维持。未来恢复时，需要同时确定原子/质量分数、归一化范围、标准/无标样、背景/峰重叠处理及基体修正，不能把一张 EDS 彩色分布图直接录成定量百分比。

**10. TEM、衍射、STEM 与 EELS：六个字段远不足以覆盖所有分支**

将 TEM/STEM 与图像/衍射/能谱分开，是已有的正确方向；问题是分支还缺对应参数，选项之间也没有约束。

| 分支 | 建议记录 | 为什么 |
| --- | --- | --- |
| 共用 | 电压、实际采集模式、制样/载体或支撑膜、样品台倾角、曝光/扫描参数、文件与数据通道 | 电镜前的转移、减薄和污染状态可能影响测量。优先引用已有制样记录。[Gatan：样品要求](https://eels.info/book/export/html/42)。 |
| 常规 TEM/HRTEM 图像 | 校准后的像素尺度/标尺、相机、曝光/帧数；高分辨时记录可获取的离焦、像差校正/物镜配置 | HRTEM 的相位衬比依赖离焦与物镜像差，不能只看电压。[JEOL HREM](https://www.jeol.com/words/emterms/20121023.032659.php)。 |
| STEM 图像 | BF/ADF/HAADF 等实际探测器、收敛半角、探测器内外收集半角（可获取时）、束流、驻留、网格和帧数 | HAADF 是 STEM 探测配置，应限制到 STEM 分支；不同收集角改变接收的电子信号。[JEOL HAADF-STEM](https://www.jeol.com/words/emterms/20121023.031059.php)。 |
| SAED/NBED/CBED | 衍射模式、相机长度/倒易尺度校准、光阑或束斑信息、曝光和倾角；NBED/CBED 适用时记录会聚条件 | 图像长度与衍射倒易长度不能共用同一标尺。晶格间距需要来源于已校准图像、FFT 或衍射，并注明哪一条间距、计算方式。[NXem 的图像、衍射及仪器配置结构](https://manual.nexusformat.org/classes/applications/NXem.html)。 |
| TEM/STEM-EDS | 使用与 SEM-EDS 一致的能谱条件概念，并保留透射样品/支撑膜信息 | 不重复发明 EDS 字段，也不把支撑膜信号默认归给样品。 |
| EELS | 能量损失范围、eV/channel、收敛/收集半角、色散与零损失峰/能量校准、曝光或驻留/累积；厚度/低损谱在相关分析时提供 | EELS 信号和定量截面依赖角度及积分能量窗；不是只填“EELS”即可复核。[Gatan：Collection Angle](https://eels.info/how/getting-started/collection-angle-considerations)、[Quantify Extracted Signal](https://eels.info/how/quantification/quantify-extracted-signal)。 |

现行 `tem_lattice_spacing` 可用于全部 image/diffraction，即使只是普通低倍图像也能填写。建议选填“本次是否从图像/FFT/衍射测量间距”，明确来源后才显示数值；不要把一个标量“晶格间距”当成所有 TEM 的默认结果。这里不要求填写晶面指数或判相。

**11. XRD：现有扫描轴设计值得保留，但几何仍不完整**

已有辐射源、波长、扫描轴/范围、步进/连续、入射角和对应角度峰单位，方向正确。当前限制只有 2θ 峰才能填 Bragg 晶面间距，也应保留。

| 建议 | 最少内容及规则 |
| --- | --- |
| 区分几何与扫描程序 | 对称/掠入射/面内属于几何；rocking curve 是扫描方式。保留独立的扫描轴及耦合关系，不将“选择 2θ”自动理解为 θ–2θ 对称联动。 |
| 定义非扫描轴 | 掠入射记录固定入射角；ω 摇摆曲线记录固定 2θ；φ 扫描记录固定 2θ、χ/倾角及参照；具体按实际设备程序，不强迫所有实验共用一个角度模板。 |
| 完成步进/连续的依赖 | 步进采集记录步长和每步计数时间；连续记录速率及采样间隔/积分窗口（能获取时）。变速/变计时扫描从文件保存逐点信息。 |
| 明确实际辐射谱线和光学配置 | 阳极/谱线、单色器或 Kβ 滤片、Kα₁ 与 Kα₁/Kα₂ 情况、狭缝/平行光配置、实际探测器；管压 kV/管流 mA 优先自动导入。 |
| 峰值来源 | 原始计数或计数率、是否做背景/零点/样品位移/仪器展宽修正、拟合模型或报告；只有填写相应分析结果时要求处理依据。 |

依据：pdCIF 区分扫描方式、各测点计数时间、原始与处理后强度；Rigaku 的薄膜 XRD 资料解释不同扫描几何及光学条件会改变得到的信息。由此提出上述字段分层，而不是直接把粉末 CIF 全部字段搬进薄膜表单。[pdCIF 扫描方式](https://www.iucr.org/__data/iucr/cifdic_html/1/cif_pd.dic/Ipd_meas_scan_method.html)、[pdCIF 计数时间](https://www.iucr.org/__data/iucr/cifdic_html/1/cif_pd.dic/Ipd_meas_step_count_time.html)、[Rigaku：XRD for Thin Films](https://rigaku.com/products/x-ray-diffraction-and-scattering/xrd/practical-xrd-series/xrd-for-thin-films/summary)。

特别是 ω/φ/χ 扫描，峰宽对应的是该扫描角变量上的展宽，不应混成普通 2θ 峰宽；在没有对应物理模型和实验条件时，不自动换算晶粒尺寸、应变或马赛克度。

**12. 公共信息、结果和“其他”入口的具体建议**

| 现状/设计点 | 建议 |
| --- | --- |
| 测量人由当前账号写入 | 当前服务设置 `performed_by_id=actor.id`；如存在测试中心代测/师兄测量、他人补录，就会混淆操作者与录入者。系统继续自动记录入者，实际操作者/测试机构作为独立信息；本人测量可一键沿用。仅在确有代测时增加填写负担。 |
| 测量时间默认当前时刻 | 实时录入可默认；补录优先采用原文件采集时间并展示时区/来源，不能不经确认把上传时间当测量时间。 |
| “最近校准或维护日期”混为一项 | 校准与维护拆分。后端已存在 lifecycle event 和测量时校准快照，应复用。VIM 将校准定义为在给定条件下建立标准量值与示值/测量结果的关系，一次维护并不提供同样证据。[VIM 2.39](https://jcgm.bipm.org/vim/en/2.39.html)。 |
| 校准快照只取整台仪器最近一条 calibration event | 按本次相关的量/部件选择证据，例如波数、功率、相机尺度、AFM Z 尺度分别关联；最近一次功率校准不能替代波数校准。不需要每次测量新建一份相同证书。[现有选择逻辑](/Users/rustypiano/项目/CVD实验数据采集系统/backend/app/services/scientific_measurement_service.py:871)。 |
| 峰高与面积 | 当前面积单位正确显示为“强度单位×横轴单位”，应保留；仍需明确求和/均值/计数率/归一化及基线，来源文件内曲线标识也应保留。 |
| 台阶高度/晶格间距 | 当前只有 measurement 级文件集合，没有同峰参数一样的特定文件引用；多个文件时无法定位依据。使用同一种文件/通道/结果编号引用即可。 |
| “未检出可分辨峰” | 当前显式勾选及不填数值 0 是正确的；建议补适用的扫描范围/通道与识别方法或报告。它表示“在本条件下未检出”，不等于“样品没有该物相/材料”；不必强造一个数值检出限。 |
| 未做/未知/未记录 | 条件缺失不能自动变成“未处理”“无偏振”“室温”“单次测量”“零镀层”。优先保留空值和明确的缺项说明，不要求每个字段增加一个冗长状态下拉。 |
| 其他方法 | 至少明确方法名称、仪器/测试机构（有则填）、采集文件和条件说明/报告。已登记仪器的多个其他方法名称应可直接选择，避免仪器写 XPS、记录又靠另一个自由文本命名。真正高频使用后，再设计该方法专用参数。 |
| 统计、粗糙度、元素定量与材料判定 | 继续维持暂缓；恢复时再逐指标约定统计对象、算法、单位、采样和不确定度。补采集条件不要求恢复这些结果面板。 |

本报告没有建议恢复强制测区管理。文件内的帧/谱线/剖面编号用于定位证据，不代表样品空间区域或整片结论；已有“不默认整片、不自动判材料”的原则应保留。

**13. 已运行的校验探针与工程落点**

以下结果来自工作树现有 `MeasurementBundleCreate.model_validate`，仅验证字段层，不代表通过数据库外键/权限/真实文件校验。所有 UUID 均为人工构造，无数据库连接与写入。

| 输入 | 当前模型结果 | 审查判断 |
| --- | --- | --- |
| OM 无仪器、无文件、无条件，仅观察文字 | 接受 | 可作为目视观察；不应误称为可复核的数字成像记录 |
| Raman 条件只有 532 nm 波长 | 接受 | 功率/时间/光学配置完整性不足 |
| AFM 5×5 μm，模式“其他”，无说明 | 接受 | 条件分支缺少必需描述 |
| SEM 5 kV，模式 EDS，无能谱条件 | 接受 | 方法标签未带来相应采集信息 |
| TEM 200 kV，image，采集模式 TEM，成像 HAADF | 接受 | 应修正组合适用性 |
| TEM 200 kV，spectrum，未填 EDS/EELS | 接受 | 数据类型不能明确实际方法 |
| SHG 800 nm，偏振扫描，pulsed，无旋转对象/脉宽/重复频率 | 接受 | 缺少定义扫描和激发的条件 |
| XRD 掠入射、步进、2θ 10–80°，无入射角/步长/计数时间 | 接受 | 展开字段不等于对应依赖已校验 |
| 向条件模型新增 `exposure_time_ms` 和 `white_balance_mode` | 拒绝，`extra_forbidden` | 必须同步更新字段源和后端类型，不能只加前端 |

可重复运行其中最小的三组证据（在 backend 目录运行）：

```bash
uv run --no-sync python - <<'PY'
from uuid import UUID
from pydantic import ValidationError
from app.schemas.scientific import MeasurementBundleCreate, MeasurementConditions

base = dict(sample_id=UUID(int=1), instrument_id=UUID(int=2),
            instrument_version=1, measured_at='2026-09-09T08:00:00+08:00',
            raw_file_ids=[UUID(int=3)])
cases = [
    ('TEM', dict(accelerating_voltage_kV=200.0, data_type='image',
                 acquisition_mode='TEM', image_mode='HAADF')),
    ('SHG', dict(data_type='polarization_scan',
                 excitation_wavelength_nm=800.0, excitation_mode='pulsed')),
]
for method, conditions in cases:
    MeasurementBundleCreate.model_validate(dict(measurement=dict(
        **base, method_profile=method, typed_conditions=conditions)))
    print('ACCEPTED', method, conditions)
try:
    MeasurementConditions.model_validate(dict(exposure_time_ms=10.0,
                                              white_balance_mode='auto'))
except ValidationError as exc:
    assert all(e['type'] == 'extra_forbidden' for e in exc.errors())
    print('REJECTED new OM keys: extra_forbidden')
else:
    raise AssertionError('OM model has changed; update this audit evidence')
PY
```

不要只修改 `legacy_only` 或页面。具体实施应从字段单一源开始，同步检查后端手写 `MeasurementConditions`、条件校验和生成 Schema，保证页面、保存、详情及导出的含义一致。已存在的仪器版本、文件、分析、校准事件与样品转化关系可复用，不需为每种表征另建一套平台。

**14. 建议的落实顺序与必填策略**

1. **先处理信息丢失和科学语义问题**：原始/处理后文件分类，条件对应到文件/曲线，TEM 模式约束，XRD/SHG/其他模式依赖，实际操作者与录入者的关系。
2. **第一批补高影响且定义明确的字段**：OM 曝光/白平衡/增益/照明/尺度；Raman/PL 实际光学配置；SHG 偏振和角度参照；SEM 探测器与镀膜；AFM 高度来源与处理。这些信息在采集后往往难以补回，应优先保留。
3. **再完善分方法的高级分支**：EDS、EELS、TEM 衍射、高分辨成像、映射、原位和扫描型数据。按课题组实际使用的机型和文件格式确定常用字段，避免全员面对所有选项。
4. **最后做自动读取和常用配置复用**：先用一个真实文件确认能提取什么，再针对实际格式实现；不存在的值不补成默认值。每份记录保留原始文件，自动值/配置引用/人工录入的来源可查。

必填应围绕任务决定：数字图像需要曝光和相机信息，彩色图像需要白平衡，偏振扫描需要角度参照，掠入射需要入射角，报告台阶高度需要其取值依据。仪器固定值可自动带入，扫描逐点值可直接由原文件承载，不应要求重复手抄。

已有历史记录允许留存缺项；新采集尽量当场记录核心信息。确实无法获得的值允许明确缺失，并限制其后续可比性主张，而非强填猜测值。当前测量没有独立草稿状态，因此“缺项仍可留存”的具体保存策略需要一并设计，不能简单在旧保存按钮上把所有建议字段改成硬性必填。

本轮仅完成审查与建议，未修改业务代码、字段标准、工作簿、数据库或生产部署。
