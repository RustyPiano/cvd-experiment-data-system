import type { ThemeConfig } from "antd";

// Single source of truth for the design language: a restrained, modern,
// "scientific instrument" look built on a slate neutral ramp + a focused blue.
// Keep these in sync with the CSS custom properties declared in styles/global.css.
export const appTheme: ThemeConfig = {
  token: {
    // Brand & semantic colors
    colorPrimary: "#2563EB",
    colorInfo: "#2563EB",
    colorSuccess: "#16A34A",
    colorWarning: "#D97706",
    colorError: "#DC2626",
    colorLink: "#2563EB",

    // Neutral surfaces
    colorBgLayout: "#F5F7FA",
    colorBgContainer: "#FFFFFF",
    colorBgElevated: "#FFFFFF",
    colorBorder: "#E2E8F0",
    colorBorderSecondary: "#EEF1F6",
    colorText: "#0F172A",
    colorTextSecondary: "#5B6678",
    colorTextTertiary: "#8A93A3",

    // Shape
    borderRadius: 10,
    borderRadiusLG: 14,
    borderRadiusSM: 8,
    controlHeight: 36,
    wireframe: false,

    // Typography
    fontFamily:
      '"Noto Sans SC", Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 14,
    fontSizeHeading1: 30,
    fontSizeHeading2: 22,
    fontSizeHeading3: 18,
    fontSizeHeading4: 16,
    lineHeightHeading2: 1.32,
    lineHeightHeading3: 1.4,

    // Elevation — soft, layered shadows instead of hard borders
    boxShadow:
      "0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)",
    boxShadowSecondary:
      "0 8px 24px -8px rgba(15, 23, 42, 0.12), 0 2px 6px -2px rgba(15, 23, 42, 0.06)",
    boxShadowTertiary: "0 1px 2px rgba(15, 23, 42, 0.04)",
  },
  components: {
    Layout: {
      bodyBg: "#F5F7FA",
      headerBg: "rgba(255, 255, 255, 0.72)",
      headerHeight: 60,
      headerPadding: "0 24px",
      siderBg: "#FFFFFF",
      triggerBg: "#FFFFFF",
      triggerColor: "#5B6678",
    },
    Menu: {
      itemSelectedBg: "#EAF1FF",
      itemSelectedColor: "#1D4ED8",
      itemColor: "#475569",
      itemHoverBg: "#F3F5F9",
      itemBorderRadius: 10,
      itemHeight: 42,
      itemMarginInline: 10,
      iconSize: 18,
      activeBarWidth: 0,
      groupTitleColor: "#5B6678",
      groupTitleFontSize: 12,
    },
    Card: {
      bodyPadding: 20,
      borderRadiusLG: 14,
      headerFontSize: 15,
      headerHeight: 52,
    },
    Button: {
      borderRadius: 9,
      controlHeight: 36,
      fontWeight: 500,
      primaryShadow: "0 1px 2px rgba(37, 99, 235, 0.24)",
      defaultShadow: "none",
    },
    Input: { borderRadius: 9, controlHeight: 36 },
    Select: { borderRadius: 9, controlHeight: 36 },
    Tag: { borderRadiusSM: 9999 },
    Alert: { borderRadiusLG: 10 },
    Modal: { borderRadiusLG: 16 },
    Table: {
      headerBg: "#F8FAFC",
      headerColor: "#5B6678",
      headerSplitColor: "transparent",
      borderColor: "#EEF1F6",
      rowHoverBg: "#F8FAFC",
      cellPaddingBlock: 14,
      headerBorderRadius: 0,
    },
  },
};
