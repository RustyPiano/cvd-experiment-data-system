import { Button, Checkbox, Input, Select, Space, Typography } from "antd";
import type { CheckboxChangeEvent } from "antd/es/checkbox";
import { useMemo, useState } from "react";

import type {
  FileAssetRead,
  SetupMethodTemplateRead,
} from "../../../shared/types/api";
import type { SetupMethodsValues } from "../editor-types";

const { TextArea } = Input;

type TemplateOption = {
  label: string;
  value: string;
  templateKey: string;
  templateVersion: number;
};

function templateOptionValue(template: SetupMethodTemplateRead) {
  return `${template.template_key}:${template.template_version}`;
}

export function SetupMethodsSection({
  disabled,
  files,
  onApplyTemplate,
  onChange,
  onConfirm,
  templateOptions,
  value,
}: {
  disabled: boolean;
  files: FileAssetRead[];
  onApplyTemplate: (templateKey: string, templateVersion: number) => void;
  onChange: (nextValue: SetupMethodsValues) => void;
  onConfirm: () => void;
  templateOptions: SetupMethodTemplateRead[];
  value: SetupMethodsValues;
}) {
  const [selectedTemplate, setSelectedTemplate] = useState<string | undefined>(
    value.sourceTemplateKey && value.sourceTemplateVersion
      ? `${value.sourceTemplateKey}:${value.sourceTemplateVersion}`
      : undefined,
  );
  const options = useMemo<TemplateOption[]>(
    () =>
      templateOptions.map((template) => ({
        label: `${template.name} v${template.template_version}`,
        value: templateOptionValue(template),
        templateKey: template.template_key,
        templateVersion: template.template_version,
      })),
    [templateOptions],
  );
  const selectedOption = options.find((option) => option.value === selectedTemplate);
  const fileOptions = files.map((file) => ({
    label: file.original_name,
    value: file.id,
  }));
  const isConfirmed = Boolean(value.confirmedAt && value.confirmedById);

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

  return (
    <div className="editor-form-grid">
      <div className="editor-field editor-field-wide">
        <Typography.Text strong>Setup 模板</Typography.Text>
        <Space.Compact block>
          <Select
            allowClear
            aria-label="Setup 模板"
            disabled={disabled || options.length === 0}
            onChange={(nextValue) => {
              setSelectedTemplate(nextValue);
            }}
            options={options}
            placeholder="选择模板"
            value={selectedTemplate}
          />
          <Button
            disabled={disabled || !selectedOption}
            onClick={() => {
              if (selectedOption) {
                onApplyTemplate(selectedOption.templateKey, selectedOption.templateVersion);
              }
            }}
          >
            套用模板
          </Button>
        </Space.Compact>
      </div>
      <div className="editor-field">
        <Typography.Text strong>Setup 名称</Typography.Text>
        <Input
          aria-label="Setup 名称"
          disabled={disabled}
          onChange={(event) => {
            updateField({ setupNameSnapshot: event.target.value });
          }}
          value={value.setupNameSnapshot}
        />
      </div>
      <div className="editor-field">
        <Typography.Text strong>机构</Typography.Text>
        <Input
          aria-label="机构"
          disabled={disabled}
          onChange={(event) => {
            updateField({ institutionSnapshot: event.target.value });
          }}
          value={value.institutionSnapshot}
        />
      </div>
      <div className="editor-field editor-field-wide">
        <Typography.Text strong>装置说明</Typography.Text>
        <TextArea
          aria-label="装置说明"
          autoSize={{ minRows: 3, maxRows: 8 }}
          disabled={disabled}
          onChange={(event) => {
            updateField({ apparatusDescriptionSnapshot: event.target.value });
          }}
          value={value.apparatusDescriptionSnapshot}
        />
      </div>
      <div className="editor-field editor-field-wide">
        <Typography.Text strong>Methods</Typography.Text>
        <TextArea
          aria-label="Methods"
          autoSize={{ minRows: 4, maxRows: 12 }}
          disabled={disabled}
          onChange={(event) => {
            updateField({ methodsTextSnapshot: event.target.value });
          }}
          value={value.methodsTextSnapshot}
        />
      </div>
      <div className="editor-field editor-field-wide">
        <Typography.Text strong>样品放置</Typography.Text>
        <TextArea
          aria-label="样品放置"
          autoSize={{ minRows: 3, maxRows: 8 }}
          disabled={disabled}
          onChange={(event) => {
            updateField({ samplePlacementDescriptionSnapshot: event.target.value });
          }}
          value={value.samplePlacementDescriptionSnapshot}
        />
      </div>
      <div className="editor-field editor-field-wide">
        <Typography.Text strong>反应流程</Typography.Text>
        <TextArea
          aria-label="反应流程"
          autoSize={{ minRows: 3, maxRows: 8 }}
          disabled={disabled}
          onChange={(event) => {
            updateField({ reactionFlowDescriptionSnapshot: event.target.value });
          }}
          value={value.reactionFlowDescriptionSnapshot}
        />
      </div>
      <div className="editor-field">
        <Typography.Text strong>论文链接</Typography.Text>
        <Input
          aria-label="论文链接"
          disabled={disabled}
          onChange={(event) => {
            updateField({ referencePaperUrlSnapshot: event.target.value });
          }}
          value={value.referencePaperUrlSnapshot}
        />
      </div>
      <div className="editor-field">
        <Typography.Text strong>Setup 图</Typography.Text>
        <Select
          allowClear
          aria-label="Setup 图"
          disabled={disabled}
          onChange={(nextValue) => {
            updateField({ diagramFileAssetId: nextValue ?? "" });
          }}
          options={fileOptions}
          placeholder="选择 setup diagram 文件"
          value={value.diagramFileAssetId || undefined}
        />
      </div>
      <div className="editor-field editor-field-wide">
        <Typography.Text strong>未发表说明</Typography.Text>
        <TextArea
          aria-label="未发表说明"
          autoSize={{ minRows: 2, maxRows: 6 }}
          disabled={disabled}
          onChange={(event) => {
            updateField({ unpublishedReasonSnapshot: event.target.value });
          }}
          value={value.unpublishedReasonSnapshot}
        />
      </div>
      <div className="editor-field">
        <Checkbox
          checked={value.isSameAsTemplate}
          disabled={disabled || !value.sourceTemplateKey}
          onChange={handleSameAsTemplateChange}
        >
          与模板一致
        </Checkbox>
      </div>
      {value.sourceTemplateKey && !value.isSameAsTemplate ? (
        <div className="editor-field editor-field-wide">
          <Typography.Text strong>偏差说明</Typography.Text>
          <TextArea
            aria-label="偏差说明"
            autoSize={{ minRows: 2, maxRows: 6 }}
            disabled={disabled}
            onChange={(event) => {
              updateField({ deviationNote: event.target.value });
            }}
            value={value.deviationNote}
          />
        </div>
      ) : null}
      <div className="editor-field editor-field-wide">
        <Typography.Text strong>语义上下文 JSON</Typography.Text>
        <TextArea
          aria-label="语义上下文 JSON"
          autoSize={{ minRows: 3, maxRows: 8 }}
          disabled={disabled}
          onChange={(event) => {
            updateField({ semanticContextText: event.target.value });
          }}
          value={value.semanticContextText}
        />
      </div>
      <div className="editor-field editor-field-wide">
        <Space size={12} wrap>
          <Button disabled={disabled} onClick={onConfirm} type="primary">
            确认 Setup
          </Button>
          {isConfirmed ? (
            <Typography.Text type="success">已确认</Typography.Text>
          ) : (
            <Typography.Text type="secondary">未确认</Typography.Text>
          )}
        </Space>
      </div>
    </div>
  );
}
