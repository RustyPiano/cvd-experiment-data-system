import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Input, Modal, Space } from "antd";
import { useNavigate } from "react-router-dom";

import { HttpError } from "../../shared/api/http-error";
import type { ExperimentRead } from "../../shared/types/api";
import type { SessionUser } from "../auth/auth-store";
import {
  cloneExperiment,
  invalidateExperiment,
  lockExperiment,
  returnExperimentToDraft,
  saveExperimentAsRecipe,
} from "./api";

const { TextArea } = Input;

type ActionKind = "return-to-draft" | "lock" | "invalidate" | "clone" | "save-recipe" | null;

function resolveErrorMessage(error: unknown, fallback: string) {
  if (error instanceof HttpError) {
    return error.detail || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function updateExperimentCache(
  queryClient: ReturnType<typeof useQueryClient>,
  currentUserId: string,
  experiment: ExperimentRead,
) {
  queryClient.setQueryData(["experiments", "detail", currentUserId, experiment.id], experiment);
  queryClient.setQueryData(["experiments", "editor", currentUserId, experiment.id], experiment);
}

export function ExperimentStateActions({
  accessToken,
  currentUser,
  experiment,
  onUpdated,
}: {
  accessToken: string;
  currentUser: SessionUser;
  experiment: ExperimentRead;
  onUpdated: (nextExperiment: ExperimentRead) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [activeAction, setActiveAction] = useState<ActionKind>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [invalidateReason, setInvalidateReason] = useState("");
  const [invalidateValidation, setInvalidateValidation] = useState<string | null>(null);
  const [invalidateOpen, setInvalidateOpen] = useState(false);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [recipeName, setRecipeName] = useState("");
  const [recipeDescription, setRecipeDescription] = useState("");
  const [recipeError, setRecipeError] = useState<string | null>(null);
  const [recipeValidation, setRecipeValidation] = useState<string | null>(null);

  const canMutate = currentUser.role !== "viewer";
  const isOwnerOrAdmin =
    canMutate && (currentUser.role === "admin" || currentUser.id === experiment.owner_id);
  const isOwner = currentUser.id === experiment.owner_id;
  const isBusy = activeAction !== null;
  const canReturnToDraft = isOwnerOrAdmin && experiment.status === "submitted";
  const canLock = isOwnerOrAdmin && experiment.status === "submitted";
  const canInvalidate =
    isOwnerOrAdmin && experiment.status !== "invalid" && experiment.status !== "locked";
  const canClone =
    currentUser.role !== "viewer" &&
    (experiment.status === "locked" || (experiment.status === "submitted" && isOwner));
  const canSaveAsRecipe =
    currentUser.role !== "viewer" &&
    (experiment.status === "submitted" || experiment.status === "locked");

  const syncExperiment = async (nextExperiment: ExperimentRead) => {
    updateExperimentCache(queryClient, currentUser.id, nextExperiment);
    await queryClient.invalidateQueries({
      queryKey: ["experiments", "list", currentUser.id],
    });
    onUpdated(nextExperiment);
  };

  const runTransition = async (
    nextAction: Exclude<ActionKind, null>,
    task: () => Promise<ExperimentRead>,
    fallbackMessage: string,
  ) => {
    setActiveAction(nextAction);
    setActionError(null);

    try {
      const nextExperiment = await task();
      await syncExperiment(nextExperiment);
    } catch (error) {
      setActionError(resolveErrorMessage(error, fallbackMessage));
    } finally {
      setActiveAction(null);
    }
  };

  const closeRecipeModal = () => {
    setRecipeOpen(false);
    setRecipeName("");
    setRecipeDescription("");
    setRecipeError(null);
    setRecipeValidation(null);
  };

  const submitRecipe = async () => {
    const normalizedName = recipeName.trim();
    const normalizedDescription = recipeDescription.trim();

    if (!normalizedName) {
      setRecipeValidation("请填写 Recipe 名称");
      return;
    }

    setActiveAction("save-recipe");
    setRecipeError(null);
    setRecipeValidation(null);

    try {
      await saveExperimentAsRecipe(accessToken, experiment.id, {
        name: normalizedName,
        ...(normalizedDescription ? { description: normalizedDescription } : {}),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["recipes"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "recipes"] }),
        queryClient.invalidateQueries({
          queryKey: ["experiments", "audit", currentUser.id, experiment.id],
        }),
      ]);
      message.success("Recipe 已保存");
      closeRecipeModal();
    } catch (error) {
      setRecipeError(resolveErrorMessage(error, "保存 Recipe 失败"));
    } finally {
      setActiveAction(null);
    }
  };

  if (!canReturnToDraft && !canLock && !canInvalidate && !canClone && !canSaveAsRecipe) {
    return null;
  }

  return (
    <div className="content-stack">
      <Space size="small" wrap>
        {canReturnToDraft ? (
          <Button
            disabled={isBusy}
            loading={activeAction === "return-to-draft"}
            onClick={() => {
              void runTransition(
                "return-to-draft",
                () => returnExperimentToDraft(accessToken, experiment.id),
                "退回草稿失败",
              );
            }}
          >
            退回草稿
          </Button>
        ) : null}
        {canLock ? (
          <Button
            disabled={isBusy}
            loading={activeAction === "lock"}
            onClick={() => {
              void runTransition(
                "lock",
                () => lockExperiment(accessToken, experiment.id),
                "锁定实验失败",
              );
            }}
            type="primary"
          >
            锁定实验
          </Button>
        ) : null}
        {canClone ? (
          <Button
            disabled={isBusy}
            loading={activeAction === "clone"}
            onClick={() => {
              void (async () => {
                setActiveAction("clone");
                setActionError(null);

                try {
                  const clonedExperiment = await cloneExperiment(accessToken, experiment.id);
                  updateExperimentCache(queryClient, currentUser.id, clonedExperiment);
                  await queryClient.invalidateQueries({
                    queryKey: ["experiments", "list", currentUser.id],
                  });
                  navigate(`/experiments/${clonedExperiment.id}/edit`);
                } catch (error) {
                  setActionError(resolveErrorMessage(error, "派生草稿失败"));
                } finally {
                  setActiveAction(null);
                }
              })();
            }}
          >
            派生草稿
          </Button>
        ) : null}
        {canSaveAsRecipe ? (
          <Button
            disabled={isBusy}
            loading={activeAction === "save-recipe"}
            onClick={() => {
              setActionError(null);
              setRecipeError(null);
              setRecipeValidation(null);
              setRecipeOpen(true);
            }}
          >
            保存为 Recipe
          </Button>
        ) : null}
        {canInvalidate ? (
          <Button
            danger
            disabled={isBusy}
            onClick={() => {
              setActionError(null);
              setInvalidateValidation(null);
              setInvalidateOpen(true);
            }}
          >
            作废实验
          </Button>
        ) : null}
      </Space>

      {actionError ? (
        <Alert
          title={actionError}
          showIcon
          type="error"
        />
      ) : null}

      <Modal
        cancelText="取消"
        okText="确认作废"
        okType="danger"
        onCancel={() => {
          if (activeAction === "invalidate") {
            return;
          }
          setInvalidateOpen(false);
          setInvalidateReason("");
          setInvalidateValidation(null);
        }}
        onOk={() => {
          const normalizedReason = invalidateReason.trim();
          if (!normalizedReason) {
            setInvalidateValidation("请填写作废原因");
            return;
          }

          void runTransition(
            "invalidate",
            async () => {
              const nextExperiment = await invalidateExperiment(accessToken, experiment.id, {
                reason: normalizedReason,
              });
              setInvalidateOpen(false);
              setInvalidateReason("");
              setInvalidateValidation(null);
              return nextExperiment;
            },
            "作废实验失败",
          );
        }}
        open={invalidateOpen}
        confirmLoading={activeAction === "invalidate"}
        title="作废实验"
      >
        <div className="content-stack">
          <TextArea
            aria-label="作废原因"
            autoSize={{ minRows: 3, maxRows: 5 }}
            disabled={activeAction === "invalidate"}
            onChange={(event) => {
              setInvalidateReason(event.target.value);
              if (invalidateValidation) {
                setInvalidateValidation(null);
              }
            }}
            placeholder="说明污染、设备异常或其他作废原因"
            value={invalidateReason}
          />
          {invalidateValidation ? (
            <Alert
              title={invalidateValidation}
              showIcon
              type="error"
            />
          ) : null}
        </div>
      </Modal>

      {recipeOpen ? (
        <Modal
          cancelText="取消"
          okText="保存"
          onCancel={() => {
            if (activeAction === "save-recipe") {
              return;
            }
            closeRecipeModal();
          }}
          onOk={() => {
            void submitRecipe();
          }}
          open
          confirmLoading={activeAction === "save-recipe"}
          title="保存为 Recipe"
        >
          <div className="content-stack">
            <Input
              aria-label="Recipe 名称"
              disabled={activeAction === "save-recipe"}
              onChange={(event) => {
                setRecipeName(event.target.value);
                if (recipeValidation) {
                  setRecipeValidation(null);
                }
              }}
              placeholder="例如 MoS2 标准生长流程"
              value={recipeName}
            />
            <TextArea
              aria-label="Recipe 描述"
              autoSize={{ minRows: 3, maxRows: 5 }}
              disabled={activeAction === "save-recipe"}
              onChange={(event) => {
                setRecipeDescription(event.target.value);
              }}
              placeholder="可选：说明适用材料、窗口参数或注意事项"
              value={recipeDescription}
            />
            {recipeValidation ? <Alert title={recipeValidation} showIcon type="error" /> : null}
            {recipeError ? <Alert title={recipeError} showIcon type="error" /> : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
