import type { ThemeConfig } from "antd";

export const appTheme: ThemeConfig = {
  token: {
    colorBgLayout: "#F8FAFC",
    colorBorder: "#CBD5E1",
    colorPrimary: "#1D4ED8",
    colorText: "#0F172A",
    colorTextSecondary: "#475569",
    borderRadius: 12,
    colorInfo: "#2563EB",
    colorSuccess: "#15803D",
    colorWarning: "#B45309",
    colorError: "#DC2626",
    fontFamily:
      '"Noto Sans SC", Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  components: {
    Layout: {
      bodyBg: "#F8FAFC",
      headerBg: "#FFFFFF",
      siderBg: "#FFFFFF",
      triggerBg: "#FFFFFF",
    },
    Menu: {
      itemSelectedBg: "#DBEAFE",
      itemSelectedColor: "#1D4ED8",
      itemBorderRadius: 10,
    },
    Card: {
      bodyPadding: 20,
      borderRadiusLG: 16,
    },
  },
};
