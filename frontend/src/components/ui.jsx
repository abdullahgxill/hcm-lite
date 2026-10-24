import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Inbox,
  LoaderCircle,
  X,
  ArrowUpRight,
} from "lucide-react";
import { errorMessage } from "../services/api";
export function Button({ children, variant = "", loading = false, ...props }) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`button ${variant} ${props.className || ""}`}
    >
      {loading && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Field({ label, as = "input", options = [], ...props }) {
  const Component = as;
  return (
    <label className="field">
      <span>
        {label}
        {props.required && <small> *</small>}
      </span>
      {as === "select" ? (
        <select {...props}>
          {options.map((o) => (
            <option
              key={typeof o === "string" ? o : o.value}
              value={typeof o === "string" ? o : o.value}
            >
              {typeof o === "string" ? o : o.label}
            </option>
          ))}
        </select>
      ) : (
        <Component {...props} />
      )}
    </label>
  );
}
export function PasswordField({ type: ignoredType, ...props }) {
  const [visible, setVisible] = useState(false);
  return <div className="password-control">
    <Field {...props} type={visible ? "text" : "password"} />
    <button type="button" className="password-toggle" aria-label={`${visible ? "Hide" : "Show"} ${props.label}`} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? "Hide" : "Show"}</button>
  </div>;
}
export function LoginCredentials({ email, password }) {
  const [message, setMessage] = useState("");
  async function copy(value, label) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied.`);
    } catch {
      setMessage("Select the field and press Ctrl+C to copy.");
    }
  }
  return <section className="login-credentials" aria-label="Login credentials">
    <Field label="Login email" value={email.trim().toLowerCase()} readOnly onFocus={(e) => e.target.select()} />
    <Button type="button" variant="secondary" onClick={() => copy(email.trim().toLowerCase(), "Email")}>Copy email</Button>
    <Field label="Temporary password" value={password} readOnly autoComplete="off" onFocus={(e) => e.target.select()} />
    <Button type="button" variant="secondary" onClick={() => copy(password, "Password")}>Copy password</Button>
    <p className="help">Use this exact email and temporary password on the sign-in screen. The user must choose a new password after signing in.</p>
    {message && <p role="status">{message}</p>}
  </section>;
}
export const Badge = ({ children }) => (
  <span
    className={`badge ${String(children).toLowerCase().replaceAll(" ", "_")}`}
  >
    {String(children).replaceAll("_", " ")}
  </span>
);
export const Notice = ({ children, type = "error" }) =>
  children && (
    <div
      role={type === "error" ? "alert" : "status"}
      className={`notice ${type}`}
    >
      {type === "error" ? <AlertCircle size={17} /> : <Check size={17} />}
      <span>{children}</span>
    </div>
  );
export function State({ resource, children }) {
  if (resource.loading)
    return (
      <div className="state">
        <LoaderCircle className="spin" />
        Loading your workspace…
      </div>
    );
  if (resource.error)
    return (
      <div className="state">
        <Notice>{resource.error}</Notice>
        <Button variant="secondary" onClick={resource.reload}>
          Try again
        </Button>
      </div>
    );
  return children;
}
export function Empty({
  title = "Nothing here yet",
  description = "New records will appear here as your team uses HCM Lite.",
  action,
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={25} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function PageHeader({ eyebrow, title, description, children }) {
  return (
    <header className="page-header">
      <div>
        <div className="eyebrow">{eyebrow || "PEOPLE OPERATIONS"}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="header-actions">{children}</div>
    </header>
  );
}
export function Panel({ title, subtitle, children, action, className = "" }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Table({
  columns,
  rows,
  rowKey = "_id",
  empty = "No records to show",
  onRow,
}) {
  return !rows?.length ? (
    <Empty title={empty} />
  ) : (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r[rowKey] || i}
              onClick={onRow ? () => onRow(r) : undefined}
              className={onRow ? "clickable" : ""}
            >
              {columns.map((c) => (
                <td key={c.key}>
                  {c.render ? c.render(r) : (r[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const old = document.activeElement;
    const initial = ref.current?.querySelector(
      'input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),select:not([disabled])',
    );
    if (initial) initial.focus();
    else ref.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key === "Tab") {
        const nodes = ref.current.querySelectorAll(
          'button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (old?.isConnected) old.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop">
      <section
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        tabIndex={-1}
      >
        <div className="panel-head">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function useAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  async function run(fn, message) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const value = await fn();
      if (message) setSuccess(message);
      return value;
    } catch (e) {
      setError(errorMessage(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  const reset = () => {
    setError("");
    setSuccess("");
  };
  return { busy, error, success, run, setError, reset };
}
export function ActionNotices({ action }) {
  return (
    <>
      <Notice>{action.error}</Notice>
      <Notice type="success">{action.success}</Notice>
    </>
  );
}
