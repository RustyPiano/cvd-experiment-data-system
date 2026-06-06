import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOutlined,
  DashboardOutlined,
  ExperimentOutlined,
  FormOutlined,
  LogoutOutlined,
  SearchOutlined,
  SettingOutlined,
  TagOutlined,
} from "@ant-design/icons";
import { Avatar, Button, Input, Layout, Menu, Typography } from "antd";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";

import { logout } from "../../features/auth/api";
import { useAuth } from "../../features/auth/use-auth";
import { API_UNAUTHORIZED_EVENT } from "../api/client";

function resolveSelectedKey(pathname: string) {
  if (pathname.startsWith("/admin/dashboard")) {
    return "/admin/dashboard";
  }

  if (pathname.startsWith("/admin/fields")) {
    return "/admin/fields";
  }

  if (pathname.startsWith("/admin/recipes")) {
    return "/admin/recipes";
  }

  if (pathname.startsWith("/admin/vocabularies")) {
    return "/admin/vocabularies";
  }

  if (pathname.startsWith("/experiments")) {
    return "/experiments";
  }

  if (pathname.startsWith("/setup-library")) {
    return "/setup-library";
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

  const roleLabels: Record<string, string> = {
    admin: "管理员",
    member: "成员",
    viewer: "只读",
  };
  const currentRole = session.currentUser?.role;
  const roleLabel = currentRole ? (roleLabels[currentRole] ?? "") : "未登录";
  const userInitial =
    session.currentUser?.name?.trim()?.[0]?.toUpperCase() ?? "?";

  const menuItems = useMemo(
    () => [
      {
        key: "/experiments",
        icon: <ExperimentOutlined />,
        label: <Link to="/experiments">实验记录</Link>,
      },
      {
        key: "/setup-library",
        icon: <SettingOutlined />,
        label: <Link to="/setup-library">Setup 库</Link>,
      },
      ...(isAdmin
        ? [
            {
              key: "/admin/dashboard",
              icon: <DashboardOutlined />,
              label: <Link to="/admin/dashboard">数据看板</Link>,
            },
            {
              key: "/admin-group",
              type: "group" as const,
              label: "管理配置",
              children: [
                {
                  key: "/admin/fields",
                  icon: <FormOutlined />,
                  label: <Link to="/admin/fields">字段词典</Link>,
                },
                {
                  key: "/admin/vocabularies",
                  icon: <TagOutlined />,
                  label: <Link to="/admin/vocabularies">受控词表</Link>,
                },
                {
                  key: "/admin/recipes",
                  icon: <BookOutlined />,
                  label: <Link to="/admin/recipes">Recipe</Link>,
                },
              ],
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
        className="app-sider"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="light"
        width={232}
      >
        <div
          className="app-brand"
          style={{ justifyContent: collapsed ? "center" : "flex-start" }}
        >
          <div className="brand-lockup">
            <span aria-hidden className="brand-mark">
              <ExperimentOutlined />
            </span>
            {collapsed ? null : (
              <span className="brand-text">
                <Typography.Text strong style={{ fontSize: 15, lineHeight: 1.2 }}>
                  CVD Lab
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  实验数据采集系统
                </Typography.Text>
              </span>
            )}
          </div>
        </div>
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
              style={{ width: 180 }}
              value={searchQuery}
            />
          ) : null}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginLeft: "auto" }}>
            <div className="app-user">
              <Avatar
                size={32}
                style={{ backgroundColor: "#2563EB", fontSize: 13, fontWeight: 600 }}
              >
                {userInitial}
              </Avatar>
              <span className="app-user-meta">
                <Typography.Text style={{ fontWeight: 600, fontSize: 13 }}>
                  {session.currentUser?.name ?? "未登录"}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {roleLabel}
                </Typography.Text>
              </span>
            </div>
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
          </div>
        </Layout.Header>
        <Layout.Content className="app-content">
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
