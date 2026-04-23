/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from "react";
import { createContext, useContext, useState } from "react";

import { readJsonStorage, removeStorageItem, writeJsonStorage } from "../../shared/lib/storage";
import type { UserRead } from "../../shared/types/api";

export const SESSION_STORAGE_KEY = "cvd.auth.session";

export type SessionUser = UserRead;

export type SessionSnapshot = {
  accessToken: string | null;
  currentUser: SessionUser | null;
  isAuthenticated: boolean;
};

type AuthContextValue = {
  session: SessionSnapshot;
  setSession: (session: SessionSnapshot) => void;
  clearSession: () => void;
};

export function createSessionSnapshot(
  accessToken: string | null,
  currentUser: SessionUser | null = null,
): SessionSnapshot {
  return {
    accessToken,
    currentUser,
    isAuthenticated: accessToken !== null,
  };
}

const defaultSession = createSessionSnapshot(null);

const defaultContextValue: AuthContextValue = {
  session: defaultSession,
  setSession: () => undefined,
  clearSession: () => undefined,
};

type StoredSession = {
  accessToken: string;
  currentUser: SessionUser;
};

function restoreSessionSnapshot() {
  const storedSession = readJsonStorage<StoredSession>(SESSION_STORAGE_KEY);
  if (!storedSession?.accessToken || !storedSession.currentUser) {
    return defaultSession;
  }

  return createSessionSnapshot(storedSession.accessToken, storedSession.currentUser);
}

function persistSession(snapshot: SessionSnapshot) {
  if (!snapshot.accessToken || !snapshot.currentUser) {
    removeStorageItem(SESSION_STORAGE_KEY);
    return;
  }

  writeJsonStorage(SESSION_STORAGE_KEY, {
    accessToken: snapshot.accessToken,
    currentUser: snapshot.currentUser,
  });
}

const AuthContext = createContext<AuthContextValue>(defaultContextValue);

export function AuthProvider({
  children,
  value,
}: {
  children: ReactNode;
  value?: Pick<AuthContextValue, "session">;
}) {
  const [session, setSessionState] = useState(restoreSessionSnapshot);

  const setSession = (nextSession: SessionSnapshot) => {
    persistSession(nextSession);
    setSessionState(nextSession);
  };

  const clearSession = () => {
    removeStorageItem(SESSION_STORAGE_KEY);
    setSessionState(defaultSession);
  };

  const contextValue: AuthContextValue = value
    ? { ...defaultContextValue, ...value }
    : { session, setSession, clearSession };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
