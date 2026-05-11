import { useState } from "react";
import { ArrowLeftOutlined, DownloadOutlined, EditOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, List, Space, Table, Tabs, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useNavigate, useParams } from "react-router-dom";

import { HttpError } from "../../shared/api/http-error";
import { StatusTag } from "../../shared/ui/status-tag";
import { PageHeader } from "../../shared/ui/page-header";
import { EmptyState } from "../../shared/ui/empty-state";
import { LoadingState } from "../../shared/ui/loading-state";
import { triggerBlobDownload } from "../../shared/lib/download";
import {
  downloadExperimentExcel,
  downloadExperimentFile,
  exportExperimentJson,
  getExperiment,
  listExperimentAuditEvents,
  listExperimentFiles,
  listExperimentModules,
  listExperimentSamples,
} from "./api";
import { ExperimentSourceBanner } from "./components/experiment-source-banner";
import { ExperimentStateActions } from "./experiment-state-actions";
import { ExperimentSummary } from "./components/experiment-summary";
import { useAuth } from "../auth/use-auth";
import type { ExperimentModuleKey, ExperimentModulePayloadRead } from "../../shared/types/api";

function formatFileCategory(value: string) {
  if (value === "raw") return "原始文件";
  if (value === "processed") return "已处理";
  return value;
}

function safeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function safeString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "是" : "否";
  return "";
}

function formatPrecheckState(value: unknown): string {
  if (value === true) return "是";
  if (value === false) return "否";
  return "未检查";
}

function safeArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return [];
}

function formatWithUnit(value: unknown, unit: string): string {
  const text = safeString(value);
  return text ? `${text} ${unit}` : "";
}

function joinReadableParts(parts: string[]): string {
  const visibleParts = parts.filter(Boolean);
  return visibleParts.length > 0 ? visibleParts.join(" / ") : "—";
}

function formatPrecursorPreparation(record: Record<string, unknown>) {
  return joinReadableParts([
    formatWithUnit(record.melting_temperature_C, "°C"),
    formatWithUnit(record.spin_speed_rpm, "rpm"),
    safeString(record.pre_spin_speed_rpm) ? `预旋 ${safeString(record.pre_spin_speed_rpm)} rpm` : "",
    formatWithUnit(record.preparation_time_min, "min"),
  ]);
}

function formatSubstrateTreatmentParams(record: Record<string, unknown>) {
  const params = safeRecord(record.treatment_params);
  return joinReadableParts([
    formatWithUnit(params.temperature_C, "°C"),
    formatWithUnit(params.duration_min, "min"),
    formatWithUnit(params.power_W, "W"),
    safeString(params.gas),
  ]);
}

function formatGasComponents(value: unknown, segmentFlowSccm?: unknown) {
  const totalFlow = typeof segmentFlowSccm === "number"
    ? segmentFlowSccm
    : Number(segmentFlowSccm);
  const components = safeArray(value)
    .map((component) => {
      const record = safeRecord(component);
      const name = safeString(record.name) || safeString(record.gas);
      const flow = record.flow_sccm ?? record.flowSccm;
      const flowNum = Number(flow);
      if (!name && flow == null) return "";
      const label = name || "组分";
      if (Number.isFinite(flowNum)) {
        const pct = Number.isFinite(totalFlow) && totalFlow > 0
          ? `${Math.round((flowNum / totalFlow) * 10000) / 100}%`
          : null;
        return pct ? `${label} ${flowNum} sccm (${pct})` : `${label} ${flowNum} sccm`;
      }
      if (record.fraction != null) {
        const f = Number(record.fraction);
        if (Number.isFinite(f)) {
          const pct = Math.round(f * 10000) / 100;
          return `${label}: ${pct}%`;
        }
      }
      if (record.ratio_percent != null) {
        const rp = Number(record.ratio_percent);
        if (Number.isFinite(rp)) {
          return `${label}: ${Math.round(rp * 100) / 100}%`;
        }
      }
      return label;
    })
    .filter(Boolean);
  return components.length > 0 ? components.join("；") : "—";
}

function getModulePayload(
  modules: ExperimentModulePayloadRead[] | undefined,
  key: ExperimentModuleKey,
): Record<string, unknown> {
  const item = modules?.find((m) => m.module_key === key);
  return safeRecord(item?.payload_json);
}

function renderBasicInfoParams(modules: ExperimentModulePayloadRead[] | undefined) {
  const payload = getModulePayload(modules, "basic_info");
  return (
    <div className="content-stack">
      <Typography.Text>材料体系：{safeString(payload.material_system) || "—"}</Typography.Text>
      <Typography.Text>实验日期：{safeString(payload.experiment_date) || "—"}</Typography.Text>
      <Typography.Text>实验目标：{safeString(payload.objective) || "—"}</Typography.Text>
    </div>
  );
}

function renderEnvironmentParams(modules: ExperimentModulePayloadRead[] | undefined) {
  const payload = getModulePayload(modules, "environment");
  return (
    <div className="content-stack">
      <Typography.Text>室内温度：{safeString(payload.indoor_temperature_C) || "—"} °C</Typography.Text>
      <Typography.Text>室内湿度：{safeString(payload.indoor_humidity_percent) || "—"} %</Typography.Text>
      <Typography.Text>样品环境：{safeString(payload.sample_env) || "—"}</Typography.Text>
      <Typography.Text>异常记录：{safeString(payload.abnormal_note) || "—"}</Typography.Text>
    </div>
  );
}

function renderPrecheckParams(modules: ExperimentModulePayloadRead[] | undefined) {
  const payload = getModulePayload(modules, "precheck");
  return (
    <div className="content-stack">
      <Typography.Text>密封完好：{formatPrecheckState(payload.seal_intact)}</Typography.Text>
      <Typography.Text>通风橱清洁：{formatPrecheckState(payload.hood_clean)}</Typography.Text>
      <Typography.Text>法兰堵塞：{formatPrecheckState(payload.flange_blocked)}</Typography.Text>
      <Typography.Text>瓷舟污染：{formatPrecheckState(payload.boat_contamination_level)}</Typography.Text>
      <Typography.Text>石英管污染：{formatPrecheckState(payload.tube_contamination_level)}</Typography.Text>
      <Typography.Text>风险说明：{safeString(payload.risk_note) || "—"}</Typography.Text>
    </div>
  );
}

function renderPrecursorsParams(modules: ExperimentModulePayloadRead[] | undefined) {
  const payload = getModulePayload(modules, "precursors");
  const items = safeArray(payload.items).map((item) => safeRecord(item));
  if (items.length === 0) {
    return <Typography.Text type="secondary">无前驱体记录</Typography.Text>;
  }
  return (
    <Table
      columns={[
        { title: "种类", dataIndex: "species", render: (v: unknown) => safeString(v) || "—" },
        { title: "品牌", dataIndex: "brand", render: (v: unknown) => safeString(v) || "—" },
        {
          title: "浓度",
          render: (_: unknown, record: Record<string, unknown>) =>
            `${safeString(record.concentration) || "—"} ${safeString(record.concentration_unit) || ""}`,
        },
        { title: "方法", dataIndex: "method", render: (v: unknown) => safeString(v) || "—" },
        { title: "质量 (mg)", dataIndex: "mass_mg", render: (v: unknown) => safeString(v) || "—" },
        {
          title: "制备参数",
          render: (_: unknown, record: Record<string, unknown>) => formatPrecursorPreparation(record),
        },
        { title: "批号", dataIndex: "batch_no", render: (v: unknown) => safeString(v) || "—" },
      ]}
      dataSource={items}
      pagination={false}
      rowKey={(_, index) => `precursor-${index}`}
      size="small"
    />
  );
}

function renderSubstratesParams(modules: ExperimentModulePayloadRead[] | undefined) {
  const payload = getModulePayload(modules, "substrates");
  const items = safeArray(payload.items).map((item) => safeRecord(item));
  if (items.length === 0) {
    return <Typography.Text type="secondary">无基底记录</Typography.Text>;
  }
  return (
    <Table
      columns={[
        { title: "角色", dataIndex: "role", render: (v: unknown) => safeString(v) || "—" },
        { title: "类型", dataIndex: "type", render: (v: unknown) => safeString(v) || "—" },
        { title: "品牌", dataIndex: "brand", render: (v: unknown) => safeString(v) || "—" },
        { title: "尺寸 (mm)", dataIndex: "size_mm", render: (v: unknown) => safeString(v) || "—" },
        { title: "处理方法", dataIndex: "treatment_method", render: (v: unknown) => safeString(v) || "—" },
        {
          title: "处理参数",
          render: (_: unknown, record: Record<string, unknown>) => formatSubstrateTreatmentParams(record),
        },
        { title: "相对温区位置", dataIndex: "position_mm", render: (v: unknown) => safeString(v) || "—" },
      ]}
      dataSource={items}
      pagination={false}
      rowKey={(_, index) => `substrate-${index}`}
      size="small"
    />
  );
}

function renderFurnaceParams(modules: ExperimentModulePayloadRead[] | undefined) {
  const payload = getModulePayload(modules, "furnace_program");
  const precursorItems = safeArray(getModulePayload(modules, "precursors").items).map((item) =>
    safeRecord(item),
  );
  const furnaceInfo = safeRecord(payload.furnace_info);
  const placements = furnacePlacements(payload, precursorItems);
  const zones = safeArray(payload.zones).map((item) => safeRecord(item));
  if (zones.length === 0 && placements.length === 0 && !furnaceInfo.model) {
    return <Typography.Text type="secondary">无炉温程序记录</Typography.Text>;
  }
  return (
    <div className="content-stack">
      <Space>
        <Typography.Text strong>炉子信息</Typography.Text>
        <Typography.Text type="secondary">{safeString(furnaceInfo.model) || "—"}</Typography.Text>
        <Typography.Text type="secondary">温区数：{safeString(furnaceInfo.zones_count) || "—"}</Typography.Text>
      </Space>
      {placements.length > 0 ? (
        <Table
          columns={[
            { title: "前驱体", dataIndex: "species", render: (v: unknown) => safeString(v) || "—" },
            { title: "温区", dataIndex: "zone_key", render: (v: unknown) => safeString(v) || "—" },
            { title: "位置 (cm)", dataIndex: "position_cm", render: (v: unknown) => safeString(v) || "—" },
            { title: "备注", dataIndex: "note", render: (v: unknown) => safeString(v) || "—" },
          ]}
          dataSource={placements}
          pagination={false}
          rowKey={(_, index) => `placement-${index}`}
          size="small"
          title={() => <Typography.Text strong>前驱体放置</Typography.Text>}
        />
      ) : null}
      {zones.map((zone, zoneIndex) => (
        <Table
          key={safeString(zone.zone_key) || zoneIndex}
          columns={[
            { title: "节点", dataIndex: "node_index", render: (v: unknown) => safeString(v) || "—" },
            { title: "时间 (min)", dataIndex: "time_min", render: (v: unknown) => safeString(v) || "—" },
            { title: "温度 (°C)", dataIndex: "temperature_C", render: (v: unknown) => safeString(v) || "—" },
            { title: "说明", dataIndex: "note", render: (v: unknown) => safeString(v) || "—" },
          ]}
          dataSource={safeArray(zone.temperature_program).map((item) => safeRecord(item))}
          pagination={false}
          rowKey={(_, index) => `${safeString(zone.zone_key) || zoneIndex}-node-${index}`}
          size="small"
          title={() => (
            <Typography.Text strong>{`温区 ${zoneIndex + 1} 温度变化`}</Typography.Text>
          )}
        />
      ))}
    </div>
  );
}

function findPrecursorIndexBySpecies(
  precursorItems: Record<string, unknown>[],
  species: unknown,
): number | null {
  const speciesString = safeString(species).trim();
  if (!speciesString) {
    return null;
  }

  const index = precursorItems.findIndex((item) => safeString(item.species).trim() === speciesString);
  return index >= 0 ? index : null;
}

function furnacePlacements(
  payload: Record<string, unknown>,
  precursorItems: Record<string, unknown>[],
) {
  const placements = safeArray(payload.placements).map((item) => safeRecord(item));
  if (placements.length > 0) {
    return placements.map((placement) => {
      const precursorIndex = Number(placement.precursor_index);
      const precursor =
        Number.isInteger(precursorIndex) && precursorIndex >= 0 && precursorIndex < precursorItems.length
          ? precursorItems[precursorIndex]
          : {};
      return {
        ...placement,
        species: safeString(precursor.species),
      };
    });
  }

  return safeArray(payload.precursors).map((item) => {
    const legacy = safeRecord(item);
    const precursorIndex = findPrecursorIndexBySpecies(precursorItems, legacy.material);
    const precursor = precursorIndex === null ? {} : precursorItems[precursorIndex];
    return {
      precursor_index: precursorIndex,
      species: safeString(precursor.species) || safeString(legacy.material),
      zone_key: null,
      position_cm: legacy.position_cm,
      note: legacy.note,
    };
  });
}

function renderGasParams(modules: ExperimentModulePayloadRead[] | undefined) {
  const payload = getModulePayload(modules, "gas_program");
  const segments = safeArray(payload.segments).map((item) => safeRecord(item));
  const preWashingGas = safeString(payload.pre_washing_gas);
  if (segments.length === 0 && !preWashingGas) {
    return <Typography.Text type="secondary">无气体程序记录</Typography.Text>;
  }
  return (
    <div className="content-stack">
      <Typography.Text>预清洗气体：{preWashingGas || "—"}</Typography.Text>
      {segments.length > 0 ? (
        <Table
          columns={[
            { title: "阶段", dataIndex: "stage", render: (v: unknown) => safeString(v) || "—" },
            { title: "气体", dataIndex: "gas", render: (v: unknown) => safeString(v) || "—" },
            { title: "开始 (min)", dataIndex: "start_min", render: (v: unknown) => safeString(v) || "—" },
            { title: "结束 (min)", dataIndex: "end_min", render: (v: unknown) => safeString(v) || "—" },
            { title: "流量 (sccm)", dataIndex: "flow_sccm", render: (v: unknown) => safeString(v) || "—" },
            {
              title: "组分",
              render: (_: unknown, record: Record<string, unknown>) => formatGasComponents(record.components, record.flow_sccm),
            },
            { title: "备注", dataIndex: "note", render: (v: unknown) => safeString(v) || "—" },
          ]}
          dataSource={segments}
          pagination={false}
          rowKey={(_, index) => `segment-${index}`}
          size="small"
        />
      ) : null}
    </div>
  );
}

function renderProcessObservationParams(modules: ExperimentModulePayloadRead[] | undefined) {
  const payload = getModulePayload(modules, "process_observation");
  const abnormalEvents = safeArray(payload.abnormal_events)
    .map((v) => safeString(v))
    .filter(Boolean);
  return (
    <div className="content-stack">
      <Typography.Text>颜色变化：{safeString(payload.color_change) || "—"}</Typography.Text>
      <Typography.Text>
        异常事件：{abnormalEvents.length > 0 ? abnormalEvents.join("、") : "—"}
      </Typography.Text>
      <Typography.Text>备注：{safeString(payload.note) || "—"}</Typography.Text>
    </div>
  );
}

function renderCharacterizationParams(modules: ExperimentModulePayloadRead[] | undefined) {
  const payload = getModulePayload(modules, "characterization");
  const methods = safeArray(payload.methods).map((item) => safeRecord(item));
  if (methods.length === 0) {
    return <Typography.Text type="secondary">无表征方法记录</Typography.Text>;
  }
  return (
    <List
      dataSource={methods}
      renderItem={(method, index) => (
        <List.Item key={`method-${index}`}>
          <List.Item.Meta
            description={`结果：${safeString(method.result) || "—"} · 激发波长：${safeString(method.excitation_nm) || "—"} nm · 备注：${safeString(method.note) || "—"}`}
            title={
              <Space>
                <Typography.Text strong>{safeString(method.method) || "未命名方法"}</Typography.Text>
                <Tag color={method.enabled ? "success" : "default"}>{method.enabled ? "启用" : "未启用"}</Tag>
              </Space>
            }
          />
        </List.Item>
      )}
    />
  );
}

function renderResultSummaryParams(modules: ExperimentModulePayloadRead[] | undefined) {
  const payload = getModulePayload(modules, "result_summary");
  return (
    <div className="content-stack">
      <Typography.Text>质量标签：{safeString(payload.quality_label) || "—"}</Typography.Text>
      <Typography.Text>总结结论：{safeString(payload.summary_result) || "—"}</Typography.Text>
      <Typography.Text>下一步：{safeString(payload.next_step) || "—"}</Typography.Text>
    </div>
  );
}

export function ExperimentDetailPage() {
  const { experimentId = "" } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const currentUser = session.currentUser;
  const [downloadState, setDownloadState] = useState<"excel" | "json" | null>(null);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [activeFileDownload, setActiveFileDownload] = useState<string | null>(null);

  const experimentQuery = useQuery({
    queryKey: ["experiments", "detail", currentUser?.id ?? "anonymous", experimentId],
    queryFn: () => getExperiment(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  });

  const modulesQuery = useQuery({
    queryKey: ["experiments", "modules", currentUser?.id ?? "anonymous", experimentId],
    queryFn: () => listExperimentModules(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  });

  const filesQuery = useQuery({
    queryKey: ["experiments", "files", currentUser?.id ?? "anonymous", experimentId, "preview"],
    queryFn: () =>
      listExperimentFiles(session.accessToken!, {
        experimentId,
      }),
    enabled: session.isAuthenticated && Boolean(experimentId),
  });

  const auditQuery = useQuery({
    queryKey: ["experiments", "audit", currentUser?.id ?? "anonymous", experimentId],
    queryFn: () => listExperimentAuditEvents(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  });

  const samplesQuery = useQuery({
    queryKey: ["experiments", "samples", currentUser?.id ?? "anonymous", experimentId],
    queryFn: () => listExperimentSamples(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  });

  const resolveErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof HttpError) {
      return error.detail || fallback;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return fallback;
  };

  const handleExportJson = async () => {
    setDownloadState("json");
    setDownloadMessage(null);

    try {
      const payload = await exportExperimentJson(session.accessToken!, experimentId);
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      triggerBlobDownload(blob, `${experimentQuery.data?.run_code ?? "experiment"}-export.json`);
    } catch (error) {
      setDownloadMessage(resolveErrorMessage(error, "JSON 导出失败"));
    } finally {
      setDownloadState(null);
    }
  };

  const handleExportExcel = async () => {
    setDownloadState("excel");
    setDownloadMessage(null);

    try {
      const payload = await downloadExperimentExcel(session.accessToken!, experimentId);
      triggerBlobDownload(
        payload.blob,
        payload.filename || `${experimentQuery.data?.run_code ?? "experiment"}.xlsx`,
      );
    } catch (error) {
      setDownloadMessage(resolveErrorMessage(error, "Excel 导出失败"));
    } finally {
      setDownloadState(null);
    }
  };

  const handleFileDownload = async (fileId: string, filename: string) => {
    setActiveFileDownload(fileId);
    setDownloadMessage(null);

    try {
      const payload = await downloadExperimentFile(session.accessToken!, fileId);
      triggerBlobDownload(payload.blob, payload.filename || filename);
    } catch (error) {
      setDownloadMessage(resolveErrorMessage(error, "文件下载失败"));
    } finally {
      setActiveFileDownload(null);
    }
  };

  if (experimentQuery.isLoading) {
    return <LoadingState />;
  }

  if (experimentQuery.isError) {
    return (
      <div className="content-stack">
        <PageHeader
          actions={
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => {
                navigate("/experiments");
              }}
            >
              返回列表
            </Button>
          }
          subtitle="无法加载实验详情，请检查网络连接或当前账号权限。"
          title="实验详情"
        />
        <Alert
          title={
            experimentQuery.error instanceof HttpError
              ? experimentQuery.error.detail || "实验详情加载失败"
              : "实验详情加载失败"
          }
          showIcon
          type="error"
        />
      </div>
    );
  }

  if (!experimentQuery.data) {
    return (
      <Alert
        title="实验详情暂不可用"
        showIcon
        type="warning"
      />
    );
  }

  const experiment = experimentQuery.data;
  const fileItems = filesQuery.data?.items ?? [];
  const filePreview = fileItems.slice(0, 5);
  const fileOverflow = fileItems.length > 5 ? fileItems.length - 5 : 0;

  return (
    <div className="content-stack">
      <PageHeader
        actions={
          <Space>
            <Button
              aria-label="返回列表"
              icon={<ArrowLeftOutlined />}
              onClick={() => {
                navigate("/experiments");
              }}
            >
              返回列表
            </Button>
            <Button
              aria-label="管理文件"
              icon={<FolderOpenOutlined />}
              onClick={() => {
                navigate(`/experiments/${experimentId}/files`);
              }}
            >
              管理文件
            </Button>
            {experiment.status === "draft" ? (
              <Button
                icon={<EditOutlined />}
                onClick={() => {
                  navigate(`/experiments/${experiment.id}/edit`);
                }}
                type="primary"
              >
                继续编辑
              </Button>
            ) : null}
          </Space>
        }
        subtitle="查看实验状态、样品、文件、审计记录，并导出数据。"
        title="实验详情"
      />
      {downloadMessage ? <Alert title={downloadMessage} showIcon type="error" /> : null}
      <ExperimentSourceBanner experiment={experiment} />

      <Tabs className="detail-tabs" defaultActiveKey="overview" items={[
        {
          key: "overview",
          label: "概览",
          children: (
            <div className="content-stack">
              <Card>
                <div className="content-stack">
                  <Space align="center" size={12} wrap>
                    <Typography.Text code>{experiment.run_code}</Typography.Text>
                    <StatusTag status={experiment.status} />
                    {experiment.quality_label ? (
                      <Typography.Text type="secondary">质量标签：{experiment.quality_label}</Typography.Text>
                    ) : null}
                  </Space>
                  <Typography.Paragraph style={{ marginBottom: 0 }} type="secondary">
                    仅草稿状态可编辑，已提交/已锁定实验仅保留可执行操作。
                  </Typography.Paragraph>
                </div>
              </Card>
              <Card>
                <div className="content-stack">
                  <Typography.Title level={4} style={{ margin: 0 }}>
                    基本信息
                  </Typography.Title>
                  <ExperimentSummary experiment={experiment} />
                </div>
              </Card>
              <Card>
                <div className="content-stack">
                  <Typography.Title level={4} style={{ margin: 0 }}>
                    导出
                  </Typography.Title>
                  <Typography.Paragraph style={{ marginBottom: 0 }} type="secondary">
                    结构化 JSON 适合留档和二次分析，Excel 适合线下共享与手工复核。
                  </Typography.Paragraph>
                  <Space wrap>
                    <Button
                      aria-label="导出 JSON"
                      icon={<DownloadOutlined />}
                      loading={downloadState === "json"}
                      onClick={() => {
                        void handleExportJson();
                      }}
                    >
                      导出 JSON
                    </Button>
                    <Button
                      aria-label="导出 Excel"
                      icon={<DownloadOutlined />}
                      loading={downloadState === "excel"}
                      onClick={() => {
                        void handleExportExcel();
                      }}
                    >
                      导出 Excel
                    </Button>
                  </Space>
                  {session.accessToken && currentUser ? (
                    <ExperimentStateActions
                      accessToken={session.accessToken}
                      currentUser={currentUser}
                      experiment={experiment}
                      onUpdated={() => undefined}
                    />
                  ) : null}
                </div>
              </Card>
            </div>
          ),
        },
        {
          key: "parameters",
          label: "参数",
          children: (
            <div className="content-stack">
              {modulesQuery.isLoading ? (
                <LoadingState />
              ) : modulesQuery.isError ? (
                <Alert
                  title={resolveErrorMessage(modulesQuery.error, "参数加载失败")}
                  showIcon
                  type="error"
                />
              ) : (
                <>
                  <Card title="基础信息">{renderBasicInfoParams(modulesQuery.data?.items)}</Card>
                  <Card title="环境">{renderEnvironmentParams(modulesQuery.data?.items)}</Card>
                  <Card title="预检查">{renderPrecheckParams(modulesQuery.data?.items)}</Card>
                  <Card title="前驱体">{renderPrecursorsParams(modulesQuery.data?.items)}</Card>
                  <Card title="基底">{renderSubstratesParams(modulesQuery.data?.items)}</Card>
                  <Card title="炉温">{renderFurnaceParams(modulesQuery.data?.items)}</Card>
                  <Card title="气体">{renderGasParams(modulesQuery.data?.items)}</Card>
                  <Card title="过程观察">{renderProcessObservationParams(modulesQuery.data?.items)}</Card>
                  <Card title="表征">{renderCharacterizationParams(modulesQuery.data?.items)}</Card>
                  <Card title="结果总结">{renderResultSummaryParams(modulesQuery.data?.items)}</Card>
                </>
              )}
            </div>
          ),
        },
        {
          key: "samples",
          label: "样品",
          children: (
            <Card>
              <div className="content-stack">
                <Typography.Title level={4} style={{ margin: 0 }}>
                  样品概览
                </Typography.Title>
                {samplesQuery.isLoading ? (
                  <LoadingState />
                ) : samplesQuery.isError ? (
                  <Alert
                    title={resolveErrorMessage(samplesQuery.error, "样品概览加载失败")}
                    showIcon
                    type="error"
                  />
                ) : (samplesQuery.data?.items.length ?? 0) === 0 ? (
                  <EmptyState description="当前实验还没有样品记录。在编辑器中添加基底后将自动生成样品。" />
                ) : (
                  <List
                    dataSource={samplesQuery.data?.items ?? []}
                    renderItem={(sample) => (
                      <List.Item
                        actions={[
                          <Button
                            key={`sample-${sample.id}`}
                            aria-label={`查看样品 ${sample.sample_code}`}
                            onClick={() => {
                              navigate(`/samples/${sample.id}`);
                            }}
                          >
                            查看样品
                          </Button>,
                        ]}
                      >
                        <List.Item.Meta
                          description={`${sample.role} · ${sample.substrate_type || "未填写基底"}${sample.size_mm ? ` · ${sample.size_mm}` : ""}`}
                          title={sample.sample_code}
                        />
                      </List.Item>
                    )}
                  />
                )}
              </div>
            </Card>
          ),
        },
        {
          key: "files",
          label: "文件",
          children: (
            <Card>
              <div className="content-stack">
                <Space align="center" style={{ justifyContent: "space-between" }}>
                  <Typography.Title level={4} style={{ margin: 0 }}>
                    文件概览
                  </Typography.Title>
                  <Button
                    icon={<FolderOpenOutlined />}
                    onClick={() => {
                      navigate(`/experiments/${experimentId}/files`);
                    }}
                  >
                    管理文件
                  </Button>
                </Space>
                {filesQuery.isLoading ? (
                  <LoadingState />
                ) : filesQuery.isError ? (
                  <Alert
                    title={resolveErrorMessage(filesQuery.error, "文件概览加载失败")}
                    showIcon
                    type="error"
                  />
                ) : fileItems.length === 0 ? (
                  <EmptyState description="当前实验还没有文件记录。进入文件管理页可上传表征原始文件或处理结果。" />
                ) : (
                  <>
                    <List
                      dataSource={filePreview}
                      renderItem={(file) => (
                        <List.Item
                          actions={[
                            <Button
                              key={`download-${file.id}`}
                              loading={activeFileDownload === file.id}
                              onClick={() => {
                                void handleFileDownload(file.id, file.original_name);
                              }}
                              size="small"
                            >
                              下载
                            </Button>,
                          ]}
                        >
                          <List.Item.Meta
                            description={`${file.method} · ${formatFileCategory(file.file_category)}${file.note ? ` · ${file.note}` : ""}`}
                            title={file.original_name}
                          />
                        </List.Item>
                      )}
                    />
                    {fileOverflow > 0 ? (
                      <Typography.Text type="secondary">
                        还有 {fileOverflow} 个文件，
                        <Button
                          onClick={() => {
                            navigate(`/experiments/${experimentId}/files`);
                          }}
                          type="link"
                        >
                          去管理页查看
                        </Button>
                      </Typography.Text>
                    ) : null}
                  </>
                )}
              </div>
            </Card>
          ),
        },
        {
          key: "audit",
          label: "审计",
          children: (
            <Card>
              <div className="content-stack">
                <Typography.Title level={4} style={{ margin: 0 }}>
                  审计轨迹
                </Typography.Title>
                {auditQuery.isLoading ? (
                  <LoadingState />
                ) : auditQuery.isError ? (
                  <Alert
                    title={resolveErrorMessage(auditQuery.error, "审计轨迹加载失败")}
                    showIcon
                    type="error"
                  />
                ) : (auditQuery.data?.items.length ?? 0) === 0 ? (
                  <EmptyState description="当前实验还没有审计事件。创建、编辑、提交和文件操作会自动记录在这里。" />
                ) : (
                  <List
                    dataSource={(auditQuery.data?.items ?? []).slice().reverse()}
                    renderItem={(item) => (
                      <List.Item>
                        <List.Item.Meta
                          description={`${item.entity_type} · ${item.reason || "无附加原因"} · ${dayjs(item.created_at).format("YYYY-MM-DD HH:mm")}`}
                          title={<Typography.Text code>{item.action}</Typography.Text>}
                        />
                      </List.Item>
                    )}
                  />
                )}
              </div>
            </Card>
          ),
        },
      ]} />
    </div>
  );
}
