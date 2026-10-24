import { useState } from "react";
import { Clock3, Plus, CalendarDays, List } from "lucide-react";
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
  useAction,
  ActionNotices,
} from "../components/ui";
import { today, time, number } from "../utils/format";
function CorrectionForm({ onClose, onSaved }) {
  const [form, setForm] = useState({
      date: today(),
      checkIn: "",
      checkOut: "",
      reason: "",
    }),
    action = useAction();
  return (
    <Modal title="Request an attendance correction" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await action.run(() =>
            api.post("/attendance/corrections", {
              ...form,
              checkIn: new Date(
                `${form.date}T${form.checkIn}:00+05:00`,
              ).toISOString(),
              checkOut: new Date(
                `${form.date}T${form.checkOut}:00+05:00`,
              ).toISOString(),
            }),
          );
          if (r) {
            onSaved();
            onClose();
          }
        }}
      >
        <Field
          label="Attendance date"
          type="date"
          max={today()}
          required
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />
        <div className="form-grid">
          <Field
            label="Correct check-in (Pakistan time)"
            type="time"
            required
            value={form.checkIn}
            onChange={(e) => setForm({ ...form, checkIn: e.target.value })}
          />
          <Field
            label="Correct check-out (Pakistan time)"
            type="time"
            required
            value={form.checkOut}
            onChange={(e) => setForm({ ...form, checkOut: e.target.value })}
          />
        </div>
        <Field
          label="Reason for correction"
          as="textarea"
          required
          minLength={3}
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
        />
        <ActionNotices action={action} />
        <Button loading={action.busy}>Send for HR review</Button>
      </form>
    </Modal>
  );
}
export default function Attendance() {
  const { user } = useAuth(),
    now = today(),
    [filters, setFilters] = useState({
      start: `${now.slice(0, 7)}-01`,
      end: now,
      department: "",
    }),
    [calendar, setCalendar] = useState(user.role === "EMPLOYEE"),
    [correction, setCorrection] = useState(false),
    [decision, setDecision] = useState(null),
    [comment, setComment] = useState(""),
    action = useAction();
  const resource = useResource(
      `/attendance?${new URLSearchParams(Object.entries(filters).filter(([, v]) => v))}`,
    ),
    corrections = useResource("/attendance/corrections"),
    company = useResource(user.role === "EMPLOYEE" ? null : "/organization");
  const me = resource.data?.find(
    (a) => String(a.employeeId) === String(user.employeeId) && a.date === now,
  );
  async function mark(kind) {
    const r = await action.run(
      () => api.post(`/attendance/${kind}`),
      "Attendance recorded.",
    );
    if (r) resource.reload();
  }
  return (
    <>
      <PageHeader
        title="Time, accounted for."
        description="Daily attendance, clear records and thoughtful corrections."
      >
        {user.role !== "ADMIN" && (
          <Button
            loading={action.busy}
            disabled={!!me?.checkOut}
            onClick={() => mark(me?.checkIn ? "check-out" : "check-in")}
          >
            <Clock3 size={17} />
            {me?.checkIn ? "Check out" : "Check in"}
          </Button>
        )}
        {user.role === "EMPLOYEE" && (
          <Button variant="secondary" onClick={() => setCorrection(true)}>
            <Plus size={16} />
            Request correction
          </Button>
        )}
      </PageHeader>
      <ActionNotices action={action} />
      <div className="filter-bar">
        <Field
          label="From"
          type="date"
          value={filters.start}
          onChange={(e) => setFilters({ ...filters, start: e.target.value })}
        />
        <Field
          label="To"
          type="date"
          value={filters.end}
          onChange={(e) => setFilters({ ...filters, end: e.target.value })}
        />
        {user.role !== "EMPLOYEE" && (
          <Field
            label="Department"
            as="select"
            value={filters.department}
            onChange={(e) =>
              setFilters({ ...filters, department: e.target.value })
            }
            options={[
              { value: "", label: "All departments" },
              ...(company.data?.departments || []),
            ]}
          />
        )}
        <div className="segmented">
          <button
            className={!calendar ? "active" : ""}
            onClick={() => setCalendar(false)}
            aria-label="Table view"
          >
            <List size={17} />
          </button>
          <button
            className={calendar ? "active" : ""}
            onClick={() => setCalendar(true)}
            aria-label="Calendar view"
          >
            <CalendarDays size={17} />
          </button>
        </div>
      </div>
      <Panel
        title={calendar ? "Attendance calendar" : "Attendance board"}
        subtitle="Server time is authoritative. Past open records show as missing checkout."
      >
        <State resource={resource}>
          {calendar ? (
            <div className="attendance-calendar">
              {[...new Set(resource.data?.map((a) => a.date))]
                .sort()
                .map((d) => (
                  <article className="calendar-day" key={d}>
                    <time>
                      {new Date(`${d}T12:00:00Z`).toLocaleDateString("en", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </time>
                    {resource.data
                      .filter((a) => a.date === d)
                      .map((a, i) => (
                        <div key={i}>
                          {user.role !== "EMPLOYEE" && (
                            <strong>{a.name}</strong>
                          )}
                          <Badge>{a.status}</Badge>
                          <small>
                            {time(a.checkIn)} – {time(a.checkOut)}
                          </small>
                        </div>
                      ))}
                  </article>
                ))}
              {!resource.data?.length && <p>No attendance in this period.</p>}
            </div>
          ) : (
            <Table
              columns={[
                { key: "name", label: "Employee" },
                { key: "date", label: "Date" },
                { key: "checkIn", label: "In", render: (a) => time(a.checkIn) },
                {
                  key: "checkOut",
                  label: "Out",
                  render: (a) => time(a.checkOut),
                },
                {
                  key: "hours",
                  label: "Hours",
                  render: (a) => number(a.hours),
                },
                {
                  key: "status",
                  label: "Status",
                  render: (a) => <Badge>{a.status}</Badge>,
                },
              ]}
              rows={resource.data}
            />
          )}
        </State>
      </Panel>
      <Panel
        title="Attendance corrections"
        subtitle={
          user.role === "HR"
            ? "Review the reason and proposed times before deciding."
            : "Requests and their review history."
        }
      >
        <State resource={corrections}>
          <Table
            columns={[
              {
                key: "employee",
                label: "Employee",
                render: (r) => r.employeeId?.name,
              },
              { key: "date", label: "Date" },
              { key: "reason", label: "Reason" },
              {
                key: "requested",
                label: "Requested times",
                render: (r) => `${time(r.checkIn)} – ${time(r.checkOut)}`,
              },
              {
                key: "status",
                label: "Status",
                render: (r) => <Badge>{r.status}</Badge>,
              },
              { key: "comment", label: "Review comment" },
              {
                key: "action",
                label: "Review",
                render: (r) =>
                  user.role === "HR" && r.status === "pending" ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setDecision(r);
                        setComment("");
                      }}
                    >
                      Review
                    </Button>
                  ) : (
                    "—"
                  ),
              },
            ]}
            rows={corrections.data}
          />
        </State>
      </Panel>
      {correction && (
        <CorrectionForm
          onClose={() => setCorrection(false)}
          onSaved={corrections.reload}
        />
      )}{" "}
      {decision && (
        <Modal
          title="Review attendance correction"
          onClose={() => setDecision(null)}
        >
          <p>
            {decision.employeeId?.name} · {decision.date}
          </p>
          <p>{decision.reason}</p>
          <Field
            label="Decision comment"
            as="textarea"
            required
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="form-actions">
            {[false, true].map((approved) => (
              <Button
                key={String(approved)}
                variant={approved ? "" : "secondary"}
                loading={action.busy}
                disabled={comment.trim().length < 2}
                onClick={async () => {
                  const r = await action.run(
                    () =>
                      api.post(
                        `/attendance/corrections/${decision._id}/decision`,
                        { approved, comment },
                      ),
                    "Correction decision saved.",
                  );
                  if (r) {
                    setDecision(null);
                    corrections.reload();
                    resource.reload();
                  }
                }}
              >
                {approved ? "Approve" : "Reject"}
              </Button>
            ))}
          </div>
          <ActionNotices action={action} />
        </Modal>
      )}
    </>
  );
}
