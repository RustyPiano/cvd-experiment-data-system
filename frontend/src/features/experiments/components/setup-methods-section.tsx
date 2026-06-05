import { Button, Card, Checkbox, Descriptions, Drawer, Input, Select, Space, Typography } from "antd";
import type { CheckboxChangeEvent } from "antd/es/checkbox";
import { useEffect, useState } from "react";

import { useAuth } from "../../auth/use-auth";
import { AuthenticatedImage } from "../../../shared/ui/authenticated-image";
import type { FileAssetRead, SetupLibraryRead } from "../../../shared/types/api";
import { downloadExperimentFile } from "../api";
import { triggerBlobDownload } from "../../../shared/lib/download";
import type { SetupMethodsValues } from "../editor-types";

const { TextArea } = Input;

export function SetupMethodsSection({
  disabled,
  files,
  onApplyLibrary,
  onChange,
  libraryOptions,
  value,
}: {
  disabled: boolean;
  files: FileAssetRead[];
  onApplyLibrary: (libraryId: string) => void;
  onChange: (nextValue: SetupMethodsValues) => void;
  libraryOptions: SetupLibraryRead[];
  value: SetupMethodsValues;
}) {
  const { session } = useAuth();
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | undefined>(
    value.sourceSetupLibraryId || undefined
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [downloadingDiagram, setDownloadingDiagram] = useState(false);

  useEffect(() => {
    setSelectedLibraryId(value.sourceSetupLibraryId || undefined);
  }, [value.sourceSetupLibraryId]);

  const options = libraryOptions.map((entry) => ({
    label: `${entry.name} (${entry.institution || "未知机构"})`,
    value: entry.id,
  }));

  const selectedLibrary = libraryOptions.find((entry) => entry.id === selectedLibraryId);

  const diagramFile = value.diagramFileAssetId
    ? files.find((f) => f.id === value.diagramFileAssetId)
    : undefined;

  const updateField = (patch: Partial<SetupMethodsValues>) => {
    onChange({
      ...value,
      ...patch,
      confirmedAt: null,
      confirmedById: null,
    });
  };

  const handleSameAsTemplateChange = (event: CheckboxChangeEvent) => {
    updateField({
      isSameAsTemplate: event.target.checked,
      deviationNote: event.target.checked ? "" : value.deviationNote,
    });
  };

  const handleDownloadDiagram = async (file: FileAssetRead) => {
    if (!session?.accessToken) return;
    setDownloadingDiagram(true);
    try {
      const payload = await downloadExperimentFile(session.accessToken, file.id);
      triggerBlobDownload(payload.blob, payload.filename || file.original_name);
    } catch (error) {
      console.error("Failed to download diagram", error);
    } finally {
      setDownloadingDiagram(false);
    }
  };

  return (
    <div className="editor-form-grid">
      <div className="editor-field editor-field-wide">
        <Typography.Text strong>选择 Setup 库记录</Typography.Text>
        <Space.Compact block style={{ marginTop: "8px" }}>
          <Select
            allowClear
            aria-label="选择 Setup"
            disabled={disabled || options.length === 0}
            onChange={(nextValue) => {
              setSelectedLibraryId(nextValue);
            }}
            options={options}
            placeholder="选择 Setup"
            value={selectedLibraryId}
            style={{ width: "calc(100% - 200px)", minWidth: 200 }}
          />
          <Button
            disabled={disabled || !selectedLibraryId}
            onClick={() => {
              if (selectedLibraryId) {
                onApplyLibrary(selectedLibraryId);
              }
            }}
            type="primary"
          >
            套用 Setup
          </Button>
          <Button
            disabled={!selectedLibraryId}
            onClick={() => {
              setDrawerOpen(true);
            }}
          >
            预览
          </Button>
        </Space.Compact>
        <div style={{ marginTop: "8px" }}>
          <Typography.Link href="/setup-library" target="_blank">
            + 新建/管理我的 Setup
          </Typography.Link>
        </div>
      </div>

      {/* 只读快照预览区 */}
      {value.setupNameSnapshot && (
        <div className="editor-field editor-field-wide">
          <Card
            title={
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <span>{value.setupNameSnapshot}</span>
                {value.institutionSnapshot && (
                  <Typography.Text type="secondary" style={{ fontSize: "14px", fontWeight: "normal" }}>
                    {value.institutionSnapshot}
                  </Typography.Text>
                )}
              </div>
            }
            type="inner"
          >
            <Descriptions column={1} bordered size="middle">
              <Descriptions.Item label="实验方法/步骤">
                <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>
                  {value.methodsTextSnapshot}
                </pre>
              </Descriptions.Item>

              {value.apparatusDescriptionSnapshot && (
                <Descriptions.Item label="装置说明">
                  <div style={{ whiteSpace: "pre-wrap" }}>
                    {value.apparatusDescriptionSnapshot}
                  </div>
                </Descriptions.Item>
              )}

              {value.samplePlacementDescriptionSnapshot && (
                <Descriptions.Item label="样品放置说明">
                  <div style={{ whiteSpace: "pre-wrap" }}>
                    {value.samplePlacementDescriptionSnapshot}
                  </div>
                </Descriptions.Item>
              )}

              {value.reactionFlowDescriptionSnapshot && (
                <Descriptions.Item label="反应气流说明">
                  <div style={{ whiteSpace: "pre-wrap" }}>
                    {value.reactionFlowDescriptionSnapshot}
                  </div>
                </Descriptions.Item>
              )}

              <Descriptions.Item label="文献/参考">
                {value.referencePaperUrlSnapshot ? (
                  <a
                    href={value.referencePaperUrlSnapshot}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {value.referencePaperUrlSnapshot}
                  </a>
                ) : value.unpublishedReasonSnapshot ? (
                  <span>未发表: {value.unpublishedReasonSnapshot}</span>
                ) : (
                  "-"
                )}
              </Descriptions.Item>

              {diagramFile && (
                <Descriptions.Item label="示意图">
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <AuthenticatedImage
                      url={diagramFile.download_url}
                      token={session?.accessToken || ""}
                      alt={diagramFile.original_name}
                      style={{
                        maxWidth: "100%",
                        maxHeight: 300,
                        objectFit: "contain",
                        display: "block",
                      }}
                    />
                    <div>
                      <Button
                        type="link"
                        style={{ padding: 0 }}
                        loading={downloadingDiagram}
                        onClick={() => handleDownloadDiagram(diagramFile)}
                      >
                        下载示意图 ({diagramFile.original_name})
                      </Button>
                    </div>
                  </div>
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>
        </div>
      )}

      {/* 偏差说明录入 */}
      {value.sourceSetupLibraryId && (
        <div className="editor-field editor-field-wide">
          <Checkbox
            checked={value.isSameAsTemplate}
            disabled={disabled}
            onChange={handleSameAsTemplateChange}
          >
            与该 Setup 一致
          </Checkbox>

          {!value.isSameAsTemplate && (
            <div style={{ marginTop: "16px" }}>
              <Typography.Text strong style={{ display: "block", marginBottom: "8px" }}>
                本次偏差说明 (Deviation Note)
              </Typography.Text>
              <TextArea
                aria-label="偏差说明"
                autoSize={{ minRows: 2, maxRows: 6 }}
                disabled={disabled}
                onChange={(event) => {
                  updateField({ deviationNote: event.target.value });
                }}
                value={value.deviationNote}
                placeholder="请输入本次实验与所选 Setup 模板的偏差说明"
              />
            </div>
          )}
        </div>
      )}

      {/* 预览 Drawer */}
      <Drawer
        title={`Setup 预览: ${selectedLibrary?.name || ""}`}
        placement="right"
        width={640}
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
      >
        {selectedLibrary && (
          <Descriptions column={1} bordered size="middle">
            <Descriptions.Item label="名称">{selectedLibrary.name}</Descriptions.Item>
            <Descriptions.Item label="机构">
              {selectedLibrary.institution || "-"}
            </Descriptions.Item>
            <Descriptions.Item label="实验方法/步骤">
              <div style={{ whiteSpace: "pre-wrap" }}>{selectedLibrary.methods_text}</div>
            </Descriptions.Item>
            <Descriptions.Item label="设备描述">
              <div style={{ whiteSpace: "pre-wrap" }}>
                {selectedLibrary.apparatus_description || "-"}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="样品放置描述">
              <div style={{ whiteSpace: "pre-wrap" }}>
                {selectedLibrary.sample_placement_description || "-"}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="反应气流描述">
              <div style={{ whiteSpace: "pre-wrap" }}>
                {selectedLibrary.reaction_flow_description || "-"}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="文献/参考">
              {selectedLibrary.reference_paper_url ? (
                <a
                  href={selectedLibrary.reference_paper_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {selectedLibrary.reference_paper_url}
                </a>
              ) : selectedLibrary.unpublished_reason ? (
                <span>未发表: {selectedLibrary.unpublished_reason}</span>
              ) : (
                "-"
              )}
            </Descriptions.Item>
            <Descriptions.Item label="示意图">
              {selectedLibrary.has_diagram && selectedLibrary.diagram_download_url ? (
                <AuthenticatedImage
                  url={selectedLibrary.diagram_download_url}
                  token={session?.accessToken || ""}
                  alt={selectedLibrary.name}
                  style={{ maxWidth: "100%", marginTop: 8 }}
                />
              ) : (
                "-"
              )}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
}
