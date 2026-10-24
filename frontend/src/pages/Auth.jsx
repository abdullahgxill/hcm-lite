import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, Layers3 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useResource } from "../hooks/useResource";
import { api } from "../services/api";
import {
  Button,
  Field,
  PasswordField,
  State,
  Notice,
  useAction,
  ActionNotices,
} from "../components/ui";
export function AuthPage() {
  const setup = useResource("/auth/setup"),
    auth = useAuth(),
    action = useAction();
  const [form, setForm] = useState({
    companyName: "",
    name: "",
    email: "",
    password: "",
  });
  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const data = await action.run(
      async () =>
        (
          await api.post(
            setup.data?.required ? "/auth/setup" : "/auth/login",
            setup.data?.required
              ? form
              : { email: form.email, password: form.password },
          )
        ).data,
    );
    if (data) auth.save(data);
  };
  return (
    <main className="auth-shell">
      <aside className="auth-brand">
        <a className="brand" href="/">
          {" "}
          <span className="brand-mark">
            <Layers3 size={24} />
          </span>
          hcm<span className="brand-lite">lite</span>
        </a>
        <div className="auth-story">
          <div className="eyebrow">PEOPLE. PURPOSE. PROGRESS.</div>
          <h1>
            Great work starts
            <br />
            with your people.
          </h1>
          <p>
            A considered workspace for the everyday work of HR. Bring your team,
            time and payroll together.
          </p>
          <div className="brand-diagram">
            <div className="diagram-line" />
            <div>
              <span>01</span>
              <strong>Your people</strong>
              <small>One connected directory</small>
            </div>
            <div>
              <span>02</span>
              <strong>The everyday</strong>
              <small>Attendance & leave, in sync</small>
            </div>
            <div>
              <span>03</span>
              <strong>A clearer picture</strong>
              <small>Insights grounded in your data</small>
            </div>
          </div>
        </div>
        <footer>
          <ShieldCheck size={16} /> Secure access. Thoughtful operations.
        </footer>
      </aside>
      <section className="auth-form">
        <div className="auth-mobile-brand">
          hcm <strong>lite</strong>
        </div>
        <State resource={setup}>
          <div className="auth-form-inner">
            <div className="eyebrow">
              {setup.data?.required ? "YOUR FIRST STEP" : "WELCOME BACK"}
            </div>
            <h2>
              {setup.data?.required
                ? "Build your workspace."
                : "Good to see you again."}
            </h2>
            <p>
              {setup.data?.required
                ? "Create your company and its first Admin account. Your workspace starts empty."
                : "Admin, HR and employees sign in here with their own work email and password. Ask your administrator or HR for your account; employee accounts are created by HR."}
            </p>
            <form onSubmit={submit}>
              {setup.data?.required && (
                <>
                  <Field
                    label="Company name"
                    value={form.companyName}
                    onChange={update("companyName")}
                    required
                    autoComplete="organization"
                  />
                  <Field
                    label="Admin full name"
                    value={form.name}
                    onChange={update("name")}
                    required
                    autoComplete="name"
                  />
                </>
              )}
              <Field
                label="Work email"
                type="email"
                value={form.email}
                onChange={update("email")}
                required
                autoComplete="username"
              />
              <PasswordField
                label="Password"
                type="password"
                value={form.password}
                onChange={update("password")}
                required
                minLength={setup.data?.required ? 10 : 1}
                maxLength={128}
                autoComplete={
                  setup.data?.required ? "new-password" : "current-password"
                }
              />
              {setup.data?.required && (
                <p className="help">
                  At least 10 characters with uppercase, lowercase and a number.
                </p>
              )}
              <ActionNotices action={action} />
              <Button loading={action.busy} type="submit">
                {setup.data?.required ? "Create workspace" : "Sign in"}
                <ArrowRight size={17} />
              </Button>
            </form>
            <p className="auth-footnote">
              HCM Lite · Access is managed by your company administrator.
            </p>
          </div>
        </State>
      </section>
    </main>
  );
}
export function PasswordPage() {
  const auth = useAuth(),
    action = useAction();
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [saved, setSaved] = useState(false);
  const temporary = auth.user.mustChangePassword;
  if (saved)
    return (
      <div className="password-page">
        <h1>Password updated</h1>
        <Notice type="success">
          Your new password is saved. Use it the next time you sign in.
        </Notice>
        <Link className="button" to="/">
          Return to workspace
        </Link>
      </div>
    );
  return (
    <div className="password-page">
      <h1>{temporary ? "Set your own password" : "Change your password"}</h1>
      <p>
        {temporary
          ? "You are signed in. Replace the temporary password provided by HR or Admin to continue."
          : "You are already signed in. Update your password here; there is no need to sign in again."}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (form.newPassword !== form.confirmPassword) {
            action.setError("The new passwords do not match.");
            return;
          }
          const data = await action.run(
            async () =>
              (
                await api.post("/auth/password", {
                  currentPassword: form.currentPassword,
                  newPassword: form.newPassword,
                })
              ).data,
          );
          if (data) {
            auth.save(data);
            setForm({
              currentPassword: "",
              newPassword: "",
              confirmPassword: "",
            });
            setSaved(true);
          }
        }}
      >
        <Field
          label="Signed-in email"
          type="email"
          value={auth.user.email}
          readOnly
          autoComplete="username"
        />
        <PasswordField
          label={
            temporary
              ? "Temporary password from HR / Admin"
              : "Current password (the one you sign in with)"
          }
          type="password"
          required
          value={form.currentPassword}
          onChange={(e) =>
            setForm({ ...form, currentPassword: e.target.value })
          }
          autoComplete="current-password"
        />
        <PasswordField
          label="New password"
          type="password"
          required
          minLength={10}
          maxLength={128}
          value={form.newPassword}
          onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
          autoComplete="new-password"
        />
        <PasswordField
          label="Confirm new password"
          type="password"
          required
          minLength={10}
          maxLength={128}
          value={form.confirmPassword}
          onChange={(e) =>
            setForm({ ...form, confirmPassword: e.target.value })
          }
          autoComplete="new-password"
        />
        <p className="help">
          Use at least 10 characters, including uppercase, lowercase and a
          number. Other active sessions will end after this change.
        </p>
        <ActionNotices action={action} />
        <Button loading={action.busy}>Save new password</Button>
      </form>
    </div>
  );
}
