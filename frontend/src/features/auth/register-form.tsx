import { startTransition } from "react";
import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Form, Input } from "antd";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { HttpError } from "../../shared/api/http-error";
import { createSessionSnapshot } from "./auth-store";
import { register } from "./api";
import { useAuth } from "./use-auth";

const registerSchema = z
  .object({
    name: z.string().trim().min(1, "请输入姓名"),
    email: z.email("请输入有效邮箱地址"),
    password: z.string().min(8, "密码至少 8 位"),
    password_confirmation: z.string().min(8, "请再次输入至少 8 位密码"),
    invite_code: z.string().trim().min(1, "请输入邀请码"),
  })
  .refine((values) => values.password === values.password_confirmation, {
    message: "两次输入的密码不一致",
    path: ["password_confirmation"],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      password_confirmation: "",
      invite_code: "",
    },
    resolver: zodResolver(registerSchema),
  });

  const registerMutation = useMutation({
    mutationFn: register,
  });

  const onSubmit = handleSubmit(async (values) => {
    const response = await registerMutation.mutateAsync(values).catch(() => null);
    if (!response) {
      return;
    }

    setSession(createSessionSnapshot(response.access_token, response.user));

    startTransition(() => {
      navigate("/experiments", { replace: true });
    });
  });

  const errorMessage =
    registerMutation.error instanceof HttpError
      ? registerMutation.error.detail
      : registerMutation.error instanceof Error
        ? registerMutation.error.message
        : null;

  return (
    <Form layout="vertical" onFinish={onSubmit} requiredMark={false}>
      {errorMessage ? (
        <Form.Item>
          <Alert message={errorMessage} showIcon type="error" />
        </Form.Item>
      ) : null}

      <Form.Item
        help={errors.name?.message}
        label="姓名"
        validateStatus={errors.name ? "error" : undefined}
      >
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <Input
              {...field}
              aria-label="姓名"
              autoComplete="name"
              placeholder="请输入姓名"
              size="large"
            />
          )}
        />
      </Form.Item>

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
              placeholder="member@example.com"
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
              autoComplete="new-password"
              placeholder="至少 8 位"
              size="large"
            />
          )}
        />
      </Form.Item>

      <Form.Item
        help={errors.password_confirmation?.message}
        label="确认密码"
        validateStatus={errors.password_confirmation ? "error" : undefined}
      >
        <Controller
          control={control}
          name="password_confirmation"
          render={({ field }) => (
            <Input.Password
              {...field}
              aria-label="确认密码"
              autoComplete="new-password"
              placeholder="再次输入密码"
              size="large"
            />
          )}
        />
      </Form.Item>

      <Form.Item
        help={errors.invite_code?.message}
        label="邀请码"
        validateStatus={errors.invite_code ? "error" : undefined}
      >
        <Controller
          control={control}
          name="invite_code"
          render={({ field }) => (
            <Input.Password
              {...field}
              aria-label="邀请码"
              autoComplete="off"
              placeholder="请输入内部邀请码"
              size="large"
            />
          )}
        />
      </Form.Item>

      <Button
        aria-label="注册并登录"
        block
        htmlType="submit"
        loading={registerMutation.isPending}
        size="large"
        type="primary"
      >
        注册并登录
      </Button>
    </Form>
  );
}
