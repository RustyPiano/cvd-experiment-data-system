import { startTransition } from "react";
import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Form, Input } from "antd";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { HttpError } from "../../shared/api/http-error";
import { createSessionSnapshot } from "./auth-store";
import { login } from "./api";
import { useAuth } from "./use-auth";

const loginSchema = z.object({
  email: z.email("请输入有效邮箱地址"),
  password: z.string().min(1, "请输入密码"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

type RedirectState = {
  from?: string;
};

export function LoginForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setSession } = useAuth();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    defaultValues: {
      email: "",
      password: "",
    },
    resolver: zodResolver(loginSchema),
  });

  const loginMutation = useMutation({
    mutationFn: login,
  });

  const onSubmit = handleSubmit(async (values) => {
    const response = await loginMutation.mutateAsync(values);
    setSession(createSessionSnapshot(response.access_token, response.user));

    const redirectState = location.state as RedirectState | null;
    const redirectPath = redirectState?.from ?? "/experiments";
    startTransition(() => {
      navigate(redirectPath, { replace: true });
    });
  });

  const errorMessage =
    loginMutation.error instanceof HttpError
      ? loginMutation.error.detail
      : loginMutation.error instanceof Error
        ? loginMutation.error.message
        : null;

  return (
    <Form layout="vertical" onFinish={onSubmit} requiredMark={false}>
      {errorMessage ? (
        <Form.Item>
          <Alert message={errorMessage} showIcon type="error" />
        </Form.Item>
      ) : null}

      <Form.Item
        help={errors.email?.message}
        label="邮箱"
        validateStatus={errors.email ? "error" : undefined}
      >
        <Controller
          control={control}
          name="email"
          render={({ field }) => (
            <Input
              {...field}
              aria-label="邮箱"
              autoComplete="email"
              placeholder="admin@example.com"
              size="large"
            />
          )}
        />
      </Form.Item>

      <Form.Item
        help={errors.password?.message}
        label="密码"
        validateStatus={errors.password ? "error" : undefined}
      >
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <Input.Password
              {...field}
              aria-label="密码"
              autoComplete="current-password"
              placeholder="请输入密码"
              size="large"
            />
          )}
        />
      </Form.Item>

      <Button
        aria-label="登录"
        block
        htmlType="submit"
        loading={loginMutation.isPending}
        size="large"
        type="primary"
      >
        登录
      </Button>
    </Form>
  );
}
