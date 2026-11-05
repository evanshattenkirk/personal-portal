"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
export function Icon({
  name = "compass",
  size = 20,
}: {
  name?: string;
  size?: number;
}) {
  const paths: Record<string, ReactNode> = {
    compass: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m16 8-3 5-5 3 3-5z" />
      </>
    ),
    plane: <path d="m22 2-7 20-4-9-9-4 20-7ZM11 13l5-5" />,
    home: (
      <>
        <path d="m3 10 9-7 9 7v11H3Z" />
        <path d="M9 21v-8h6v8" />
      </>
    ),
    wallet: (
      <>
        <rect x="3" y="5" width="18" height="15" rx="3" />
        <path d="M3 8V5l14-3v3M16 12h5v5h-5Z" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    link: (
      <>
        <path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1" />
      </>
    ),
    star: <path d="m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />,
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 2v6m10-6v6M3 11h18" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.compass}
    </svg>
  );
}
export type Field = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  hint?: string;
  min?: number;
  max?: number;
  step?: string;
  readOnly?: boolean;
};
export function RecordForm({
  title,
  fields,
  initial,
  onSave,
  onClose,
}: {
  title: string;
  fields: Field[];
  initial: Record<string, unknown>;
  onSave: (r: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [record, setRecord] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave(record);
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close form"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="form-grid">
          {fields.map((f) => (
            <label
              className={`field ${f.type === "textarea" ? "wide" : ""}`}
              key={f.key}
            >
              <span>
                {f.label}
                {f.required ? " *" : ""}
              </span>
              {f.options ? (
                <select
                  value={String(record[f.key] ?? "")}
                  required={f.required}
                  onChange={(e) =>
                    setRecord({ ...record, [f.key]: e.target.value || null })
                  }
                >
                  {!f.required && <option value="">None</option>}
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  rows={4}
                  value={String(record[f.key] ?? "")}
                  onChange={(e) =>
                    setRecord({ ...record, [f.key]: e.target.value || null })
                  }
                />
              ) : f.type === "checkbox" ? (
                <input
                  type="checkbox"
                  checked={Boolean(record[f.key])}
                  onChange={(e) =>
                    setRecord({ ...record, [f.key]: e.target.checked })
                  }
                />
              ) : (
                <input
                  type={f.type ?? "text"}
                  required={f.required}
                  readOnly={f.readOnly}
                  min={f.min ?? (f.type === "number" ? 0 : undefined)}
                  max={f.max}
                  step={f.step ?? (f.type === "number" ? "any" : undefined)}
                  value={String(record[f.key] ?? "")}
                  onChange={(e) =>
                    setRecord({
                      ...record,
                      [f.key]:
                        e.target.value === ""
                          ? null
                          : f.type === "number"
                            ? Number(e.target.value)
                            : e.target.value,
                    })
                  }
                />
              )}{" "}
              {f.hint && <small>{f.hint}</small>}
            </label>
          ))}
        </div>
        {error && (
          <p role="alert" className="notice danger">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
export function Action({
  children,
  onClick,
  className = "button secondary",
  title,
}: {
  children: ReactNode;
  onClick: () => Promise<void>;
  className?: string;
  title?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <button
        title={title}
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await onClick();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Saving…" : children}
      </button>
      {error && (
        <span className="error-inline" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon size={32} />
      <h3>{title}</h3>
      <div className="muted">{children}</div>
    </div>
  );
}
export function SectionTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}
export const opts = (values: string[]) =>
  values.map((value) => ({ value, label: value.replaceAll("_", " ") }));
