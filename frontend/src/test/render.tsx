import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { App as AntdApp } from "antd";
import { MemoryRouter, type MemoryRouterProps } from "react-router-dom";

import {
  AuthProvider,
  SESSION_STORAGE_KEY,
  createSessionSnapshot,
  type SessionUser,
} from "../features/auth/auth-store";

type RenderWithAppOptions = {
  authenticated?: boolean;
  initialEntries?: MemoryRouterProps["initialEntries"];
  queryClient?: QueryClient;
  user?: SessionUser;
};

const defaultUser: SessionUser = {
  id: "u-1",
  email: "member@example.com",
  name: "Test Member",
  role: "member",
  is_active: true,
  last_login_at: null,
};

export function renderWithApp(
  ui: ReactNode,
  options: RenderWithAppOptions = {},
) {
  const queryClient =
    options.queryClient ??
    new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

  const session = options.authenticated
    ? createSessionSnapshot("token-123", options.user ?? defaultUser)
    : createSessionSnapshot(null);

  window.localStorage.clear();
  if (session.accessToken && session.currentUser) {
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        accessToken: session.accessToken,
        currentUser: session.currentUser,
      }),
    );
  }

  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AntdApp>
          <MemoryRouter initialEntries={options.initialEntries}>
            {ui}
          </MemoryRouter>
        </AntdApp>
      </AuthProvider>
    </QueryClientProvider>,
  );

  return {
    ...result,
    queryClient,
  };
}
