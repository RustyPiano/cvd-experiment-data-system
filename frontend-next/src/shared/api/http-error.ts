import i18n from '@/shared/i18n'

const DETAIL_KEYS = {
  'Invalid credentials': 'errors.details.invalidCredentials',
  'Inactive user': 'errors.details.inactiveUser',
  'Invalid invite code': 'errors.details.invalidInviteCode',
  'User with this email already exists': 'errors.details.emailExists',
  'Not authenticated': 'errors.details.sessionExpired',
  'Invalid token': 'errors.details.sessionExpired',
  'User not found': 'errors.details.sessionExpired',
  'Insufficient permissions': 'errors.details.insufficientPermissions',
  'Admin required': 'errors.details.adminRequired',
  'Run code already exists': 'errors.details.runCodeExists',
  'Experiment cannot be invalidated': 'errors.details.cannotInvalidate',
  'Experiment not found': 'errors.details.experimentNotFound',
  'Module payload not found': 'errors.details.moduleNotFound',
  'Locked or invalid experiments cannot be edited':
    'errors.details.lockedOrInvalidReadOnly',
  'Invalid experiments cannot be edited': 'errors.details.invalidReadOnly',
  'Parent sample must belong to the same experiment':
    'errors.details.parentSampleExperimentMismatch',
  'Sample role already exists for experiment':
    'errors.details.sampleRoleExists',
  'Sample code already exists': 'errors.details.sampleCodeExists',
  'Sample not found': 'errors.details.sampleNotFound',
  'instrument_id and instrument_version must be provided together':
    'errors.details.instrumentPairRequired',
  'Referenced instrument version does not exist':
    'errors.details.instrumentVersionNotFound',
  'Delete or otherwise handle active attachments before deleting the characterization record':
    'errors.details.deleteAttachmentsFirst',
  'Delete linked measured products before deleting the characterization record':
    'errors.details.deleteProductsFirst',
  'characterization_record_id must belong to the sample':
    'errors.details.characterizationSampleMismatch',
  'Invalid method_instrument': 'errors.details.invalidMethodInstrument',
  'Record not found': 'errors.details.recordNotFound',
  'Product not found': 'errors.details.productNotFound',
  'Entity not found': 'errors.details.entityNotFound',
  'Version already exists': 'errors.details.versionExists',
  'Version not found': 'errors.details.versionNotFound',
  'Setup diagram cannot be linked to a characterization record':
    'errors.details.setupDiagramCharacterization',
  'Characterization record must belong to the same experiment':
    'errors.details.characterizationExperimentMismatch',
  'Sample must match the characterization record':
    'errors.details.sampleCharacterizationMismatch',
  'Sample must belong to the same experiment':
    'errors.details.sampleExperimentMismatch',
  'Setup diagram cannot be linked to a sample':
    'errors.details.setupDiagramSample',
  'File method must match the characterization record':
    'errors.details.fileMethodMismatch',
  'File method is required': 'errors.details.fileMethodRequired',
  'File not found': 'errors.details.fileNotFound',
  'File content not found': 'errors.details.fileContentNotFound',
  'Uploaded file is empty': 'errors.details.emptyFile',
  'Invalid file method': 'errors.details.invalidFileMethod',
  'Invalid asset role': 'errors.details.invalidAssetRole',
  'Invalid file category': 'errors.details.invalidFileCategory',
  '\u65e0 must be the only external field device selection':
    'errors.details.noneFieldDeviceExclusive',
  'field_params is required when referenced setup has external field devices':
    'errors.details.fieldParamsRequired',
} as const

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
    const detailKey = error.detail
      ? DETAIL_KEYS[error.detail as keyof typeof DETAIL_KEYS]
      : undefined
    if (detailKey) return i18n.t(detailKey)

    const byteLimit = error.detail?.match(/^Uploaded file exceeds (\d+) bytes$/)
    if (byteLimit) {
      return i18n.t('errors.details.fileTooLarge', {
        size: Number(byteLimit[1]) / 1024 / 1024,
      })
    }

    const requiredStatus = error.detail?.match(/^Experiment must be (.+)$/)
    if (requiredStatus) {
      return i18n.t('errors.details.experimentMustBe', {
        status: requiredStatus[1],
      })
    }

    const unknownFields = error.detail?.match(
      /^Unknown (.+) field keys: (.+)$/,
    )
    if (unknownFields) {
      return i18n.t('errors.details.unknownFieldKeys', {
        fields: unknownFields[2],
      })
    }

    if (error.status === 401) return i18n.t('errors.details.sessionExpired')
    if (error.status === 403) {
      return i18n.t('errors.details.insufficientPermissions')
    }
    if (error.status >= 500) return i18n.t('errors.server')
    if (error.status >= 400 && error.status < 500) {
      const structuredDetail =
        error.payload !== null &&
        typeof error.payload === 'object' &&
        'detail' in error.payload &&
        error.payload.detail !== null &&
        typeof error.payload.detail === 'object'
      if (!error.detail || structuredDetail) {
        return fallback
      }
      if (/[^\p{ASCII}]/u.test(error.detail)) return error.detail
      if (error.status === 404) return i18n.t('errors.notFound')
      if (error.status === 409) return i18n.t('errors.conflict')
      if (error.status === 422) return i18n.t('errors.validation')
      return i18n.t('errors.badRequest')
    }
    return fallback
  }

  if (error instanceof Error) {
    const msg = error.message
    if (
      msg.includes('Failed to fetch') ||
      msg.includes('NetworkError') ||
      msg.includes('fetch failed')
    ) {
      return i18n.t('errors.network')
    }

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
