import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LogoutOutlined } from "@ant-design/icons";
import { Button, Layout, Menu, Space, Typography } from "antd";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";

import { logout } from "../../features/auth/api";
import { useAuth } from "../../features/auth/use-auth";
import { API_UNAUTHORIZED_EVENT } from "../api/client";

function resolveSelectedKey(pathname: string) {
  if (pathname.startsWith("/admin/vocabularies")) {
    return "/admin/vocabularies";
  }

  if (pathname.startsWith("/experiments")) {
    return "/experiments";
  }

  return "";
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { clearSession, session } = useAuth();
  const menuItems = [
    {
      key: "/experiments",
      label: <Link to="/experiments">实验记录</Link>,
    },
    ...(session.currentUser?.role === "admin"
      ? [
          {
            key: "/admin/vocabularies",
            label: <Link to="/admin/vocabularies">受控词表</Link>,
          },
        ]
      : []),
  ];

  useEffect(() => {
    const handleUnauthorized = () => {
      queryClient.clear();
      clearSession();
      navigate("/login", { replace: true });
    };

    window.addEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => {
      window.removeEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, [clearSession, navigate, queryClient]);

  const handleLogout = async () => {
    try {
      await logout(session.accessToken);
    } catch {
      // Local logout is still the source of truth in the current bearer-token flow.
    } finally {
      queryClient.clear();
      clearSession();
      navigate("/login", { replace: true });
    }
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Layout.Sider breakpoint="lg" collapsible theme="light" width={232}>
        <div className="app-brand">
          <Typography.Text strong>CVD Lab</Typography.Text>
          <Typography.Text type="secondary">V1 Data Capture</Typography.Text>
        </div>
        <Menu
          items={menuItems}
          mode="inline"
          selectedKeys={[resolveSelectedKey(location.pathname)]}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header className="app-header">
          <Space size={16}>
            <Typography.Text>{session.currentUser?.name ?? "未登录"}</Typography.Text>
            <Button
              aria-label="退出"
              icon={<LogoutOutlined />}
              onClick={() => {
                void handleLogout();
              }}
              type="text"
            >
              退出
            </Button>
          </Space>
        </Layout.Header>
        <Layout.Content className="app-content">
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
