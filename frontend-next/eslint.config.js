//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
      // Backend OpenAPI types overstate non-nullability (enums sent as bare
      // `string`, nullable columns typed non-null). We deliberately keep
      // defensive guards at trust boundaries (parsed JSON, API responses,
      // record index access), so this rule produces false positives here.
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
  {
    // Vendored shadcn/ui primitives — kept close to upstream source.
    files: ['src/components/ui/**'],
    rules: {
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'off',
    },
  },
  {
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      'public/**',
      'src/routeTree.gen.ts',
      // Generator⑤ output (data module) + the bun build script that emits it.
      // The data file is generated from docs/standard/field-source.yaml and is
      // typechecked (kept in tsconfig include); the bun script uses Bun globals
      // and runs outside the app's browser tsconfig.
      'src/shared/generated/field-metadata.ts',
      'scripts/**',
    ],
  },
]
