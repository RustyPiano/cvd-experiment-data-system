import { ExperimentOutlined } from "@ant-design/icons";
import { Alert, Card, Space, Typography } from "antd";
import { Link, useLocation } from "react-router-dom";

import { LoginForm } from "./login-form";

export function LoginPage() {
  const location = useLocation();
  const loginReason = (location.state as { reason?: string } | null)?.reason;

  return (
    <div className="auth-page">
      <Card className="auth-panel" variant="borderless">
        <Space orientation="vertical" size={24} style={{ width: "100%" }}>
          <div className="brand-lockup">
            <span aria-hidden className="brand-mark">
              <ExperimentOutlined />
            </span>
            <span className="brand-text">
              <Typography.Text strong style={{ fontSize: 16, lineHeight: 1.2 }}>
                CVD Lab
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                实验数据采集系统
              </Typography.Text>
            </span>
          </div>
          <div>
            <Typography.Title level={2} style={{ marginBottom: 8, marginTop: 0 }}>
              登录
            </Typography.Title>
            <Typography.Paragraph style={{ marginBottom: 0 }} type="secondary">
              使用账号登录，或通过内部邀请码注册。
            </Typography.Paragraph>
          </div>
          {loginReason === "session-expired" ? (
            <Alert showIcon title="登录已过期，请重新登录。" type="warning" />
          ) : null}
          <LoginForm />
          <Typography.Text type="secondary">
            没有账号？<Link to="/register">使用邀请码注册</Link>
          </Typography.Text>
        </Space>
      </Card>
    </div>
  );
}
