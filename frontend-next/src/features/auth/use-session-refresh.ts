import { useEffect, useRef } from 'react'

import { decodeJwtExpMs } from '@/shared/lib/jwt'
import { refreshSession } from './api'
import { createSessionSnapshot, useAuth } from './auth-store'

// Renew the token this long before it actually expires, so an in-flight request
// never races the expiry boundary.
const REFRESH_LEAD_MS = 5 * 60 * 1000
// When the tab regains focus (e.g. laptop woke up, timers were throttled),
// proactively renew if the token is within this window of expiring.
const FOCUS_REFRESH_WINDOW_MS = 30 * 60 * 1000

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
      } catch {
        // A 401 here means the token already lapsed; the API client dispatches
        // the unauthorized event and the global handler logs out. Any other
        // (e.g. network) error: keep the current token and let the next focus
        // or the scheduled timer retry.
      } finally {
        inFlight = false
      }
    }

    const expMs = decodeJwtExpMs(token)
    if (expMs != null) {
      const delay = Math.max(expMs - Date.now() - REFRESH_LEAD_MS, 0)
      timer = setTimeout(() => void doRefresh(), delay)
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
