import type { EditorSectionKey } from "../editor-types";
import type { ModuleCompletionStatus } from "./completion-indicator";

export type StepperItemStatus =
  | "empty"
  | "editing"
  | "saved"
  | "warning"
  | "error"
  | "current";

export type StepperItem = {
  key: EditorSectionKey;
  label: string;
  status: StepperItemStatus;
  completion?: ModuleCompletionStatus;
};

const stepperDotClass: Record<StepperItemStatus, string> = {
  empty: "editor-stepper-dot empty",
  editing: "editor-stepper-dot editing",
  saved: "editor-stepper-dot saved",
  warning: "editor-stepper-dot warning",
  error: "editor-stepper-dot error",
  current: "editor-stepper-dot current",
};

function resolveCompletionDotClass(
  completion: ModuleCompletionStatus | undefined,
  status: StepperItemStatus,
) {
  if (!completion) {
    return stepperDotClass[status];
  }

  if (completion.state === "error") {
    return "editor-stepper-dot error";
  }
  if (completion.state === "warning") {
    return "editor-stepper-dot warning";
  }
  if (completion.state === "complete") {
    return "editor-stepper-dot complete";
  }
  if (completion.state === "partial") {
    return `editor-stepper-dot partial ${completion.percent < 50 ? "low" : "high"}`;
  }

  return "editor-stepper-dot empty";
}

function resolveCompletionLabel(label: string, completion: ModuleCompletionStatus | undefined) {
  if (!completion) {
    return undefined;
  }

  if (completion.state === "error") {
    return `${label}：阻塞 ${completion.errors} 项，完成度 ${completion.percent}%`;
  }
  if (completion.state === "warning") {
    return `${label}：提示 ${completion.warnings} 项，完成度 ${completion.percent}%`;
  }

  return `${label}：完成度 ${completion.percent}%`;
}

function resolveMobileItemClass(
  completion: ModuleCompletionStatus | undefined,
  status: StepperItemStatus,
  isCurrent: boolean,
) {
  return [
    "editor-stepper-mobile-item",
    isCurrent ? "current" : "",
    completion?.state === "error" || status === "error" ? "error" : "",
    completion?.state === "warning" ? "warning" : "",
    completion?.state === "complete" ? "complete" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function StepperIcon({
  completion,
  status,
}: {
  completion: ModuleCompletionStatus | undefined;
  status: StepperItemStatus;
}) {
  const iconState = completion?.state ?? status;
  if (iconState === "complete" || iconState === "saved") {
    return (
      <svg fill="none" height="10" viewBox="0 0 12 10" width="12">
        <path
          d="M1 5.5L4 8.5L11 1.5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    );
  }
  if (iconState === "error") {
    return (
      <svg fill="none" height="10" viewBox="0 0 10 10" width="10">
        <path
          d="M1 1L9 9M9 1L1 9"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    );
  }
  if (iconState === "warning") {
    return (
      <svg fill="none" height="10" viewBox="0 0 4 10" width="4">
        <path
          d="M2 0V6M2 8.5V9"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    );
  }
  if (iconState === "current") {
    return (
      <svg fill="none" height="6" viewBox="0 0 6 6" width="6">
        <circle cx="3" cy="3" fill="currentColor" r="3" />
      </svg>
    );
  }
  if (iconState === "editing") {
    return (
      <svg fill="none" height="6" viewBox="0 0 6 6" width="6">
        <circle cx="3" cy="3" fill="currentColor" r="3" />
      </svg>
    );
  }
  return null;
}

export function EditorStepper({
  items,
  currentKey,
  onChange,
}: {
  items: StepperItem[];
  currentKey: string;
  onChange: (key: EditorSectionKey) => void;
}) {
  return (
    <>
      {/* Desktop vertical stepper */}
      <div className="editor-stepper">
        {items.map((item, index) => {
          const isCurrent = item.key === currentKey;
          const isLast = index === items.length - 1;
          const completionLabel = resolveCompletionLabel(item.label, item.completion);
          return (
            <div
              className={`editor-stepper-item ${isCurrent ? "current" : ""}`}
              key={item.key}
              onClick={() => {
                onChange(item.key);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  onChange(item.key);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="editor-stepper-track">
                <div
                  aria-label={completionLabel}
                  className={resolveCompletionDotClass(item.completion, item.status)}
                >
                  <StepperIcon completion={item.completion} status={item.status} />
                </div>
                {!isLast ? (
                  <div
                    className={`editor-stepper-line ${
                      item.completion?.percent === 100 ||
                      item.status === "saved" ||
                      item.status === "current"
                        ? "active"
                        : ""
                    }`}
                  />
                ) : null}
              </div>
              <div className="editor-stepper-label">{item.label}</div>
            </div>
          );
        })}
      </div>

      {/* Mobile horizontal stepper */}
      <div className="editor-stepper-mobile">
        {items.map((item) => {
          const isCurrent = item.key === currentKey;
          return (
            <button
              className={resolveMobileItemClass(item.completion, item.status, isCurrent)}
              key={item.key}
              onClick={() => {
                onChange(item.key);
              }}
              type="button"
            >
              <span
                aria-hidden="true"
                className={resolveCompletionDotClass(item.completion, item.status)}
              >
                <StepperIcon completion={item.completion} status={item.status} />
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
