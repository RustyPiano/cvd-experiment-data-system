import { useEffect, useRef } from "react";
import { App } from "antd";
import { useBlocker } from "react-router-dom";

export function RouteLeaveGuard({ message, when }: { message: string; when: boolean }) {
  const { modal } = App.useApp();
  const blocker = useBlocker(when);
  const confirmRef = useRef<{ destroy: () => void } | null>(null);

  useEffect(() => {
    if (blocker.state !== "blocked") {
      confirmRef.current?.destroy();
      confirmRef.current = null;
      return;
    }

    if (confirmRef.current) {
      return;
    }

    confirmRef.current = modal.confirm({
      title: "离开确认",
      content: message,
      maskTransitionName: "",
      transitionName: "",
      okText: "离开",
      okButtonProps: { "aria-label": "离开" },
      cancelText: "留下",
      cancelButtonProps: { "aria-label": "留下" },
      onOk: () => {
        confirmRef.current?.destroy();
        blocker.proceed();
      },
      onCancel: () => {
        confirmRef.current?.destroy();
        blocker.reset();
      },
    });
  }, [blocker, message, modal]);

  return null;
}
