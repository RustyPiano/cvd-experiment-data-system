// 一等实体库 API（P3 v2 端点）。类型走 OpenAPI 生成物的逃生舱别名，端点契约见 backend v2.py。
import { apiDownload, apiRequest } from '@/shared/api/client'
import type { components, FileAssetRead } from '@/shared/types/api'
import { HttpError } from '@/shared/api/http-error'
import { MAX_UPLOAD_BYTES } from '@/shared/file-assets'
import type { EntityKind } from './config'
import { entityConfigs } from './config'

type Schemas = components['schemas']

export type V2EntityRead = Schemas['V2EntityRead']
export type V2EntityListResponse = Schemas['V2EntityListResponse']
export type V2EntityVersionRead = Schemas['V2EntityVersionRead']
export type V2EntityVersionListResponse = Schemas['V2EntityVersionListResponse']

/** 一次录入的字段值（键为字段 key）。后端 V2EntityVersionPayload = freeform dict。 */
export type EntityVersionPayload = Record<string, unknown>
export type EntityFileAssetRead = FileAssetRead

function basePath(kind: EntityKind): string {
  return `/api/v1/${entityConfigs[kind].apiPath}`
}

export function listEntities(kind: EntityKind, token: string) {
  return apiRequest<V2EntityListResponse>(basePath(kind), { token })
}

export function getEntity(kind: EntityKind, entityId: string, token: string) {
  return apiRequest<V2EntityRead>(`${basePath(kind)}/${entityId}`, { token })
}

export function listEntityVersions(
  kind: EntityKind,
  entityId: string,
  token: string,
) {
  return apiRequest<V2EntityVersionListResponse>(
    `${basePath(kind)}/${entityId}/versions`,
    { token },
  )
}

/** 新建实体（生成 v1）。 */
export function createEntity(
  kind: EntityKind,
  payload: EntityVersionPayload,
  token: string,
) {
  return apiRequest<V2EntityRead>(basePath(kind), {
    method: 'POST',
    body: payload,
    token,
  })
}

/**
 * 「改动即新版本」核心端点：追加新版本（v{n+1}）。
 * 语义 = 不原地修改；旧版本行不可变，既有实验引用 (entity_id, version) 不受影响。
 */
export function appendEntityVersion(
  kind: EntityKind,
  entityId: string,
  payload: EntityVersionPayload,
  token: string,
) {
  return apiRequest<V2EntityVersionRead>(
    `${basePath(kind)}/${entityId}/versions`,
    {
      method: 'POST',
      body: payload,
      token,
    },
  )
}

export function uploadEntityFile(
  token: string,
  payload: { file: File; note?: string },
) {
  if (payload.file.size === 0) {
    const detail = 'Uploaded file is empty'
    return Promise.reject(new HttpError(422, detail, { detail }))
  }
  if (payload.file.size > MAX_UPLOAD_BYTES) {
    const detail = `Uploaded file exceeds ${MAX_UPLOAD_BYTES} bytes`
    return Promise.reject(new HttpError(413, detail, { detail }))
  }
  const body = new FormData()
  body.set('file', payload.file)
  if (payload.note?.trim()) body.set('note', payload.note.trim())
  return apiRequest<EntityFileAssetRead>('/api/v1/entity-files', {
    method: 'POST',
    body,
    token,
  })
}

export function getEntityFile(token: string, fileId: string) {
  return apiRequest<EntityFileAssetRead>(`/api/v1/entity-files/${fileId}`, {
    token,
  })
}

export function downloadEntityFile(
  token: string,
  fileId: string,
  signal?: AbortSignal,
) {
  return apiDownload(`/api/v1/entity-files/${fileId}/download`, {
    token,
    ...(signal ? { signal } : {}),
  })
}

export function deleteEntityFile(token: string, fileId: string) {
  return apiRequest<void>(`/api/v1/entity-files/${fileId}`, {
    method: 'DELETE',
    token,
  })
}
