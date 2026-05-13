import { Card, Space, Typography } from "antd";
import { Link } from "react-router-dom";

import { RegisterForm } from "./register-form";

export function RegisterPage() {
  return (
    <div className="auth-page">
      <Card className="auth-panel" variant="borderless">
        <Space orientation="vertical" size={24} style={{ width: "100%" }}>
          <div>
            <Typography.Title level={2} style={{ marginBottom: 8 }}>
              邀请码注册
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              使用课题组内部邀请码创建账号。
            </Typography.Paragraph>
          </div>
          <RegisterForm />
          <Typography.Text type="secondary">
            已有账号？<Link to="/login">返回登录</Link>
          </Typography.Text>
        </Space>
      </Card>
    </div>
  );
}
