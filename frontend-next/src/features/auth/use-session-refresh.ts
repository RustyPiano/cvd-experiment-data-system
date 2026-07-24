import { useEffect, useRef } from 'react'

import { decodeJwtExpMs } from '@/shared/lib/jwt'
import { HttpError } from '@/shared/api/http-error'
import { refreshSession } from './api'
import { createSessionSnapshot, useAuth } from './auth-store'

// Renew the token this long before it actually expires, so an in-flight request
// never races the expiry boundary.
const REFRESH_LEAD_MS = 5 * 60 * 1000
// When the tab regains focus (e.g. laptop woke up, timers were throttled),
// proactively renew if the token is within this window of expiring.
const FOCUS_REFRESH_WINDOW_MS = 30 * 60 * 1000
const TRANSIENT_RETRY_MS = 30 * 1000

export function sessionRefreshDelay(expMs: number, nowMs = Date.now()) {
  const remaining = expMs - nowMs
  return remaining > REFRESH_LEAD_MS
    ? remaining - REFRESH_LEAD_MS
    : Math.max(Math.floor(remaining / 2), 0)
}

/**
 * Keeps an actively-used session alive: schedules a silent token refresh shortly
 * before expiry and also renews on tab refocus. As long as the user keeps using
 * the app the token never lapses; only true inactivity (longer than the token
 * lifetime) falls through to the global 401 → logout handler.
 *
 * Mounted once inside the authenticated shell.
 */
export function useSessionRefresh() {
  const { session, setSession } = useAuth()
  const token = session.accessToken

  // Hold the latest setter in a ref so the effect only re-runs when the token
  // itself changes (not on every shell re-render).
  const setSessionRef = useRef(setSession)
  setSessionRef.current = setSession

  useEffect(() => {
    if (!token) {
      return
    }

    let cancelled = false
    let inFlight = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const doRefresh = async () => {
      if (inFlight || cancelled) {
        return
      }
      inFlight = true
      try {
        const next = await refreshSession(token)
        if (!cancelled) {
          // Token change re-runs this effect, which reschedules from the new exp.
          setSessionRef.current(
            createSessionSnapshot(next.access_token, next.user),
          )
        }
      } catch (error) {
        // A 401 here means the token already lapsed; the API client dispatches
        // the unauthorized event and the global handler logs out.
        if (
          !cancelled &&
          !(error instanceof HttpError && error.status === 401)
        ) {
          if (timer) clearTimeout(timer)
          timer = setTimeout(() => void doRefresh(), TRANSIENT_RETRY_MS)
        }
      } finally {
        inFlight = false
      }
    }

    const expMs = decodeJwtExpMs(token)
    if (expMs != null) {
      timer = setTimeout(() => void doRefresh(), sessionRefreshDelay(expMs))
    }

    const onFocus = () => {
      if (document.visibilityState === 'hidden') {
        return
      }
      const exp = decodeJwtExpMs(token)
      if (exp != null && exp - Date.now() < FOCUS_REFRESH_WINDOW_MS) {
        void doRefresh()
      }
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)

    return () => {
      cancelled = true
      if (timer) {
        clearTimeout(timer)
      }
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [token])
}
