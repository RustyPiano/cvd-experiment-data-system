import { Card, Space, Typography } from "antd";

import { LoginForm } from "./login-form";

export function LoginPage() {
  return (
    <div className="auth-page">
      <Card className="auth-panel" variant="borderless">
        <Space orientation="vertical" size={24} style={{ width: "100%" }}>
          <div>
            <Typography.Title level={2} style={{ marginBottom: 8 }}>
              CVD 实验数据采集系统
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              登录后进入实验记录、样品和文件管理工作区。
            </Typography.Paragraph>
          </div>
          <LoginForm />
        </Space>
      </Card>
    </div>
  );
}
