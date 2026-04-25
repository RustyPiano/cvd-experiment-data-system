import { Alert, Card, Space, Typography } from "antd";
import { useLocation } from "react-router-dom";

import { LoginForm } from "./login-form";

export function LoginPage() {
  const location = useLocation();
  const loginReason = (location.state as { reason?: string } | null)?.reason;

  return (
    <div className="auth-page">
      <Card className="auth-panel" variant="borderless">
        <Space orientation="vertical" size={24} style={{ width: "100%" }}>
          <div>
            <Typography.Title level={2} style={{ marginBottom: 8 }}>
              CVD 实验数据采集系统
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              CVD 实验数据采集系统 · 请使用管理员分配的账号登录。
            </Typography.Paragraph>
          </div>
          {loginReason === "session-expired" ? (
            <Alert message="登录已过期，请重新登录。" showIcon type="warning" />
          ) : null}
          <LoginForm />
        </Space>
      </Card>
    </div>
  );
}
