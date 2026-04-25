import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ExperimentOutlined, LogoutOutlined, SettingOutlined } from "@ant-design/icons";
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
  const [collapsed, setCollapsed] = useState(false);
  const menuItems = [
    {
      key: "/experiments",
      icon: <ExperimentOutlined />,
      label: <Link to="/experiments">实验记录</Link>,
    },
    ...(session.currentUser?.role === "admin"
      ? [
          {
            key: "/admin/vocabularies",
            icon: <SettingOutlined />,
            label: <Link to="/admin/vocabularies">受控词表</Link>,
          },
        ]
      : []),
  ];

  useEffect(() => {
    const handleUnauthorized = () => {
      queryClient.clear();
      clearSession();
      navigate("/login", {
        replace: true,
        state: {
          from: `${location.pathname}${location.search}`,
          reason: "session-expired",
        },
      });
    };

    window.addEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => {
      window.removeEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, [clearSession, location.pathname, location.search, navigate, queryClient]);

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

    const shellStyle = {
      "--app-sidebar-width": collapsed ? "80px" : "232px",
      minHeight: "100vh",
    } as CSSProperties;

    return (
      <Layout data-testid="app-shell-layout" style={shellStyle}>
      <Layout.Sider breakpoint="lg" collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="light" width={232}>
        <div className="app-brand">
          <Typography.Text strong>{collapsed ? "CVD" : "CVD Lab"}</Typography.Text>
          {collapsed ? null : <Typography.Text type="secondary">V1 Data Capture</Typography.Text>}
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
