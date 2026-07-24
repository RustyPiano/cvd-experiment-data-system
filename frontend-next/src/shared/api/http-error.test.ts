import { afterEach, describe, expect, it } from 'vitest'

import i18n from '@/shared/i18n'
import { HttpError, resolveErrorMessage } from './http-error'

afterEach(async () => {
  await i18n.changeLanguage('zh')
})

describe('resolveErrorMessage', () => {
  it('resolves HTTP 403 status code to friendly Chinese error', () => {
    const error = new HttpError(403, 'Forbidden', null)
    expect(resolveErrorMessage(error, '默认错误')).toBe('权限不足，拒绝访问')
  })

  it('resolves HTTP 401 status code to friendly Chinese error', () => {
    const errorUnauthorized = new HttpError(401, 'Unauthorized', null)
    const errorInvalidCreds = new HttpError(401, 'Invalid credentials', null)
    const errorInactive = new HttpError(401, 'Inactive user', null)

    expect(resolveErrorMessage(errorUnauthorized, '默认错误')).toBe(
      '登录会话已过期，请重新登录',
    )
    expect(resolveErrorMessage(errorInvalidCreds, '默认错误')).toBe(
      '邮箱或密码错误',
    )
    expect(resolveErrorMessage(errorInactive, '默认错误')).toBe(
      '该账号已被禁用，请联系管理员',
    )
  })

  it('resolves HTTP 5xx status codes to friendly Chinese error', () => {
    const error500 = new HttpError(500, 'Internal Server Error', null)
    const error503 = new HttpError(503, 'Service Unavailable', null)
    const errorCustom = new HttpError(
      500,
      'OperationalError: postgres connection failed',
      null,
    )
    expect(resolveErrorMessage(error500, '默认错误')).toBe(
      '服务器内部错误，请稍后重试',
    )
    expect(resolveErrorMessage(error503, '默认错误')).toBe(
      '服务器内部错误，请稍后重试',
    )
    expect(resolveErrorMessage(errorCustom, '默认错误')).toBe(
      '服务器内部错误，请稍后重试',
    )
  })

  it('resolves other HTTP status codes to error.detail or fallback', () => {
    const errorDetail = new HttpError(400, '密码错误', null)
    const errorNoDetail = new HttpError(400, null, null)
    expect(resolveErrorMessage(errorDetail, '默认错误')).toBe('密码错误')
    expect(resolveErrorMessage(errorNoDetail, '默认错误')).toBe('默认错误')
  })

  it('translates known backend details and hides unknown English 4xx details', () => {
    expect(
      resolveErrorMessage(
        new HttpError(409, 'Run code already exists', null),
        '默认错误',
      ),
    ).toBe('炉次编号已存在')
    expect(
      resolveErrorMessage(
        new HttpError(400, 'Unexpected internal wording', null),
        '默认错误',
      ),
    ).toBe('请求无效，请检查输入')
    expect(
      resolveErrorMessage(
        new HttpError(
          409,
          'Delete active attachments before deleting the result',
          null,
        ),
        '默认错误',
      ),
    ).toBe('该结果仍有附件，请先删除附件再删除结果')
  })

  it('keeps structured validation details on the form fallback path', () => {
    expect(
      resolveErrorMessage(
        new HttpError(422, null, { detail: { missing: ['run_code'] } }),
        '请补齐字段',
      ),
    ).toBe('请补齐字段')
  })

  it('renders byte-limit details in MB', () => {
    expect(
      resolveErrorMessage(
        new HttpError(413, 'Uploaded file exceeds 10485760 bytes', null),
        '上传失败',
      ),
    ).toBe('上传文件不能超过 10 MB')
  })

  it('uses the active locale for shared error messages', async () => {
    await i18n.changeLanguage('en')
    expect(
      resolveErrorMessage(
        new HttpError(403, 'Insufficient permissions', null),
        'Failed',
      ),
    ).toBe('You do not have permission to perform this action')
  })

  it('resolves network errors to friendly Chinese error', () => {
    const fetchErr = new Error('Failed to fetch')
    const networkErr = new Error(
      'NetworkError when attempting to fetch resource.',
    )
    const failedErr = new Error('fetch failed')
    expect(resolveErrorMessage(fetchErr, '默认错误')).toBe(
      '网络连接失败，请检查网络设置或稍后重试',
    )
    expect(resolveErrorMessage(networkErr, '默认错误')).toBe(
      '网络连接失败，请检查网络设置或稍后重试',
    )
    expect(resolveErrorMessage(failedErr, '默认错误')).toBe(
      '网络连接失败，请检查网络设置或稍后重试',
    )
  })

  it('filters out JS runtime errors and shows fallback', () => {
    const typeErr = new TypeError(
      "Cannot read properties of undefined (reading 'status')",
    )
    const refErr = new ReferenceError('x is not defined')
    const syntaxErr = new SyntaxError('Unexpected token')
    expect(resolveErrorMessage(typeErr, '操作失败，请重试')).toBe(
      '操作失败，请重试',
    )
    expect(resolveErrorMessage(refErr, '操作失败，请重试')).toBe(
      '操作失败，请重试',
    )
    expect(resolveErrorMessage(syntaxErr, '操作失败，请重试')).toBe(
      '操作失败，请重试',
    )
  })

  it('filters out error messages containing technical substrings', () => {
    const customErr1 = new Error('something is undefined')
    const customErr2 = new Error('cannot read property foo of null')
    const customErr3 = new Error('foo is not a function')
    expect(resolveErrorMessage(customErr1, '默认错误')).toBe('默认错误')
    expect(resolveErrorMessage(customErr2, '默认错误')).toBe('默认错误')
    expect(resolveErrorMessage(customErr3, '默认错误')).toBe('默认错误')
  })

  it('keeps standard error messages that are not technical', () => {
    const customErr = new Error('用户名已被占用')
    expect(resolveErrorMessage(customErr, '默认错误')).toBe('用户名已被占用')
  })

  it('returns fallback for unknown error types', () => {
    expect(resolveErrorMessage({ some: 'object' }, '默认错误')).toBe('默认错误')
    expect(resolveErrorMessage('just a string', '默认错误')).toBe('默认错误')
  })
})
