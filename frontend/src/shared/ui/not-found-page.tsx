import { Button, Result } from "antd";
import { useNavigate } from "react-router-dom";

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <Result
      extra={
        <Button
          onClick={() => {
            navigate("/experiments", { replace: true });
          }}
          type="primary"
        >
          返回实验列表
        </Button>
      }
      status="404"
      subTitle="当前地址没有对应页面。"
      title="页面不存在"
    />
  );
}
