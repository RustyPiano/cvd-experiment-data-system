export function readJsonStorage<T>(key: string) {
  const rawValue = window.localStorage.getItem(key);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

export function writeJsonStorage(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function removeStorageItem(key: string) {
  window.localStorage.removeItem(key);
}
