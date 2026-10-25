import { useState } from "react";
import CameraAttendance from "../features/CameraAttendance";
import { useOutletContext, Link } from "react-router-dom";
import {
  Sparkles,
  ArrowRight,
  Clock3,
  ArrowDownToLine,
  Users,
  CalendarDays,
  Wallet,
  Activity,
  Camera,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { useAuth } from "../contexts/AuthContext";
import { useResource } from "../hooks/useResource";
import { api, download } from "../services/api";
import {
  PageHeader,
  Panel,
  State,
  Empty,
  Button,
  Field,
  Badge,
  Table,
  useAction,
  ActionNotices,
} from "../components/ui";
import { money, number, today, time, timestamp } from "../utils/format";
export default function Dashboard() {
  const { user } = useAuth(),
    self = user.role === "EMPLOYEE",
    admin = user.role === "ADMIN",
    now = today(),
    [filters, setFilters] = useState({
      start: `${now.slice(0, 7)}-01`,
      end: now,
      department: "",
    });
  const params = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v),
  );
  const resource = useResource(`/dashboard?${params}`),
    company = useResource(self ? null : "/organization"),
    balances = useResource(self ? "/leaves/balance" : null),
    { openAI } = useOutletContext(),
    action = useAction(),
    [summary, setSummary] = useState("");
  const [camera, setCamera] = useState(false);
  const data = resource.data;
  async function mark(kind) {
    const r = await action.run(
      () => api.post(`/attendance/${kind}`),
      kind === "check-in"
        ? "You are checked in."
        : "Your check-out is recorded.",
    );
    if (r) resource.reload();
  }
  const metrics = self
    ? [
        [
          "Hours this week",
          `${number(data?.weekHours)} / 40`,
          Clock3,
          "Recorded hours",
        ],
        [
          "Late arrivals",
          number(data?.lateCount),
          Activity,
          "In the selected period",
        ],
        [
          "Leave remaining",
          balances.data
            ? number(
                balances.data
                  .filter((b) => b.remaining !== null)
                  .reduce((n, b) => n + b.remaining, 0),
              )
            : "—",
          CalendarDays,
          "Across paid leave types",
        ],
        [
          "Last net pay",
          data?.lastPayslip ? money(data.lastPayslip.line.netCents) : "—",
          Wallet,
          "Finalized payslip",
        ],
      ]
    : admin
      ? [
          [
            "Team headcount",
            data?.headcount,
            Users,
            "Active + probation at period end",
          ],
          [
            "Attrition YTD",
            `${number(data?.attritionYTD)}%`,
            Activity,
            "YTD exits / average headcount",
          ],
          [
            "Payroll cost",
            money(data?.payrollGrossCents),
            Wallet,
            "Finalized gross in this period",
          ],
          [
            "Average salary",
            money(data?.averageGrossCents),
            Wallet,
            "Mean contractual gross",
          ],
        ]
      : [
          [
            "Team headcount",
            data?.headcount,
            Users,
            "Active + probation at period end",
          ],
          [
            "Present today",
            data?.presentToday,
            Clock3,
            `${data?.lateToday || 0} late arrivals`,
          ],
          [
            "On leave today",
            data?.onLeaveToday,
            CalendarDays,
            "Approved requests",
          ],
          [
            "Pending approvals",
            data?.pendingApprovals,
            Activity,
            "Leave & attendance corrections",
          ],
        ];
  return (
    <>
      <PageHeader
        eyebrow={`${user.role} / OVERVIEW`}
        title={`Hello, ${user.name.split(" ")[0]}.`}
        description={
          self
            ? "Your working day, in one place."
            : "A clear view of your people and the work behind the numbers."
        }
      >
        <Button variant="secondary" onClick={openAI}>
          <Sparkles size={16} />
          Ask assistant
        </Button>
      </PageHeader>
      <div className="filter-bar">
        <span className="filter-label">YOUR VIEW</span>
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
        {!self && (
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
      </div>
      <State resource={resource}>
        {camera && <CameraAttendance kind={data?.todayAttendance?.checkIn ? "check-out" : "check-in"} onClose={() => setCamera(false)} onRecorded={() => { setCamera(false); resource.reload(); }} />}
        <ActionNotices action={action} />
        <section className="metric-grid">
          {metrics.map(([label, value, Icon, note]) => (
            <article className="metric" key={label}>
              <div>
                <span>{label}</span>
                <Icon size={17} />
              </div>
              <strong>{value ?? 0}</strong>
              <p>{note}</p>
            </article>
          ))}
        </section>
        {self && (
          <Panel
            title="Make today count"
            subtitle="Attendance is timestamped securely by the server."
            className="attendance-widget"
            action={
              <Badge>{data?.todayAttendance?.status || "not checked in"}</Badge>
            }
          >
            <div className="clock-widget">
              <div>
                <span>CHECK-IN</span>
                <strong>{time(data?.todayAttendance?.checkIn)}</strong>
              </div>
              <div>
                <span>CHECK-OUT</span>
                <strong>{time(data?.todayAttendance?.checkOut)}</strong>
              </div>
              <div>
                <span>HOURS THIS WEEK</span>
                <strong>
                  {number(data?.weekHours)} <small>/ 40 h</small>
                </strong>
              </div>
              <Button
                loading={action.busy}
                disabled={!!data?.todayAttendance?.checkOut}
                onClick={() =>
                  mark(data?.todayAttendance ? "check-out" : "check-in")
                }
              >
                <Clock3 size={17} />
                {data?.todayAttendance ? "Check out" : "Check in"}
              </Button>
            </div>
            <Button variant="secondary" disabled={!!data?.todayAttendance?.checkOut} onClick={() => setCamera(true)}><Camera size={17} />Camera {data?.todayAttendance?.checkIn ? "check out" : "check in"}</Button>
          </Panel>
        )}
        <div className="dashboard-grid">
          <Panel
            title={admin ? "People by department" : "Attendance at a glance"}
            subtitle={
              admin
                ? "Headcount at the end of your selected period"
                : "Recorded presence, measured against expected working days"
            }
            action={
              <span className="chart-legend">
                <i /> {admin ? "Headcount" : "Present equivalent"}
              </span>
            }
          >
            {data?.headcount ? (
              <div className="chart">
                <ResponsiveContainer width="100%" height="100%">
                  {admin ? (
                    <BarChart data={data.departmentBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="_id" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar
                        dataKey="headcount"
                        fill="#2c776e"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={48}
                      />
                    </BarChart>
                  ) : (
                    <AreaChart data={data.attendanceTrend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(v) => v.slice(8)}
                        tick={{ fontSize: 11 }}
                        minTickGap={24}
                      />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Area
                        name="Present equivalent"
                        type="monotone"
                        dataKey="present"
                        stroke="#2c776e"
                        fill="#e3efeb"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty
                title="Your story starts with your team"
                description="Register employees and record attendance to bring these insights to life."
                action={
                  <Link
                    className="text-link"
                    to={self ? "/attendance" : "/employees"}
                  >
                    Go to {self ? "attendance" : "people"}
                    <ArrowRight size={15} />
                  </Link>
                }
              />
            )}
          </Panel>
          {self ? (
            <Panel
              title="Your leave balance"
              subtitle="Current year · approved leave only"
            >
              {balances.error ? (
                <p>{balances.error}</p>
              ) : (
                balances.data?.map((b) => (
                  <div className="balance-row" key={b.type}>
                    <span>{b.type}</span>
                    <strong>
                      {b.remaining === null
                        ? "Unlimited"
                        : `${b.remaining} / ${b.quota}`}
                      <small> days left</small>
                    </strong>
                  </div>
                ))
              )}
              <Link className="text-link panel-link" to="/leave">
                Plan your time off <ArrowRight size={15} />
              </Link>
            </Panel>
          ) : (
            <Panel
              title="A note from your assistant"
              subtitle="A fresh perspective on the same numbers"
              className="insight-panel"
            >
              <div className="insight-icon">
                <Sparkles size={24} />
              </div>
              {summary ? (
                <div className="ai-answer">
                  <Badge>AI-generated</Badge>
                  <p>{summary}</p>
                </div>
              ) : (
                <>
                  <h3>Make sense of the movement.</h3>
                  <p>
                    Get 3–5 concise insights from your current filters. Every
                    figure comes from your workspace.
                  </p>
                </>
              )}
              <Button
                loading={action.busy}
                variant="secondary"
                onClick={async () => {
                  const r = await action.run(
                    async () =>
                      (
                        await api.post("/ai/summary", {
                          filters: Object.fromEntries(
                            Object.entries(filters).filter(([, v]) => v),
                          ),
                        })
                      ).data,
                  );
                  if (r) setSummary(r.answer);
                }}
              >
                <Sparkles size={16} />
                Summarize this view
              </Button>
            </Panel>
          )}
        </div>
        <div className="dashboard-grid lower-grid">
          <Panel
            title={
              admin
                ? "Recent audit activity"
                : self
                  ? "Your latest payslip"
                  : "Attendance health"
            }
            subtitle={
              admin
                ? "An accountable record of important changes"
                : self
                  ? "Available after payroll is finalized"
                  : "Computed from the selected period"
            }
          >
            {admin ? (
              <div className="activity-feed">
                {data?.auditFeed?.map((a) => (
                  <div key={a._id}>
                    <i />
                    <div>
                      <strong>{a.actorName}</strong>{" "}
                      <span>
                        {a.action.replaceAll("_", " ")} · {a.entity}
                      </span>
                      <small>{timestamp(a.createdAt)}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : self ? (
              data?.lastPayslip ? (
                <div className="payslip-summary">
                  <span>{data.lastPayslip.month}</span>
                  <h3>{money(data.lastPayslip.line.netCents)}</h3>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      action.run(() =>
                        download(
                          `/payroll/${data.lastPayslip.id}/payslip/${user.employeeId}`,
                          `payslip-${data.lastPayslip.month}.pdf`,
                        ),
                      )
                    }
                  >
                    <ArrowDownToLine size={16} />
                    Download PDF
                  </Button>
                </div>
              ) : (
                <Empty title="No finalized payslip yet" />
              )
            ) : (
              <>
                <div className="health-stats">
                  <div>
                    <strong>{number(data?.attendanceRate)}%</strong>
                    <span>Attendance rate</span>
                  </div>
                  <div>
                    <strong>{number(data?.absenteeism)}%</strong>
                    <span>Absenteeism</span>
                  </div>
                  <div>
                    <strong>{number(data?.latePercent)}%</strong>
                    <span>Late percentage</span>
                  </div>
                </div>
                <Table
                  columns={[
                    { key: "name", label: "Top late-comers" },
                    { key: "count", label: "Late days" },
                  ]}
                  rows={data?.topLate}
                  empty="No late arrivals in this period"
                />
              </>
            )}
          </Panel>
          <Panel
            title="The noticeboard"
            subtitle="Updates for everyone in your workspace"
            action={
              <Link className="text-link" to="/announcements">
                View all
                <ArrowRight size={14} />
              </Link>
            }
          >
            {data?.announcements?.length ? (
              <div className="noticeboard">
                {data.announcements.slice(0, 3).map((a) => (
                  <article key={a._id}>
                    <small>{timestamp(a.createdAt)}</small>
                    <h3>{a.title}</h3>
                    <p>{a.body}</p>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                title="All caught up"
                description="Company announcements will appear here."
              />
            )}
          </Panel>
        </div>
        {!self && (
          <div className="dashboard-grid lower-grid">
            <Panel
              title={admin ? "Payroll by department" : "Leave utilization"}
              subtitle={
                admin
                  ? "Finalized gross and net, in PKR"
                  : "Approved working days / annual quota"
              }
            >
              <Table
                columns={
                  admin
                    ? [
                        { key: "_id", label: "Department" },
                        {
                          key: "gross",
                          label: "Gross",
                          render: (r) => money(r.grossCents),
                        },
                        {
                          key: "net",
                          label: "Net",
                          render: (r) => money(r.netCents),
                        },
                      ]
                    : [
                        { key: "type", label: "Leave type" },
                        { key: "days", label: "Approved days" },
                        {
                          key: "quota",
                          label: "Quota",
                          render: (r) => r.quota ?? "Unlimited",
                        },
                        {
                          key: "utilization",
                          label: "Used",
                          render: (r) => `${number(r.utilization)}%`,
                        },
                      ]
                }
                rows={
                  admin ? data?.payrollByDepartment : data?.leaveUtilization
                }
              />
            </Panel>
            <Panel
              title={admin ? "Team composition" : "Absenteeism by department"}
              subtitle={
                admin
                  ? "Gender and tenure, from employee profiles"
                  : "Absent days / expected working days"
              }
            >
              {admin ? (
                <>
                  <div className="composition">
                    {data?.genderBreakdown?.map((g) => (
                      <span key={g.name}>
                        {g.name}
                        <strong>{g.value}</strong>
                      </span>
                    ))}
                  </div>
                  <Table
                    columns={[
                      { key: "name", label: "Employee" },
                      { key: "months", label: "Tenure (months)" },
                    ]}
                    rows={data?.tenure}
                  />
                </>
              ) : (
                <Table
                  columns={[
                    { key: "department", label: "Department" },
                    { key: "absent", label: "Absent days" },
                    {
                      key: "absenteeism",
                      label: "Rate",
                      render: (r) => `${number(r.absenteeism)}%`,
                    },
                  ]}
                  rows={data?.absenteeismByDepartment}
                />
              )}
            </Panel>
          </div>
        )}
        {!self && (
          <Panel
            title={
              admin
                ? "Average salary by designation"
                : "Leave utilization by department"
            }
            subtitle={
              admin
                ? "Mean contractual gross salary, in PKR"
                : "Approved days against annual quota for the selected team"
            }
          >
            <Table
              columns={
                admin
                  ? [
                      { key: "_id", label: "Designation" },
                      {
                        key: "averageGrossCents",
                        label: "Average gross",
                        render: (r) => money(r.averageGrossCents),
                      },
                    ]
                  : [
                      { key: "department", label: "Department" },
                      { key: "type", label: "Leave type" },
                      { key: "days", label: "Approved days" },
                      {
                        key: "quota",
                        label: "Quota",
                        render: (r) => r.quota ?? "Unlimited",
                      },
                      {
                        key: "utilization",
                        label: "Utilization",
                        render: (r) => `${number(r.utilization)}%`,
                      },
                    ]
              }
              rows={
                admin ? data?.designationBreakdown : data?.leaveByDepartment
              }
            />
          </Panel>
        )}
      </State>
    </>
  );
}
