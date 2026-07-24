function browserStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function readJsonStorage<T>(key: string) {
  const storage = browserStorage()
  const rawValue = storage?.getItem(key)
  if (!rawValue) {
    return null
  }

  try {
    return JSON.parse(rawValue) as T
  } catch {
    storage?.removeItem(key)
    return null
  }
}

export function writeJsonStorage(key: string, value: unknown) {
  browserStorage()?.setItem(key, JSON.stringify(value))
}

export function removeStorageItem(key: string) {
  browserStorage()?.removeItem(key)
}
