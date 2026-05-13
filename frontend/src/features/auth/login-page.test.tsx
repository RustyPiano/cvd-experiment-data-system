import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoginPage } from "./login-page";
import { renderWithApp } from "../../test/render";

describe("LoginPage", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("stores the session after a successful login", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "token-123",
          token_type: "bearer",
          expires_in: 3600,
          user: {
            id: "u-1",
            email: "admin@example.com",
            name: "Admin User",
            role: "admin",
            is_active: true,
            last_login_at: null,
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);
    renderWithApp(<LoginPage />, {
      initialEntries: ["/login"],
    });

    await user.type(screen.getByLabelText("邮箱"), "admin@example.com");
    await user.type(screen.getByLabelText("密码"), "Password123!");
    await user.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(window.localStorage.getItem("cvd.auth.session")).toContain("token-123");
    });
  });

  it("shows a link to invite-code registration", () => {
    renderWithApp(<LoginPage />, {
      initialEntries: ["/login"],
    });

    expect(screen.getByRole("link", { name: "使用邀请码注册" })).toHaveAttribute(
      "href",
      "/register",
    );
  });
});
