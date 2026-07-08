// 化学式「文本 + 元素校验」纯逻辑（待明确#2）与显示串复刻。
// 元素校验 = 解析化学式里的元素符号 token，逐个比对周期表合法性（非周期表点选）。
// 显示串规则 = 前端复刻后端默认规则；**与后端 app/services/formula_display.py 保持一致，
// 待组内确认（待明确#1）**——两侧同源规则任何变更须同步。

/** 周期表 118 元素符号集合（用于元素合法性校验）。 */
const ELEMENT_SYMBOLS = new Set([
  'H',
  'He',
  'Li',
  'Be',
  'B',
  'C',
  'N',
  'O',
  'F',
  'Ne',
  'Na',
  'Mg',
  'Al',
  'Si',
  'P',
  'S',
  'Cl',
  'Ar',
  'K',
  'Ca',
  'Sc',
  'Ti',
  'V',
  'Cr',
  'Mn',
  'Fe',
  'Co',
  'Ni',
  'Cu',
  'Zn',
  'Ga',
  'Ge',
  'As',
  'Se',
  'Br',
  'Kr',
  'Rb',
  'Sr',
  'Y',
  'Zr',
  'Nb',
  'Mo',
  'Tc',
  'Ru',
  'Rh',
  'Pd',
  'Ag',
  'Cd',
  'In',
  'Sn',
  'Sb',
  'Te',
  'I',
  'Xe',
  'Cs',
  'Ba',
  'La',
  'Ce',
  'Pr',
  'Nd',
  'Pm',
  'Sm',
  'Eu',
  'Gd',
  'Tb',
  'Dy',
  'Ho',
  'Er',
  'Tm',
  'Yb',
  'Lu',
  'Hf',
  'Ta',
  'W',
  'Re',
  'Os',
  'Ir',
  'Pt',
  'Au',
  'Hg',
  'Tl',
  'Pb',
  'Bi',
  'Po',
  'At',
  'Rn',
  'Fr',
  'Ra',
  'Ac',
  'Th',
  'Pa',
  'U',
  'Np',
  'Pu',
  'Am',
  'Cm',
  'Bk',
  'Cf',
  'Es',
  'Fm',
  'Md',
  'No',
  'Lr',
  'Rf',
  'Db',
  'Sg',
  'Bh',
  'Hs',
  'Mt',
  'Ds',
  'Rg',
  'Cn',
  'Nh',
  'Fl',
  'Mc',
  'Lv',
  'Ts',
  'Og',
])

// 下标数字（MoS₂）→ 普通数字，供解析时剥离。
const SUBSCRIPT_MAP: Record<string, string> = {
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
}

function normalizeSubscripts(input: string): string {
  return input.replace(/[₀-₉]/g, (ch) => SUBSCRIPT_MAP[ch] ?? ch)
}

/**
 * 从化学式抽取元素符号 token：把非字母字符（数字/下标/分隔符 / - : · ( ) 空格 等）视作断点，
 * 再按「大写字母 + 若干小写字母」贪婪切分（如 'MoS2'→['Mo','S']，'Al₂O₃'→['Al','O']）。
 */
export function extractElementSymbols(formula: string): string[] {
  const letters = normalizeSubscripts(formula).replace(/[^A-Za-z]+/g, ' ')
  return letters.match(/[A-Z][a-z]*/g) ?? []
}

export interface FormulaValidation {
  /** 是否通过（空串视为通过——必填与否交给字段元数据判定）。 */
  valid: boolean
  /** 是否为空输入。 */
  empty: boolean
  /** 解析出的元素符号（去重后按出现顺序）。 */
  elements: string[]
  /** 非法（非周期表）符号 token。 */
  unknownSymbols: string[]
}

/**
 * 校验化学式的元素符号合法性。空串通过（empty=true）；非空但解析不出任何元素、
 * 或存在非周期表符号，则不通过并给出 unknownSymbols。
 */
export function validateChemicalFormula(input: string): FormulaValidation {
  const trimmed = input.trim()
  if (trimmed === '') {
    return { valid: true, empty: true, elements: [], unknownSymbols: [] }
  }
  const tokens = extractElementSymbols(trimmed)
  const seen = new Set<string>()
  const elements: string[] = []
  const unknownSymbols: string[] = []
  for (const token of tokens) {
    if (ELEMENT_SYMBOLS.has(token)) {
      if (!seen.has(token)) {
        seen.add(token)
        elements.push(token)
      }
    } else if (!unknownSymbols.includes(token)) {
      unknownSymbols.push(token)
    }
  }
  const valid = tokens.length > 0 && unknownSymbols.length === 0
  return { valid, empty: false, elements, unknownSymbols }
}

// ── 显示串（formula_display）复刻，与后端 app/services/formula_display.py 同规则 ──

export interface DisplayComponent {
  formula?: string | null
  chemical_formula?: string | null
  role?: string | null
  layer_order?: string | number | null
  order?: string | number | null
}

function componentFormula(component: DisplayComponent): string {
  return String(component.formula ?? component.chemical_formula ?? '').trim()
}

function layerOrder(component: DisplayComponent): [number, string] {
  const raw = component.layer_order ?? component.order
  const parsed = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10)
  const order = Number.isFinite(parsed) ? parsed : 0
  return [order, componentFormula(component)]
}

/**
 * 复刻后端 render_formula_display：
 *  本征/无组分 → 原化学式；垂直异质结 → 按层序升序 '/' 连接；横向异质结 → '-' 连接；
 *  掺杂 → 掺杂剂:基体；其余 → 原化学式。
 * **与后端 formula_display.py 保持一致，待组内确认。**
 */
export function renderFormulaDisplay(
  chemicalFormula: string,
  structureType: string,
  components: DisplayComponent[] = [],
): string {
  const parts = components ?? []
  if (structureType === '本征' || parts.length === 0) return chemicalFormula
  if (structureType === '垂直异质结') {
    const ordered = [...parts].sort((a, b) => {
      const [oa, fa] = layerOrder(a)
      const [ob, fb] = layerOrder(b)
      return oa - ob || fa.localeCompare(fb)
    })
    const joined = ordered.map(componentFormula).filter(Boolean).join('/')
    return joined || chemicalFormula
  }
  if (structureType === '横向异质结') {
    const joined = parts.map(componentFormula).filter(Boolean).join('-')
    return joined || chemicalFormula
  }
  if (structureType === '掺杂') {
    const dopant = componentFormula(
      parts.find((part) => part.role === '掺杂剂') ?? {},
    )
    const matrix = componentFormula(
      parts.find((part) => part.role === '基体') ?? {},
    )
    if (dopant && matrix) return `${dopant}:${matrix}`
  }
  return chemicalFormula
}
