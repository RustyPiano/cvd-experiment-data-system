import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AuthProvider, createSessionSnapshot, type SessionUser } from "../../features/auth/auth-store";
import { AdminRoute, ProtectedRoute } from "./route-guards";

const adminUser: SessionUser = {
  id: "admin-1",
  email: "admin@example.com",
  name: "Admin",
  role: "admin",
  is_active: true,
  last_login_at: null,
};

const memberUser: SessionUser = {
  id: "member-1",
  email: "member@example.com",
  name: "Member",
  role: "member",
  is_active: true,
  last_login_at: null,
};

describe("ProtectedRoute", () => {
  it("redirects anonymous users to /login", async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/experiments"]}>
          <Routes>
            <Route
              path="/experiments"
              element={
                <ProtectedRoute>
                  <div>secret experiments</div>
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<div>login screen</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText("login screen")).toBeInTheDocument();
  });

  it("renders admin-only routes for admins", async () => {
    render(
      <AuthProvider value={{ session: createSessionSnapshot("token-123", adminUser) }}>
        <MemoryRouter initialEntries={["/admin/dashboard"]}>
          <Routes>
            <Route
              path="/admin/dashboard"
              element={
                <AdminRoute>
                  <div>admin dashboard</div>
                </AdminRoute>
              }
            />
            <Route path="/experiments" element={<div>experiment list</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText("admin dashboard")).toBeInTheDocument();
  });

  it("redirects authenticated non-admin users away from admin-only routes", async () => {
    render(
      <AuthProvider value={{ session: createSessionSnapshot("token-123", memberUser) }}>
        <MemoryRouter initialEntries={["/admin/dashboard"]}>
          <Routes>
            <Route
              path="/admin/dashboard"
              element={
                <AdminRoute>
                  <div>admin dashboard</div>
                </AdminRoute>
              }
            />
            <Route path="/experiments" element={<div>experiment list</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText("experiment list")).toBeInTheDocument();
  });
});
