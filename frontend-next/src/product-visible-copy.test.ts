import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const PRODUCT_PAGES = [
  'shared/ui/app-shell.tsx',
  'features/experiments-v2/simple-experiment-create-form.tsx',
  'features/experiments-v2/experiment-v2-edit-page.tsx',
  // The current six-step UI is provided by these simple editors; the parent
  // file also retains unmounted legacy editors for the internal scientific model.
  'features/experiments-v2/simple-preparation-editors.tsx',
  'features/experiments-v2/simple-characterization-workspace.tsx',
  'features/characterizations/characterization-list-page.tsx',
  'features/samples/sample-list-page.tsx',
  'features/samples/sample-detail-page.tsx',
]

const FORBIDDEN_TERMS = [
  'RunRevision',
  'Revision',
  '不可变修订',
  'Schema',
  'Schema status',
  'Manifest',
  '查询指纹',
  'Provenance',
  '溯源完整性',
  'SourceLoad',
  '物理装料',
  'ProcessChannel',
  '过程通道',
  '物理通道实例',
  'Subject ref',
  'Canonical',
  'Projection',
  'MaterialAssertion',
  'Assertion',
  'AnalysisRun',
  'SampleRevisionState',
  'Evidence bundle',
  'Citable',
  'NON_CITABLE',
  'Superseded',
]

function visibleLiterals(path: string) {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const values: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) values.push(node.getText(source))
    if (
      ts.isJsxAttribute(node) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    ) {
      values.push(node.initializer.text)
    }
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      ['description', 'label', 'placeholder', 'title'].includes(
        node.name.text,
      ) &&
      ts.isStringLiteralLike(node.initializer)
    ) {
      values.push(node.initializer.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return values.join('\n')
}

describe('ordinary-user visible copy', () => {
  it('does not expose internal model terms', () => {
    const copy = PRODUCT_PAGES.map((path) =>
      visibleLiterals(join(process.cwd(), 'src', path)),
    ).join('\n')

    for (const term of FORBIDDEN_TERMS) {
      expect(copy.toLowerCase()).not.toContain(term.toLowerCase())
    }
  })
})
