import type { ReactNode } from "react";
import { Component } from "react";
import { Alert, Button } from "antd";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return <AppErrorFallback />;
  }
}

export function AppErrorFallback() {
  return (
    <div className="auth-page">
      <Alert
        action={
          <Button
            onClick={() => {
              window.location.assign("/experiments");
            }}
            type="primary"
          >
            返回实验列表
          </Button>
        }
        description="请刷新页面后重试，或返回实验列表继续操作。"
        message="页面渲染失败"
        showIcon
        type="error"
      />
    </div>
  );
}
