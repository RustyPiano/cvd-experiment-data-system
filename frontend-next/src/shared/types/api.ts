// 保留页面共用的 OpenAPI 薄别名；生成契约见 ./openapi.d.ts。
import type { components } from './openapi'

type Schemas = components['schemas']

export type UserRole = 'admin' | 'member'
export type ExperimentStatus = Schemas['V2ExperimentRead']['status']

export type UserRead = Omit<Schemas['UserRead'], 'role'> & { role: UserRole }
export type TokenResponse = Omit<Schemas['TokenResponse'], 'user'> & {
  user: UserRead
}

export type LoginRequest = Schemas['LoginRequest']
export type RegisterRequest = Schemas['RegisterRequest']
export type FileAssetListResponse = Schemas['FileAssetListResponse']
export type FileAssetRead = Schemas['FileAssetRead']
export type SampleListResponse = Schemas['SampleListResponse']
export type SampleRead = Schemas['SampleRead']

export type { components, paths } from './openapi'
