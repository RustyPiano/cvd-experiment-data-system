import { Route, Routes } from "react-router-dom";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RegisterPage } from "./register-page";
import { renderWithApp } from "../../test/render";

function renderRegisterRoute() {
  return renderWithApp(
    <Routes>
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/experiments" element={<div>experiments screen</div>} />
    </Routes>,
    {
      initialEntries: ["/register"],
    },
  );
}

describe("RegisterPage", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("renders the invite-code registration form", () => {
    renderRegisterRoute();

    expect(screen.getByLabelText("姓名")).toBeInTheDocument();
    expect(screen.getByLabelText("邮箱")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
    expect(screen.getByLabelText("确认密码")).toBeInTheDocument();
    expect(screen.getByLabelText("邀请码")).toBeInTheDocument();
  });

  it("stores the session and navigates to experiments after successful registration", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "registered-token",
          token_type: "bearer",
          expires_in: 3600,
          user: {
            id: "u-registered",
            email: "member@example.com",
            name: "Member User",
            role: "member",
            is_active: true,
            last_login_at: "2026-05-13T10:00:00Z",
          },
        }),
        {
          status: 201,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);
    renderRegisterRoute();

    await user.type(screen.getByLabelText("姓名"), "Member User");
    await user.type(screen.getByLabelText("邮箱"), "member@example.com");
    await user.type(screen.getByLabelText("密码"), "Password123!");
    await user.type(screen.getByLabelText("确认密码"), "Password123!");
    await user.type(screen.getByLabelText("邀请码"), "lab-invite");
    await user.click(screen.getByRole("button", { name: "注册并登录" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(window.localStorage.getItem("cvd.auth.session")).toContain("registered-token");
      expect(screen.getByText("experiments screen")).toBeInTheDocument();
    });

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(fetchMock.mock.calls[0][0]).toContain("/api/v1/auth/register");
    expect(requestInit.method).toBe("POST");
    expect(JSON.parse(requestInit.body as string)).toEqual({
      email: "member@example.com",
      name: "Member User",
      password: "Password123!",
      password_confirmation: "Password123!",
      invite_code: "lab-invite",
    });
  });

  it("does not submit when password confirmation does not match", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();

    vi.stubGlobal("fetch", fetchMock);
    renderRegisterRoute();

    await user.type(screen.getByLabelText("姓名"), "Member User");
    await user.type(screen.getByLabelText("邮箱"), "member@example.com");
    await user.type(screen.getByLabelText("密码"), "Password123!");
    await user.type(screen.getByLabelText("确认密码"), "Different123!");
    await user.type(screen.getByLabelText("邀请码"), "lab-invite");
    await user.click(screen.getByRole("button", { name: "注册并登录" }));

    expect(await screen.findByText("两次输入的密码不一致")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows backend invite-code errors", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Invalid invite code" }), {
        status: 403,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);
    renderRegisterRoute();

    await user.type(screen.getByLabelText("姓名"), "Member User");
    await user.type(screen.getByLabelText("邮箱"), "member@example.com");
    await user.type(screen.getByLabelText("密码"), "Password123!");
    await user.type(screen.getByLabelText("确认密码"), "Password123!");
    await user.type(screen.getByLabelText("邀请码"), "wrong-code");
    await user.click(screen.getByRole("button", { name: "注册并登录" }));

    expect(await screen.findByText("Invalid invite code")).toBeInTheDocument();
  });
});
