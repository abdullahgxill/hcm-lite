import { useState } from "react";
import { Download, LockKeyhole, Plus, Eye } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useResource } from "../hooks/useResource";
import { api, download } from "../services/api";
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
import { today, money, number, timestamp } from "../utils/format";
export default function Payroll() {
  const { user } = useAuth(),
    resource = useResource("/payroll"),
    [month, setMonth] = useState(today().slice(0, 7)),
    [review, setReview] = useState(null),
    [finalize, setFinalize] = useState(false),
    action = useAction();
  return (
    <>
      <PageHeader
        title={
          user.role === "EMPLOYEE"
            ? "The value of your work."
            : "Payroll, with confidence."
        }
        description={
          user.role === "EMPLOYEE"
            ? "Your finalized monthly payslips, ready to download."
            : "Review every calculation before locking the month."
        }
      />
      <ActionNotices action={action} />
      {user.role === "HR" && (
        <Panel
          title="Prepare a monthly draft"
          subtitle="Re-running replaces an unlocked draft. Finalized months cannot change."
        >
          <div className="inline-form">
            <Field
              label="Payroll month"
              type="month"
              required
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
            <Button
              loading={action.busy}
              onClick={async () => {
                const r = await action.run(
                  async () => (await api.post("/payroll", { month })).data,
                  "Payroll draft calculated.",
                );
                if (r) {
                  resource.reload();
                  setReview(r);
                }
              }}
            >
              <Plus size={17} />
              Calculate draft
            </Button>
          </div>
          <p className="help">
            A full-month draft treats unrecorded eligible working days as
            absent, including future days. Review timing carefully before
            finalizing. Tax uses the challenge’s illustrative slabs.
          </p>
        </Panel>
      )}
      <Panel
        title={
          user.role === "EMPLOYEE" ? "My payslips" : "Monthly payroll runs"
        }
      >
        <State resource={resource}>
          <Table
            columns={[
              { key: "month", label: "Month" },
              {
                key: "status",
                label: "Status",
                render: (p) => <Badge>{p.status}</Badge>,
              },
              {
                key: "people",
                label: "Employees",
                render: (p) => p.lines.length,
              },
              {
                key: "gross",
                label: "Gross",
                render: (p) =>
                  money(p.lines.reduce((n, l) => n + l.proratedGrossCents, 0)),
              },
              {
                key: "net",
                label: "Net pay",
                render: (p) =>
                  money(p.lines.reduce((n, l) => n + l.netCents, 0)),
              },
              {
                key: "finalizedAt",
                label: "Finalized",
                render: (p) => timestamp(p.finalizedAt),
              },
              {
                key: "action",
                label: "Review",
                render: (p) => (
                  <Button variant="secondary" onClick={() => setReview(p)}>
                    <Eye size={15} />
                    Details
                  </Button>
                ),
              },
            ]}
            rows={resource.data}
            empty="No payroll runs yet"
          />
        </State>
      </Panel>
      {review && (
        <Modal
          title={`Payroll review · ${review.month}`}
          onClose={() => {
            setReview(null);
            setFinalize(false);
          }}
          wide
        >
          <div className="review-banner">
            <Badge>{review.status}</Badge>
            <span>
              Revision {review.revision} · {review.lines.length} employees
            </span>
            {review.status === "finalized" && (
              <span>
                <LockKeyhole size={14} /> Locked
              </span>
            )}
          </div>
          <Table
            columns={[
              { key: "name", label: "Employee" },
              { key: "workingDays", label: "Work days" },
              { key: "eligibleDays", label: "Eligible" },
              {
                key: "gross",
                label: "Prorated gross",
                render: (l) => money(l.proratedGrossCents),
              },
              {
                key: "absence",
                label: "Absent / unpaid / half",
                render: (l) => `${l.absent} / ${l.unpaid} / ${l.halfDays}`,
              },
              {
                key: "deductionCents",
                label: "Deduction",
                render: (l) => money(l.deductionCents),
              },
              {
                key: "taxCents",
                label: "Tax",
                render: (l) => money(l.taxCents),
              },
              {
                key: "netCents",
                label: "Net pay",
                render: (l) => money(l.netCents),
              },
              {
                key: "pdf",
                label: "Payslip",
                render: (l) =>
                  review.status === "finalized" ? (
                    <button
                      className="icon-button"
                      aria-label={`Download payslip for ${l.name}`}
                      onClick={() =>
                        action.run(() =>
                          download(
                            `/payroll/${review._id}/payslip/${l.employeeId}`,
                            `payslip-${l.code}-${review.month}.pdf`,
                          ),
                        )
                      }
                    >
                      <Download size={17} />
                    </button>
                  ) : (
                    "After finalization"
                  ),
              },
            ]}
            rows={review.lines}
            rowKey="employeeId"
          />
          {user.role === "ADMIN" &&
            review.status === "draft" &&
            (finalize ? (
              <div className="finalize-confirm">
                <Notice type="success">
                  Finalization permanently locks this run and the month’s
                  attendance and leave. Payslip notifications will be sent.
                </Notice>
                <div className="form-actions">
                  <Button
                    variant="secondary"
                    onClick={() => setFinalize(false)}
                  >
                    Go back
                  </Button>
                  <Button
                    loading={action.busy}
                    onClick={async () => {
                      const r = await action.run(
                        async () =>
                          (
                            await api.post(`/payroll/${review._id}/finalize`, {
                              revision: review.revision,
                            })
                          ).data,
                        "Payroll finalized and locked.",
                      );
                      if (r) {
                        setReview(r);
                        setFinalize(false);
                        resource.reload();
                      }
                    }}
                  >
                    <LockKeyhole size={16} />
                    Confirm & lock payroll
                  </Button>
                </div>
              </div>
            ) : (
              <div className="form-actions">
                <Button onClick={() => setFinalize(true)}>
                  <LockKeyhole size={16} />
                  Finalize this month
                </Button>
              </div>
            ))}
          <ActionNotices action={action} />
        </Modal>
      )}
    </>
  );
}
