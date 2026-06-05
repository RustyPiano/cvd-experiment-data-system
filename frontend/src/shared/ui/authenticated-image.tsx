import { useEffect, useState } from "react";
import { Spin } from "antd";
import { env } from "../config/env";

export function AuthenticatedImage({
  url,
  token,
  alt,
  style,
}: {
  url: string;
  token: string;
  alt?: string;
  style?: React.CSSProperties;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    const fetchImage = async () => {
      setLoading(true);
      setError(false);
      try {
        const resolvedUrl =
          url.startsWith("http://") || url.startsWith("https://")
            ? url
            : `${env.apiBaseUrl}${url}`;
        const res = await fetch(resolvedUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) {
          throw new Error("Failed to load image");
        }
        const blob = await res.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        setLoading(false);
      } catch {
        if (!active) return;
        setError(true);
        setLoading(false);
      }
    };

    void fetchImage();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url, token]);

  if (loading) {
    return <Spin size="small" />;
  }

  if (error) {
    return <span style={{ color: "red", fontSize: "12px" }}>图片加载失败</span>;
  }

  return src ? <img src={src} alt={alt} style={style} /> : null;
}
