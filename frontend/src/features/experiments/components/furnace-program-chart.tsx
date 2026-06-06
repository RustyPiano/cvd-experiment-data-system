import { Card, Empty } from "antd";
import { Line } from "@ant-design/plots";
import type { FurnaceProgramValues } from "../editor-types";

interface ChartDataPoint {
  time: number;
  temperature: number;
  zone: string;
  label: string;
  note: string;
}

export function FurnaceProgramChart({
  value,
}: {
  value: FurnaceProgramValues;
}) {
  // Parse zones and segments into plot data points
  const plotData: ChartDataPoint[] = [];

  value.zones.forEach((zone, zoneIndex) => {
    const zoneKey = zone.zoneKey || `zone_${zoneIndex + 1}`;
    const startTemp = parseFloat(zone.startTemperatureC);
    const currentStart = isNaN(startTemp) ? 25 : startTemp;

    let elapsed = 0;

    // 1. Initial point at time = 0
    plotData.push({
      time: 0,
      temperature: currentStart,
      zone: zoneKey,
      label: "起始温度",
      note: zone.note || "",
    });

    let prevTemp = currentStart;

    // 2. Add points for each segment
    zone.segments.forEach((seg, segIndex) => {
      const dur = parseFloat(seg.durationMin);
      const temp = parseFloat(seg.targetTemperatureC);

      if (!isNaN(dur) && dur > 0) {
        elapsed += dur;
        const targetTemp = isNaN(temp) ? prevTemp : temp;
        plotData.push({
          time: elapsed,
          temperature: targetTemp,
          zone: zoneKey,
          label: seg.label || `区间 ${segIndex + 1}`,
          note: seg.note || "",
        });
        prevTemp = targetTemp;
      }
    });
  });

  // If there are only starting points (time = 0), we don't have enough points for a line chart
  const hasMultiplePoints = plotData.some((point) => point.time > 0);

  if (!hasMultiplePoints) {
    return (
      <Card size="small" title="温度曲线预览">
        <Empty
          description="请在下方各温区添加区间和时长以生成温度曲线预览。"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  // Configuration for @ant-design/plots Line chart (v2 / G2 v5)
  const config = {
    data: plotData,
    xField: "time",
    yField: "temperature",
    colorField: "zone",
    // Smooth is false because temperature changes linearly in CVD recipes
    smooth: false,
    point: {
      shapeField: "circle",
      sizeField: 4,
    },
    interaction: {
      tooltip: {
        shared: true,
      },
    },
    // Enforce custom clean color scheme aligning with the CVD system theme
    scale: {
      color: {
        range: ["#2563eb", "#d97706", "#16a34a", "#dc2626"],
      },
    },
    axis: {
      x: {
        title: "时间 (分钟)",
      },
      y: {
        title: "温度 (°C)",
      },
    },
    legend: {
      color: {
        title: false,
        position: "top",
      },
    },
    height: 240,
  };

  return (
    <Card size="small" title="温度曲线预览 (Real-time Preview)">
      <div style={{ marginTop: 8 }}>
        <Line {...config} />
      </div>
    </Card>
  );
}
