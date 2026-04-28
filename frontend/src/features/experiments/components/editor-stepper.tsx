import type { EditorSectionKey } from "../editor-types";

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
};

const stepperDotClass: Record<StepperItemStatus, string> = {
  empty: "editor-stepper-dot empty",
  editing: "editor-stepper-dot editing",
  saved: "editor-stepper-dot saved",
  warning: "editor-stepper-dot warning",
  error: "editor-stepper-dot error",
  current: "editor-stepper-dot current",
};

function StepperIcon({ status }: { status: StepperItemStatus }) {
  if (status === "saved") {
    return (
      <svg fill="none" height="10" viewBox="0 0 12 10" width="12">
        <path d="M1 5.5L4 8.5L11 1.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }
  if (status === "error") {
    return (
      <svg fill="none" height="10" viewBox="0 0 10 10" width="10">
        <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }
  if (status === "warning") {
    return (
      <svg fill="none" height="10" viewBox="0 0 4 10" width="4">
        <path d="M2 0V6M2 8.5V9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }
  if (status === "current") {
    return (
      <svg fill="none" height="6" viewBox="0 0 6 6" width="6">
        <circle cx="3" cy="3" fill="currentColor" r="3" />
      </svg>
    );
  }
  if (status === "editing") {
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
                <div className={stepperDotClass[item.status]}>
                  <StepperIcon status={item.status} />
                </div>
                {!isLast ? (
                  <div
                    className={`editor-stepper-line ${item.status === "saved" || item.status === "current" ? "active" : ""}`}
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
              className={`editor-stepper-mobile-item ${isCurrent ? "current" : ""} ${item.status === "error" ? "error" : ""}`}
              key={item.key}
              onClick={() => {
                onChange(item.key);
              }}
              type="button"
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
