import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Routes, useLocation } from "react-router-dom";

import { API_UNAUTHORIZED_EVENT } from "../api/client";
import { AppShell } from "./app-shell";
import { renderWithApp } from "../../test/render";

describe("AppShell", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("clears experiment query cache after logout", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    queryClient.setQueryData(["experiments", "list", "u-1"], {
      items: [{ id: "exp-1" }],
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 204,
        }),
      ),
    );

    renderWithApp(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/experiments" element={<div>workspace</div>} />
        </Route>
        <Route path="/login" element={<div>login screen</div>} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments"],
        queryClient,
        user: {
          id: "u-1",
          email: "member@example.com",
          name: "Member",
          role: "member",
          is_active: true,
          last_login_at: null,
        },
      },
    );

    await user.click(screen.getByRole("button", { name: "退出" }));

    await waitFor(() => {
      expect(screen.getByText("login screen")).toBeInTheDocument();
      expect(queryClient.getQueryData(["experiments", "list", "u-1"])).toBeUndefined();
    });
  });

  it("clears session and query cache after an unauthorized event", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    queryClient.setQueryData(["experiments", "list", "u-1"], {
      items: [{ id: "exp-1" }],
    });

    renderWithApp(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/experiments" element={<div>workspace</div>} />
        </Route>
        <Route path="/login" element={<div>login screen</div>} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments"],
        queryClient,
        user: {
          id: "u-1",
          email: "member@example.com",
          name: "Member",
          role: "member",
          is_active: true,
          last_login_at: null,
        },
      },
    );

    window.dispatchEvent(new Event(API_UNAUTHORIZED_EVENT));

    await waitFor(() => {
      expect(screen.getByText("login screen")).toBeInTheDocument();
      expect(queryClient.getQueryData(["experiments", "list", "u-1"])).toBeUndefined();
      expect(window.localStorage.getItem("cvd.auth.session")).toBeNull();
    });
  });

  it("passes a session expired reason to the login route after an unauthorized event", async () => {
    function LoginRouteProbe() {
      const location = useLocation();
      return (
        <div>
          <span>{location.state?.reason}</span>
          <span>{location.state?.from}</span>
        </div>
      );
    }

    renderWithApp(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/experiments/:experimentId/files" element={<div>workspace</div>} />
        </Route>
        <Route path="/login" element={<LoginRouteProbe />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1/files?tab=raw"],
        user: {
          id: "u-1",
          email: "member@example.com",
          name: "Member",
          role: "member",
          is_active: true,
          last_login_at: null,
        },
      },
    );

    window.dispatchEvent(new Event(API_UNAUTHORIZED_EVENT));

    expect(await screen.findByText("session-expired")).toBeInTheDocument();
    expect(screen.getByText("/experiments/exp-1/files?tab=raw")).toBeInTheDocument();
  });

  it("updates the shell sidebar width variable when the sider collapses", async () => {
    const user = userEvent.setup();

    renderWithApp(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/experiments" element={<div>workspace</div>} />
        </Route>
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments"],
      },
    );

    const shell = screen.getByTestId("app-shell-layout");
    expect(shell).toHaveStyle({ "--app-sidebar-width": "232px" });

    await user.click(screen.getByLabelText("left"));

    expect(shell).toHaveStyle({ "--app-sidebar-width": "80px" });
  });

  it("hides the vocabulary admin entry for non-admin users", async () => {
    renderWithApp(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/experiments" element={<div>workspace</div>} />
        </Route>
        <Route path="/login" element={<div>login screen</div>} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments"],
        user: {
          id: "u-1",
          email: "member@example.com",
          name: "Member",
          role: "member",
          is_active: true,
          last_login_at: null,
        },
      },
    );

    expect(screen.queryByRole("link", { name: "受控词表" })).not.toBeInTheDocument();
  });

  it("shows the vocabulary admin entry for admin users", async () => {
    renderWithApp(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/experiments" element={<div>workspace</div>} />
        </Route>
        <Route path="/login" element={<div>login screen</div>} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments"],
        user: {
          id: "admin-1",
          email: "admin@example.com",
          name: "Admin",
          role: "admin",
          is_active: true,
          last_login_at: null,
        },
      },
    );

    expect(screen.queryAllByRole("link", { name: "受控词表" }).length).toBeGreaterThan(0);
  });
});
