import { useState } from "react";
import { Plus, Check, ArrowLeft, ArrowRight } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useResource } from "../hooks/useResource";
import { api } from "../services/api";
import {
  PageHeader,
  Panel,
  Table,
  State,
  Empty,
  Button,
  Field,
  PasswordField,
  LoginCredentials,
  Badge,
  Modal,
  useAction,
  ActionNotices,
} from "../components/ui";
import { timestamp } from "../utils/format";
export function Announcements() {
  const { user } = useAuth(),
    resource = useResource("/announcements"),
    [open, setOpen] = useState(false),
    [form, setForm] = useState({ title: "", body: "" }),
    action = useAction();
  return (
    <>
      <PageHeader
        title="Keep everyone in the loop."
        description="The shared noticeboard for your organization."
      >
        {user.role !== "EMPLOYEE" && (
          <Button onClick={() => setOpen(true)}>
            <Plus size={17} />
            Post announcement
          </Button>
        )}
      </PageHeader>
      <State resource={resource}>
        {resource.data?.length ? (
          <div className="announcement-grid">
            {resource.data.map((a) => (
              <Panel
                key={a._id}
                title={a.title}
                subtitle={`${a.actor?.name || "Team"} · ${timestamp(a.createdAt)}`}
              >
                <p className="announcement-body">{a.body}</p>
              </Panel>
            ))}
          </div>
        ) : (
          <Empty
            title="A quiet noticeboard"
            description="Announcements from Admin and HR will appear here."
          />
        )}
      </State>
      {open && (
        <Modal title="Post an announcement" onClose={() => setOpen(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await action.run(() =>
                api.post("/announcements", form),
              );
              if (r) {
                setOpen(false);
                setForm({ title: "", body: "" });
                resource.reload();
              }
            }}
          >
            <Field
              label="Title"
              required
              minLength={2}
              maxLength={150}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <Field
              label="Announcement"
              as="textarea"
              rows={6}
              required
              minLength={3}
              maxLength={4000}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
            <ActionNotices action={action} />
            <Button loading={action.busy}>Publish to noticeboard</Button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Notifications() {
  const resource = useResource("/notifications"),
    action = useAction();
  return (
    <>
      <PageHeader
        title="Your updates."
        description="Leave decisions, payslips and the details that need your attention."
      />
      <ActionNotices action={action} />
      <Panel title="Inbox">
        <State resource={resource}>
          {resource.data?.length ? (
            resource.data.map((n) => (
              <article
                className={`notification ${n.read ? "read" : ""}`}
                key={n._id}
              >
                <span className="status-dot" />
                <div>
                  <h3>{n.title}</h3>
                  <p>{n.body}</p>
                  <small>{timestamp(n.createdAt)}</small>
                </div>
                {!n.read && (
                  <Button
                    variant="text"
                    aria-label={`Mark ${n.title} as read`}
                    onClick={async () => {
                      const r = await action.run(() =>
                        api.post(`/notifications/${n._id}/read`),
                      );
                      if (r) resource.reload();
                    }}
                  >
                    <Check size={17} />
                  </Button>
                )}
              </article>
            ))
          ) : (
            <Empty title="You’re all caught up" />
          )}
        </State>
      </Panel>
    </>
  );
}
export function Audit() {
  const [page, setPage] = useState(1),
    resource = useResource(`/audit?page=${page}`);
  return (
    <>
      <PageHeader
        title="Accountability, on record."
        description="An immutable history of important changes in your workspace."
      />
      <Panel
        title="Audit trail"
        subtitle="Passwords, tokens and salary fields are redacted."
      >
        <State resource={resource}>
          <Table
            columns={[
              { key: "actorName", label: "Actor" },
              {
                key: "action",
                label: "Action",
                render: (a) => <Badge>{a.action}</Badge>,
              },
              { key: "entity", label: "Entity" },
              {
                key: "createdAt",
                label: "Time",
                render: (a) => timestamp(a.createdAt),
              },
              {
                key: "changes",
                label: "Changes",
                render: (a) => (
                  <details>
                    <summary>Before / after</summary>
                    <pre>
                      {JSON.stringify(
                        { before: a.before, after: a.after },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                ),
              },
            ]}
            rows={resource.data?.items}
          />
          <div className="pagination">
            <span>
              {resource.data?.total || 0} events · Page {page}
            </span>
            <Button
              variant="secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              <ArrowLeft size={15} />
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={page * 25 >= (resource.data?.total || 0)}
              onClick={() => setPage(page + 1)}
            >
              Next
              <ArrowRight size={15} />
            </Button>
          </div>
        </State>
      </Panel>
    </>
  );
}
export function Users() {
  const resource = useResource("/organization/users"),
    [open, setOpen] = useState(false),
    [form, setForm] = useState({ name: "", email: "", temporaryPassword: "" }),
    [resetPassword, setResetPassword] = useState(""),
    [credentials, setCredentials] = useState(null),
    [confirm, setConfirm] = useState(null),
    action = useAction();
  return (
    <>
      <PageHeader
        title="The right access for every role."
        description="Create HR logins and manage employee account access."
      >
        <Button
          onClick={() => {
            action.reset();
            setForm({ name: "", email: "", temporaryPassword: "" });
            setOpen(true);
            setCredentials(null);
          }}
        >
          <Plus size={17} />
          Create HR login
        </Button>
      </PageHeader>
      <ActionNotices action={action} />
      <Panel title="Company logins">
        <State resource={resource}>
          <Table
            columns={[
              { key: "name", label: "Name" },
              { key: "email", label: "Email" },
              {
                key: "role",
                label: "Role",
                render: (u) => <Badge>{u.role}</Badge>,
              },
              {
                key: "active",
                label: "Status",
                render: (u) => (
                  <Badge>{u.active ? "active" : "inactive"}</Badge>
                ),
              },
              {
                key: "mustChangePassword",
                label: "Password",
                render: (u) =>
                  u.mustChangePassword ? "Change required" : "Set by user",
              },
              {
                key: "actions",
                label: "Access controls",
                render: (u) =>
                  u.role !== "ADMIN" && (
                    <div className="row-actions">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          action.reset();
                          setCredentials(null);
                          setConfirm({ user: u, reset: false });
                        }}
                      >
                        {u.active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="text"
                        onClick={() => {
                          action.reset();
                          setCredentials(null);
                          setResetPassword("");
                          setConfirm({ user: u, reset: true });
                        }}
                      >
                        Reset password
                      </Button>
                    </div>
                  ),
              },
            ]}
            rows={resource.data}
          />
        </State>
      </Panel>
      {open && (
        <Modal title="Create HR login" onClose={() => setOpen(false)}>
          {credentials ? (
            <>
              <p>
                HR account created. Share the email and temporary password below
                securely. HR must sign in with them, then set a new password.
              </p>
              <LoginCredentials email={form.email} password={credentials} />
              <p className="help">
                For HR self-service, HR can register an employee profile using
                this same email; their HR role is retained.
              </p>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await action.run(
                  async () =>
                    (await api.post("/organization/users", { ...form, temporaryPassword: form.temporaryPassword || undefined })).data,
                );
                if (r) {
                  setCredentials(r.temporaryPassword);
                  resource.reload();
                }
              }}
            >
              <Field
                label="HR full name"
                required
                minLength={2}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <Field
                label="Work email"
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <ActionNotices action={action} />
              <PasswordField label="Temporary password (optional)" value={form.temporaryPassword} onChange={(e) => setForm({ ...form, temporaryPassword: e.target.value })} autoComplete="new-password" />
              <p className="help">Leave blank to generate one, or use at least 10 characters with uppercase, lowercase and a number. HR must change it on first sign-in.</p>
              <Button loading={action.busy}>Create HR account</Button>
            </form>
          )}
        </Modal>
      )}
      {confirm && (
        <Modal
          title={
            confirm.reset
              ? "Reset login password?"
              : `${confirm.user.active ? "Deactivate" : "Activate"} this login?`
          }
          onClose={() => {
            setConfirm(null);
            setCredentials(null);
          }}
        >
          {credentials ? (
            <LoginCredentials email={confirm.user.email} password={credentials} />
          ) : (
            <>
              <p>
                {confirm.user.name} · {confirm.user.email}
              </p>
              <p>Existing sessions will be invalidated.</p>
              {confirm.reset && <><PasswordField label="New temporary password (optional)" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} autoComplete="new-password" /><p className="help">Leave blank to generate one. A chosen password needs at least 10 characters with uppercase, lowercase and a number.</p></>}
              <ActionNotices action={action} />
              <Button
                loading={action.busy}
                onClick={async () => {
                  const r = await action.run(
                    async () =>
                      (
                        await api.patch(
                          `/organization/users/${confirm.user.id}`,
                          confirm.reset
                            ? { reset: true, temporaryPassword: resetPassword || undefined }
                            : { active: !confirm.user.active },
                        )
                      ).data,
                    "Login updated.",
                  );
                  if (r) {
                    resource.reload();
                    if (r.temporaryPassword)
                      setCredentials(r.temporaryPassword);
                    else setConfirm(null);
                  }
                }}
              >
                Confirm {confirm.reset ? "reset" : "change"}
              </Button>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
