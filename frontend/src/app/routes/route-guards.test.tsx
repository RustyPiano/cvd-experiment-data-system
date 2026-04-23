import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AuthProvider } from "../../features/auth/auth-store";
import { ProtectedRoute } from "./route-guards";

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
});
