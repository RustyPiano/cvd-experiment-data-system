export class HttpError extends Error {
  status: number
  detail: string | null
  payload: unknown

  constructor(status: number, detail: string | null, payload: unknown) {
    super(detail ?? `Request failed with status ${status}`)
    this.name = 'HttpError'
    this.status = status
    this.detail = detail
    this.payload = payload
  }
}

export function resolveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpError) {
    if (error.status === 403) {
      if (
        error.detail &&
        !['Forbidden', 'Not enough permissions'].includes(error.detail)
      ) {
        return error.detail
      }
      return '权限不足，拒绝访问'
    }
    if (error.status === 401) {
      if (error.detail) {
        if (error.detail === 'Invalid credentials') {
          return '邮箱或密码错误'
        }
        if (error.detail === 'Inactive user') {
          return '该账号已被禁用，请联系管理员'
        }
        if (
          ![
            'Unauthorized',
            'Not authenticated',
            'Could not validate credentials',
            'Invalid token',
            'User not found',
          ].includes(error.detail)
        ) {
          return error.detail
        }
      }
      return '登录会话已过期，请重新登录'
    }
    if (error.status >= 500) {
      return '服务器内部错误，请稍后重试'
    }
    return error.detail || fallback
  }

  if (error instanceof Error) {
    const msg = error.message
    if (
      msg.includes('Failed to fetch') ||
      msg.includes('NetworkError') ||
      msg.includes('fetch failed')
    ) {
      return '网络连接失败，请检查网络设置或稍后重试'
    }

    // 过滤 JS 引擎内置异常和包含底层技术词汇的报错，防止原始信息泄露
    if (
      error instanceof TypeError ||
      error instanceof ReferenceError ||
      error instanceof RangeError ||
      error instanceof SyntaxError ||
      error instanceof EvalError ||
      error instanceof URIError ||
      /undefined|null|cannot read|is not defined|is not a function/i.test(msg)
    ) {
      return fallback
    }
    return msg
  }

  return fallback
}
