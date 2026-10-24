import { useState } from "react";
import { Plus, Sparkles, CalendarDays } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useResource } from "../hooks/useResource";
import { api } from "../services/api";
import {
  PageHeader,
  Panel,
  Table,
  State,
  Button,
  Field,
  Badge,
  Modal,
  Notice,
  useAction,
  ActionNotices,
} from "../components/ui";
export default function LeavePage() {
  const { user } = useAuth(),
    resource = useResource("/leaves"),
    balance = useResource(
      user.role !== "ADMIN" && user.employeeId ? "/leaves/balance" : null,
    ),
    options = useResource(user.role !== "ADMIN" ? "/leaves/options" : null),
    [apply, setApply] = useState(false),
    [smart, setSmart] = useState(""),
    [generated, setGenerated] = useState(false),
    [form, setForm] = useState({
      type: "casual",
      start: "",
      end: "",
      reason: "",
    }),
    [decision, setDecision] = useState(null),
    [cancel, setCancel] = useState(null),
    [comment, setComment] = useState(""),
    [tab, setTab] = useState("all"),
    action = useAction();
  const reload = () => {
    resource.reload();
    balance.reload();
  };
  return (
    <>
      <PageHeader
        title="Room for life outside work."
        description="Plan time off, keep balances clear and make confident approvals."
      >
        {user.role !== "ADMIN" && (
          <Button
            onClick={() => {
              setApply(true);
              setGenerated(false);
            }}
          >
            <Plus size={17} />
            Apply for leave
          </Button>
        )}
      </PageHeader>
      <ActionNotices action={action} />
      {user.role !== "ADMIN" && (
        <div className="leave-balances">
          {balance.data?.map((b) => (
            <div key={b.type}>
              <CalendarDays size={18} />
              <span>{b.type}</span>
              <strong>
                {b.remaining === null ? "∞" : b.remaining}
                <small>
                  {b.quota === null ? " unlimited" : ` / ${b.quota} days`}
                </small>
              </strong>
            </div>
          ))}
        </div>
      )}
      <Panel
        title="Leave requests"
        subtitle="Only approved working days are deducted from balances."
        action={
          <div className="tabs">
            {["all", "pending", "approved"].map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
        }
      >
        <State resource={resource}>
          <Table
            columns={[
              {
                key: "employee",
                label: "Employee",
                render: (l) => l.employeeId?.name,
              },
              {
                key: "type",
                label: "Leave type",
                render: (l) => <span className="capitalize">{l.type}</span>,
              },
              {
                key: "range",
                label: "Dates",
                render: (l) => `${l.start} → ${l.end}`,
              },
              {
                key: "days",
                label: "Working days",
                render: (l) => l.days.length,
              },
              {
                key: "status",
                label: "Status",
                render: (l) => <Badge>{l.status}</Badge>,
              },
              { key: "reason", label: "Reason" },
              { key: "comment", label: "Decision comment" },
              {
                key: "actions",
                label: "Action",
                render: (l) => (
                  <div className="row-actions">
                    {user.role === "HR" &&
                      l.status === "pending" &&
                      l.employeeId?._id !== user.employeeId && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setDecision(l);
                            setComment("");
                          }}
                        >
                          Review
                        </Button>
                      )}
                    {["pending", "approved"].includes(l.status) &&
                      l.employeeId?._id === user.employeeId && (
                        <Button variant="text" onClick={() => setCancel(l)}>
                          Cancel
                        </Button>
                      )}
                  </div>
                ),
              },
            ]}
            rows={resource.data?.filter(
              (l) => tab === "all" || l.status === tab,
            )}
            empty="No leave requests yet"
          />
        </State>
      </Panel>
      {apply && (
        <Modal title="Plan your time off" onClose={() => setApply(false)} wide>
          <div className="smart-leave">
            <div>
              <Sparkles size={18} />
              <strong>Start with your own words</strong>
            </div>
            <Field
              label="Describe your leave"
              as="textarea"
              placeholder="I need next Monday and Tuesday off for my sister’s wedding."
              value={smart}
              onChange={(e) => setSmart(e.target.value)}
              maxLength={2000}
            />
            <Button
              type="button"
              variant="secondary"
              loading={action.busy}
              disabled={!smart.trim()}
              onClick={async () => {
                const r = await action.run(
                  async () =>
                    (await api.post("/ai/smart-leave", { message: smart }))
                      .data,
                );
                if (r) {
                  setForm(r.values);
                  setGenerated(true);
                }
              }}
            >
              <Sparkles size={15} />
              Prepare form
            </Button>
          </div>
          {generated && (
            <Notice type="success">
              AI-generated draft. Review the type, dates and reason, then
              confirm below.
            </Notice>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await action.run(
                () => api.post("/leaves", form),
                "Leave request sent for approval.",
              );
              if (r) {
                setApply(false);
                reload();
              }
            }}
          >
            <div className="form-grid">
              <Field
                label="Leave type"
                as="select"
                required
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                options={
                  options.data?.leaveTypes?.map((t) => t.name) || [
                    "annual",
                    "sick",
                    "casual",
                    "unpaid",
                  ]
                }
              />
              <div />
              <Field
                label="Start date"
                type="date"
                required
                value={form.start}
                onChange={(e) => setForm({ ...form, start: e.target.value })}
              />
              <Field
                label="End date"
                type="date"
                required
                min={form.start}
                value={form.end}
                onChange={(e) => setForm({ ...form, end: e.target.value })}
              />
            </div>
            <Field
              label="Reason"
              as="textarea"
              required
              minLength={3}
              maxLength={1000}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
            <p className="help">
              Weekends and public holidays are excluded. Requests must stay
              within one calendar year and your employment dates.
            </p>
            <ActionNotices action={action} />
            <div className="form-actions">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setApply(false)}
              >
                Go back
              </Button>
              <Button loading={action.busy}>Confirm & submit request</Button>
            </div>
          </form>
        </Modal>
      )}
      {decision && (
        <Modal title="Review leave request" onClose={() => setDecision(null)}>
          <p>
            <strong>{decision.employeeId?.name}</strong> · {decision.type}
          </p>
          <p>
            {decision.start} to {decision.end} · {decision.days.length} working
            days
          </p>
          <p>{decision.reason}</p>
          <Field
            label="Decision comment"
            as="textarea"
            required
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <ActionNotices action={action} />
          <div className="form-actions">
            {[false, true].map((approved) => (
              <Button
                key={String(approved)}
                loading={action.busy}
                variant={approved ? "" : "secondary"}
                disabled={comment.trim().length < 2}
                onClick={async () => {
                  const r = await action.run(
                    () =>
                      api.post(`/leaves/${decision._id}/decision`, {
                        approved,
                        comment,
                      }),
                    "Leave decision saved.",
                  );
                  if (r) {
                    setDecision(null);
                    reload();
                  }
                }}
              >
                {approved ? "Approve leave" : "Reject leave"}
              </Button>
            ))}
          </div>
        </Modal>
      )}
      {cancel && (
        <Modal title="Cancel this leave?" onClose={() => setCancel(null)}>
          <p>
            {cancel.start} to {cancel.end}. Approved days will return to your
            balance. Finalized payroll months are locked.
          </p>
          <ActionNotices action={action} />
          <Button
            loading={action.busy}
            onClick={async () => {
              const r = await action.run(
                () => api.post(`/leaves/${cancel._id}/cancel`),
                "Leave cancelled.",
              );
              if (r) {
                setCancel(null);
                reload();
              }
            }}
          >
            Confirm cancellation
          </Button>
        </Modal>
      )}
    </>
  );
}
