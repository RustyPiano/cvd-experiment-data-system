import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ExperimentOutlined,
  LogoutOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
  TagOutlined,
} from "@ant-design/icons";
import { Button, Input, Layout, Menu, Space, Typography } from "antd";
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
  const [searchQuery, setSearchQuery] = useState("");

  const isAdmin = session.currentUser?.role === "admin";
  const isViewer = session.currentUser?.role === "viewer";

  const menuItems = useMemo(
    () => [
      {
        key: "/experiments",
        icon: <ExperimentOutlined />,
        label: <Link to="/experiments">实验记录</Link>,
      },
      ...(isAdmin
        ? [
            {
              key: "/admin/vocabularies",
              icon: <TagOutlined />,
              label: <Link to="/admin/vocabularies">受控词表</Link>,
            },
            {
              key: "/admin-divider",
              type: "divider" as const,
              label: "管理配置",
            },
            {
              key: "/admin/vocabularies-settings",
              icon: <SettingOutlined />,
              label: <Link to="/admin/vocabularies">字段字典</Link>,
            },
          ]
        : []),
    ],
    [isAdmin],
  );

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

  const handleSearch = () => {
    const q = searchQuery.trim();
    if (!q) return;
    navigate(`/experiments?q=${encodeURIComponent(q)}`);
  };

  const shellStyle = {
    "--app-sidebar-width": collapsed ? "80px" : "232px",
    minHeight: "100vh",
  } as CSSProperties;

  return (
    <Layout data-testid="app-shell-layout" style={shellStyle}>
      <Layout.Sider
        breakpoint="lg"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="light"
        width={232}
      >
        <div className="app-brand">
          <Typography.Text strong style={{ fontSize: collapsed ? 14 : 16 }}>
            {collapsed ? "CVD" : "CVD Lab"}
          </Typography.Text>
          {collapsed ? null : (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              实验数据采集系统
            </Typography.Text>
          )}
        </div>
        {!isViewer && !collapsed ? (
          <div style={{ padding: "0 16px 12px" }}>
            <Link to="/experiments/new">
              <Button block icon={<PlusOutlined />} type="primary">
                新建实验
              </Button>
            </Link>
          </div>
        ) : null}
        <Menu
          items={menuItems}
          mode="inline"
          selectedKeys={[resolveSelectedKey(location.pathname)]}
        />
        {collapsed ? null : (
          <div style={{ padding: "16px 20px", marginTop: "auto" }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              全局搜索
            </Typography.Text>
            <Input
              allowClear
              aria-label="全局搜索"
              onChange={(e) => {
                setSearchQuery(e.target.value);
              }}
              onPressEnter={handleSearch}
              placeholder="实验编号、材料体系…"
              prefix={<SearchOutlined />}
              size="small"
              style={{ marginTop: 8 }}
              value={searchQuery}
            />
          </div>
        )}
      </Layout.Sider>
      <Layout>
        <Layout.Header className="app-header">
          <Space align="center" size={16}>
            {collapsed ? (
              <Input
                allowClear
                aria-label="全局搜索"
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                }}
                onPressEnter={handleSearch}
                placeholder="搜索…"
                prefix={<SearchOutlined />}
                size="small"
                style={{ width: 160 }}
                value={searchQuery}
              />
            ) : null}
            <Typography.Text style={{ fontWeight: 500 }}>
              {session.currentUser?.name ?? "未登录"}
            </Typography.Text>
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
