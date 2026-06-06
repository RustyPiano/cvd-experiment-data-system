import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Radio,
  Space,
  Table,
  Tag,
  Upload,
} from "antd";
import {
  FileImageOutlined,
  InboxOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import type { UploadFile } from "antd";
import dayjs from "dayjs";

import { useAuth } from "../auth/use-auth";
import { resolveErrorMessage } from "../../shared/api/http-error";
import { PageHeader } from "../../shared/ui/page-header";
import { LoadingState } from "../../shared/ui/loading-state";
import { EmptyState } from "../../shared/ui/empty-state";
import { AuthenticatedImage } from "../../shared/ui/authenticated-image";
import type {
  SetupLibraryCreateRequest,
  SetupLibraryRead,
} from "../../shared/types/api";
import {
  createSetupLibraryEntry,
  deactivateSetupLibraryEntry,
  listSetupLibrary,
  updateSetupLibraryEntry,
  uploadSetupLibraryDiagram,
} from "./api";

export function SetupLibraryPage() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const token = session.accessToken || "";
  const isViewer = session.currentUser?.role === "viewer";

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<SetupLibraryRead | null>(null);
  const [saving, setSaving] = useState(false);

  // Drawer State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewingEntry, setViewingEntry] = useState<SetupLibraryRead | null>(null);

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  const [form] = Form.useForm();
  const referenceType = Form.useWatch("referenceType", form);

  // Query Setup Library Entries
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["setup-library", token],
    queryFn: () => listSetupLibrary(token),
    enabled: session.isAuthenticated && !!token,
  });

  const setupEntries = data?.items ?? [];

  // Deactivate Mutation
  const deactivateMutation = useMutation({
    mutationFn: (entryId: string) => deactivateSetupLibraryEntry(token, entryId),
    onSuccess: async () => {
      message.success("停用成功");
      await queryClient.invalidateQueries({ queryKey: ["setup-library"] });
    },
    onError: () => {
      message.error("停用失败");
    },
  });

  const handleOpenCreate = () => {
    setEditingEntry(null);
    form.resetFields();
    form.setFieldsValue({
      visibility: "private",
      referenceType: "unpublished",
    });
    setSelectedFile(null);
    setFileList([]);
    setModalOpen(true);
  };

  const handleOpenEdit = (entry: SetupLibraryRead) => {
    setEditingEntry(entry);
    const isPublished = !!entry.reference_paper_url;
    form.setFieldsValue({
      name: entry.name,
      institution: entry.institution,
      visibility: entry.visibility,
      methods_text: entry.methods_text,
      apparatus_description: entry.apparatus_description,
      sample_placement_description: entry.sample_placement_description,
      reaction_flow_description: entry.reaction_flow_description,
      referenceType: isPublished ? "published" : "unpublished",
      reference_paper_url: entry.reference_paper_url,
      unpublished_reason: entry.unpublished_reason,
    });
    setSelectedFile(null);
    setFileList([]);
    setModalOpen(true);
  };

  const handleViewDetails = (entry: SetupLibraryRead) => {
    setViewingEntry(entry);
    setDrawerOpen(true);
  };

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const updatePayload: SetupLibraryCreateRequest = {
        name: values.name,
        institution: values.institution || null,
        visibility: values.visibility,
        methods_text: values.methods_text,
        apparatus_description: values.apparatus_description || "",
        sample_placement_description: values.sample_placement_description || "",
        reaction_flow_description: values.reaction_flow_description || "",
        reference_paper_url:
          values.referenceType === "published"
            ? (values.reference_paper_url || null)
            : null,
        unpublished_reason:
          values.referenceType === "unpublished"
            ? (values.unpublished_reason || null)
            : null,
      };

      let savedEntry: SetupLibraryRead;
      if (editingEntry) {
        savedEntry = await updateSetupLibraryEntry(
          token,
          editingEntry.id,
          updatePayload,
        );
      } else {
        savedEntry = await createSetupLibraryEntry(token, updatePayload);
      }

      if (selectedFile) {
        await uploadSetupLibraryDiagram(token, savedEntry.id, selectedFile);
      }

      message.success("保存成功");
      setModalOpen(false);
      setSelectedFile(null);
      setFileList([]);
      await queryClient.invalidateQueries({ queryKey: ["setup-library"] });
    } catch {
      message.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: "名称",
      dataIndex: "name",
      key: "name",
      render: (name: string, record: SetupLibraryRead) => (
        <Space>
          <span style={{ fontWeight: 500 }}>{name}</span>
          {record.visibility === "private" ? (
            <Tag color="blue">私有</Tag>
          ) : (
            <Tag color="purple">群组</Tag>
          )}
        </Space>
      ),
    },
    {
      title: "机构",
      dataIndex: "institution",
      key: "institution",
      render: (val: string | null) => val || "-",
    },
    {
      title: "创建者",
      dataIndex: "owner_name",
      key: "owner_name",
      render: (val: string | null) => val || "-",
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      key: "updated_at",
      render: (val: string) => dayjs(val).format("YYYY-MM-DD HH:mm"),
    },
    {
      title: "示意图",
      dataIndex: "has_diagram",
      key: "has_diagram",
      render: (has: boolean, record: SetupLibraryRead) =>
        has ? (
          <Button
            type="link"
            aria-label="查看示意图详情"
            icon={<FileImageOutlined />}
            onClick={() => handleViewDetails(record)}
          >
            有
          </Button>
        ) : (
          "-"
        ),
    },
    {
      title: "操作",
      key: "actions",
      render: (_: unknown, record: SetupLibraryRead) => (
        <Space size="middle">
          <Button type="link" onClick={() => handleViewDetails(record)}>
            查看详情
          </Button>
          {record.can_edit && (
            <>
              <Button type="link" onClick={() => handleOpenEdit(record)}>
                编辑
              </Button>
              <Popconfirm
                title="确定停用该 Setup 库记录吗？"
                onConfirm={() => deactivateMutation.mutate(record.id)}
                okText="确定"
                cancelText="取消"
                okButtonProps={{ loading: deactivateMutation.isPending }}
              >
                <Button type="link" danger>
                  停用
                </Button>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="content-stack">
      <PageHeader
        title="Setup 库"
        subtitle="记录和管理实验室的 CVD 装置与实验 Setup，用于在实验中快速引用。"
        actions={
          isViewer ? undefined : (
            <Button
              type="primary"
              aria-label="新建 Setup 记录"
              icon={<PlusOutlined />}
              onClick={handleOpenCreate}
            >
              新建 Setup
            </Button>
          )
        }
      />

      {isError && (
        <Alert
          type="error"
          title={resolveErrorMessage(error, "加载失败")}
          showIcon
        />
      )}

      <Card>
        {isLoading ? (
          <LoadingState />
        ) : setupEntries.length === 0 ? (
          <EmptyState description="暂无 Setup 库记录。快去新建一个吧！" />
        ) : (
          <Table
            columns={columns}
            dataSource={setupEntries}
            rowKey="id"
            pagination={{ pageSize: 10, showSizeChanger: true }}
          />
        )}
      </Card>

      {/* View Details Drawer */}
      <Drawer
        title={`Setup 详情: ${viewingEntry?.name || ""}`}
        placement="right"
        size="large"
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
      >
        {viewingEntry && (
          <Descriptions column={1} bordered size="middle">
            <Descriptions.Item label="名称">{viewingEntry.name}</Descriptions.Item>
            <Descriptions.Item label="可见性">
              {viewingEntry.visibility === "private" ? "私有 (Private)" : "群组 (Group)"}
            </Descriptions.Item>
            <Descriptions.Item label="机构">
              {viewingEntry.institution || "-"}
            </Descriptions.Item>
            <Descriptions.Item label="创建者">
              {viewingEntry.owner_name || "-"}
            </Descriptions.Item>
            <Descriptions.Item label="更新时间">
              {dayjs(viewingEntry.updated_at).format("YYYY-MM-DD HH:mm")}
            </Descriptions.Item>
            <Descriptions.Item label="实验方法/步骤">
              <div style={{ whiteSpace: "pre-wrap" }}>{viewingEntry.methods_text}</div>
            </Descriptions.Item>
            <Descriptions.Item label="设备描述">
              <div style={{ whiteSpace: "pre-wrap" }}>
                {viewingEntry.apparatus_description || "-"}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="样品放置描述">
              <div style={{ whiteSpace: "pre-wrap" }}>
                {viewingEntry.sample_placement_description || "-"}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="反应气流描述">
              <div style={{ whiteSpace: "pre-wrap" }}>
                {viewingEntry.reaction_flow_description || "-"}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="文献/参考">
              {viewingEntry.reference_paper_url ? (
                <a
                  href={viewingEntry.reference_paper_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {viewingEntry.reference_paper_url}
                </a>
              ) : viewingEntry.unpublished_reason ? (
                <span>未发表: {viewingEntry.unpublished_reason}</span>
              ) : (
                "-"
              )}
            </Descriptions.Item>
            <Descriptions.Item label="示意图">
              {viewingEntry.has_diagram && viewingEntry.diagram_download_url ? (
                <AuthenticatedImage
                  url={viewingEntry.diagram_download_url}
                  token={token}
                  alt={viewingEntry.name}
                  style={{ maxWidth: "100%", marginTop: 8 }}
                />
              ) : (
                "-"
              )}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>

      {/* Create / Edit Form Modal */}
      <Modal
        title={editingEntry ? "编辑 Setup" : "新建 Setup"}
        open={modalOpen}
        onOk={handleFormSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okButtonProps={{ disabled: saving }}
        cancelButtonProps={{ disabled: saving }}
        okText="确定"
        cancelText="取消"
        width={720}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          disabled={saving}
        >
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: "请输入 Setup 名称" }]}
          >
            <Input autoComplete="off" placeholder="请输入 Setup 名称" />
          </Form.Item>

          <Form.Item name="institution" label="机构">
            <Input autoComplete="off" placeholder="请输入机构名称（可选）" />
          </Form.Item>

          <Form.Item
            name="visibility"
            label="可见性"
            rules={[{ required: true }]}
          >
            <Radio.Group>
              <Radio value="private">私有 (Private)</Radio>
              <Radio value="group">群组 (Group)</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            name="methods_text"
            label="实验方法/步骤"
            rules={[{ required: true, message: "请输入实验方法/步骤" }]}
          >
            <Input.TextArea autoComplete="off"
              rows={4}
              placeholder="请输入实验方法或具体操作步骤"
            />
          </Form.Item>

          <Form.Item name="apparatus_description" label="设备描述">
            <Input.TextArea autoComplete="off"
              rows={3}
              placeholder="请输入设备配置或硬件环境描述（可选）"
            />
          </Form.Item>

          <Form.Item name="sample_placement_description" label="样品放置描述">
            <Input.TextArea autoComplete="off"
              rows={3}
              placeholder="请输入基底/源在炉腔内的具体放置位置描述（可选）"
            />
          </Form.Item>

          <Form.Item name="reaction_flow_description" label="反应气流描述">
            <Input.TextArea autoComplete="off"
              rows={3}
              placeholder="请输入各阶段气流载气及配比描述（可选）"
            />
          </Form.Item>

          <Form.Item
            name="referenceType"
            label="参考文献类型"
            rules={[{ required: true }]}
          >
            <Radio.Group>
              <Radio value="published">已发表文献</Radio>
              <Radio value="unpublished">未发表/内部开发</Radio>
            </Radio.Group>
          </Form.Item>

          {referenceType === "published" && (
            <Form.Item
              name="reference_paper_url"
              label="文献链接 (URL)"
              rules={[
                { type: "url", message: "请输入有效的 URL" },
              ]}
            >
              <Input autoComplete="off" placeholder="https://doi.org/…" />
            </Form.Item>
          )}

          {referenceType === "unpublished" && (
            <Form.Item
              name="unpublished_reason"
              label="未发表说明"
            >
              <Input.TextArea autoComplete="off"
                rows={2}
                placeholder="例如: 课题组自行摸索的工艺"
              />
            </Form.Item>
          )}

          <Form.Item label="示意图上传" htmlFor="diagram-upload-input">
            {editingEntry?.has_diagram && (
              <div style={{ marginBottom: 8 }}>
                <Tag color="success">已有示意图: {editingEntry.diagram_original_name || "diagram"}</Tag>
                <span style={{ fontSize: "12px", color: "#666" }}> (上传新文件将覆盖旧文件)</span>
              </div>
            )}
            <Upload.Dragger
              id="diagram-upload-input"
              beforeUpload={(file) => {
                setSelectedFile(file);
                setFileList([file]);
                return false;
              }}
              fileList={fileList}
              onRemove={() => {
                setSelectedFile(null);
                setFileList([]);
              }}
              multiple={false}
              maxCount={1}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">点击或将示意图拖拽到此区域上传</p>
              <p className="ant-upload-hint">支持单个图片文件，覆盖已有示意图。</p>
            </Upload.Dragger>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
