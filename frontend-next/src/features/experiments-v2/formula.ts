// 化学式「文本 + 元素校验」纯逻辑与显示串预览。
// 元素校验 = 解析化学式里的元素符号 token，逐个比对周期表合法性（非周期表点选）。
// 显示串仅帮助录入者核对组成关系，不写入后端，也不承担权威校验。

/** 周期表 118 元素符号集合（用于元素合法性校验）。 */
export const ELEMENT_SYMBOLS = [
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
] as const
const ELEMENT_SYMBOL_SET = new Set<string>(ELEMENT_SYMBOLS)

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

export function normalizeChemicalFormula(input: string): string {
  return input
    .replace(/[₀-₉]/g, (ch) => SUBSCRIPT_MAP[ch] ?? ch)
    .replace(/[∙⋅]/g, '·')
    .replace(/\s+/g, '')
}

const FORMULA_UNIT = String.raw`(?:[A-Z][a-z]?(?:\d+(?:\.\d+)?)?|\((?:[A-Z][a-z]?(?:\d+(?:\.\d+)?)?)+\)(?:\d+(?:\.\d+)?)?)`
const FORMULA_COMPONENT = `(?:${FORMULA_UNIT})+`
const HYDRATED_FORMULA_COMPONENT = `${FORMULA_COMPONENT}(?:·(?:\\d+)?${FORMULA_COMPONENT})*`
const FORMULA_PATTERN = new RegExp(
  `^${HYDRATED_FORMULA_COMPONENT}(?:[-:/]${HYDRATED_FORMULA_COMPONENT})*$`,
)
const MATERIAL_FORMULA_PATTERN = new RegExp(
  `^(?:\\d+)?${HYDRATED_FORMULA_COMPONENT}$`,
)

/**
 * 从化学式抽取元素符号 token：把非字母字符（数字/下标/分隔符 / - : · ( ) 空格 等）视作断点，
 * 再按「大写字母 + 若干小写字母」贪婪切分（如 'MoS2'→['Mo','S']，'Al₂O₃'→['Al','O']）。
 */
export function extractElementSymbols(formula: string): string[] {
  const letters = normalizeChemicalFormula(formula).replace(/[^A-Za-z]+/g, ' ')
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
  /** 是否符合当前字段允许的元素与化学计量语法。 */
  syntaxValid: boolean
}

function validateFormula(input: string, pattern: RegExp): FormulaValidation {
  const trimmed = input.trim()
  if (trimmed === '') {
    return {
      valid: true,
      empty: true,
      elements: [],
      unknownSymbols: [],
      syntaxValid: true,
    }
  }
  const normalized = normalizeChemicalFormula(trimmed)
  const tokens = extractElementSymbols(normalized)
  const seen = new Set<string>()
  const elements: string[] = []
  const unknownSymbols: string[] = []
  for (const token of tokens) {
    if (ELEMENT_SYMBOL_SET.has(token)) {
      if (!seen.has(token)) {
        seen.add(token)
        elements.push(token)
      }
    } else if (!unknownSymbols.includes(token)) {
      unknownSymbols.push(token)
    }
  }
  const syntaxValid = pattern.test(normalized)
  const valid = syntaxValid && tokens.length > 0 && unknownSymbols.length === 0
  return {
    valid,
    empty: false,
    elements,
    unknownSymbols,
    syntaxValid,
  }
}

/** 目标体系化学式：允许 - : / 表达多材料显示串。 */
export function validateChemicalFormula(input: string): FormulaValidation {
  return validateFormula(input, FORMULA_PATTERN)
}

/** 单一物料化学式：与后端物料批次校验一致，不接受体系分隔符。 */
export function validateMaterialFormula(input: string): FormulaValidation {
  return validateFormula(input, MATERIAL_FORMULA_PATTERN)
}

const SUBSCRIPT_OUTPUT: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '.': '.',
  '-': '₋',
  x: 'ₓ',
}

export function formatChemicalFormula(formula: string): string {
  return normalizeChemicalFormula(formula).replace(
    /(?<=[A-Za-z)])(?:\d+(?:\.\d+)?)/g,
    (value) =>
      value
        .split('')
        .map((character) => SUBSCRIPT_OUTPUT[character] ?? character)
        .join(''),
  )
}

type FormulaPart = { element: string; count: number }

function simpleFormulaParts(formula: string): FormulaPart[] | null {
  const normalized = normalizeChemicalFormula(formula)
  const matches = [...normalized.matchAll(/([A-Z][a-z]?)(\d*(?:\.\d+)?)/g)]
  if (
    matches.length === 0 ||
    matches.map((match) => match[0]).join('') !== normalized
  ) {
    return null
  }
  return matches.map((match) => ({
    element: match[1],
    count: match[2] ? Number(match[2]) : 1,
  }))
}

function countText(value: number): string {
  return Number(value.toFixed(6)).toString()
}

export function generateSolidSolutionFormula(
  components: ReadonlyArray<{ formula: string; fraction?: number }>,
): string | null {
  const parsed = components.map(({ formula, fraction }) => ({
    parts: simpleFormulaParts(formula),
    fraction,
  }))
  const slotCount = parsed[0]?.parts?.length
  if (
    components.length < 2 ||
    !slotCount ||
    parsed.some(
      ({ parts, fraction }) =>
        !parts ||
        parts.length !== slotCount ||
        parts.some((part) => !ELEMENT_SYMBOL_SET.has(part.element)) ||
        fraction === undefined ||
        !(fraction > 0 && fraction < 1),
    ) ||
    Math.abs(
      parsed.reduce((sum, component) => sum + (component.fraction ?? 0), 0) - 1,
    ) > 1e-6
  ) {
    return null
  }

  return Array.from({ length: slotCount }, (_, index) => {
    const totals = new Map<string, number>()
    for (const component of parsed) {
      const part = component.parts![index]
      totals.set(
        part.element,
        (totals.get(part.element) ?? 0) + part.count * component.fraction!,
      )
    }
    return [...totals]
      .map(
        ([element, count]) =>
          `${element}${Math.abs(count - 1) < 1e-6 ? '' : countText(count)}`,
      )
      .join('')
  }).join('')
}

// ── 前端显示串预览 ──

export interface DisplayComponent {
  formula?: string | null
  role?: string | null
  layer_order?: string | number | null
}

function componentFormula(component: DisplayComponent): string {
  return String(component.formula ?? '').trim()
}

function layerOrder(component: DisplayComponent): [number, string] {
  const raw = component.layer_order
  const parsed = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10)
  const order = Number.isFinite(parsed) ? parsed : 0
  return [order, componentFormula(component)]
}

/**
 * 根据当前表单值生成即时预览：
 *  本征/无组分/掺杂 → 原化学式；垂直异质结 → 按层序升序 '/' 连接；
 *  横向异质结 → '-' 连接；其余 → 原化学式。
 * 该返回值不提交；组成明细仍是存储与校验依据。
 */
export function renderFormulaDisplay(
  chemicalFormula: string,
  structureType: string,
  components: DisplayComponent[] = [],
): string {
  const parts = components ?? []
  if (
    structureType === 'intrinsic' ||
    structureType === '本征' ||
    parts.length === 0
  )
    return chemicalFormula
  if (
    structureType === 'vertical_heterostructure' ||
    structureType === '垂直异质结'
  ) {
    const ordered = [...parts].sort((a, b) => {
      const [oa, fa] = layerOrder(a)
      const [ob, fb] = layerOrder(b)
      return oa - ob || fa.localeCompare(fb)
    })
    const joined = ordered.map(componentFormula).filter(Boolean).join('/')
    return joined || chemicalFormula
  }
  if (
    structureType === 'lateral_heterostructure' ||
    structureType === '横向异质结'
  ) {
    const joined = parts.map(componentFormula).filter(Boolean).join('-')
    return joined || chemicalFormula
  }
  return chemicalFormula
}
