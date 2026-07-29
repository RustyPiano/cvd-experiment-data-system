import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')
const EXCLUDED_FILES = new Set([
  // These strings are domain values mirrored from field-source.yaml.
  'features/experiments-v2/formula.ts',
  'features/experiments-v2/field-logic.ts',
  'features/entity-library/field-logic.ts',
  'shared/composite-field.ts',
  // Gas-cylinder matching accepts frozen Chinese lot names as domain aliases.
  'features/experiments-v2/components/gas-feeds-editor.tsx',
  // Input-shape discriminators are domain values consumed by composite-field.ts.
  'shared/ui/composite-field-control.tsx',
  // This experiments-v2 file is explicitly owned by another batch and forbidden here.
  'features/experiments-v2/components/field-control.tsx',
  // ponytail: v4 scientific trial screens are Chinese-first; move these strings
  // into both locale trees when the group starts an English-language trial.
  'features/datasets/dataset-query-page.tsx',
  'features/experiments-v2/api.ts',
  'features/experiments-v2/experiment-v2-edit-page.tsx',
  'features/experiments-v2/scientific-experiment-form.tsx',
  'features/experiments-v2/scientific-form-workflow.ts',
  'features/experiments-v2/simple-characterization-workspace.tsx',
  'features/experiments-v2/simple-form-adapters.ts',
  'features/experiments-v2/simple-preparation-editors.tsx',
  'features/samples/sample-detail-page.tsx',
  'features/samples/sample-list-page.tsx',
])

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return ['locales', 'generated'].includes(entry.name)
        ? []
        : sourceFiles(path)
    }
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)
      ? [path]
      : []
  })
}

function cjkLiterals(path: string): string[] {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const failures: string[] = []
  const visit = (node: ts.Node) => {
    const text =
      ts.isStringLiteralLike(node) ||
      ts.isJsxText(node) ||
      [
        ts.SyntaxKind.TemplateHead,
        ts.SyntaxKind.TemplateMiddle,
        ts.SyntaxKind.TemplateTail,
      ].includes(node.kind)
        ? node.getText(source)
        : ''
    if (/\p{Script=Han}/u.test(text)) {
      const { line } = source.getLineAndCharacterOfPosition(
        node.getStart(source),
      )
      failures.push(`${relative(SRC, path)}:${line + 1} ${text}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return failures
}

describe('i18n hardcoded copy guard', () => {
  it('keeps CJK UI copy in locale files', () => {
    const failures = sourceFiles(SRC)
      .filter((path) => !EXCLUDED_FILES.has(relative(SRC, path)))
      .flatMap(cjkLiterals)
    expect(failures).toEqual([])
  })
})
