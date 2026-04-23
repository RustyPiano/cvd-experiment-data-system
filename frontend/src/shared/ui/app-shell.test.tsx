import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

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
