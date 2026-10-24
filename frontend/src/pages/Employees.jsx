import { useState } from "react";
import {
  Search,
  Plus,
  Upload,
  Download,
  ArrowLeft,
  ArrowRight,
  Eye,
  Pencil,
} from "lucide-react";
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
  LoginCredentials,
  Badge,
  Modal,
  Notice,
  useAction,
  ActionNotices,
} from "../components/ui";
import { money, time } from "../utils/format";
const blank = {
  name: "",
  code: "",
  email: "",
  department: "",
  designation: "",
  joiningDate: "",
  leavingDate: "",
  basic: "",
  gender: "unspecified",
  status: "active",
  phone: "",
  address: "",
};
export function EmployeeForm({ employee, company, onClose, onSaved }) {
  const [form, setForm] = useState(
      employee
        ? {
            ...employee,
            basic: employee.basicCents / 100,
            leavingDate: employee.leavingDate || "",
          }
        : {
            ...blank,
            department: company?.departments?.[0] || "",
            designation: company?.designations?.[0] || "",
          },
    ),
    [credentials, setCredentials] = useState(null),
    action = useAction();
  const field = (key, label, type = "text") => (
    <Field
      key={key}
      label={label}
      type={type}
      required={["name", "code", "email", "joiningDate", "basic"].includes(key)}
      readOnly={key === "email" && !!employee}
      min={key === "basic" ? ".01" : undefined}
      step={key === "basic" ? ".01" : undefined}
      value={form[key]}
      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
    />
  );
  return (
    <Modal
      title={employee ? "Edit employee" : "Register an employee"}
      onClose={onClose}
      wide
    >
      {credentials ? (
        <div>
          <Notice type="success">
            Employee registered. Share this temporary password securely; it is
            shown only here.
          </Notice>
          <LoginCredentials email={form.email} password={credentials} />
          <Button onClick={onClose}>Done</Button>
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const payload = { ...form, leavingDate: form.leavingDate || null };
            const r = await action.run(
              async () =>
                (
                  await (employee
                    ? api.patch(`/employees/${employee._id}`, payload)
                    : api.post("/employees", payload))
                ).data,
            );
            if (r) {
              onSaved();
              if (r.temporaryPassword) setCredentials(r.temporaryPassword);
              else onClose();
            }
          }}
        >
          <div className="form-grid">
            {field("name", "Full name")}
            {field("code", "Employee code")}
            {field("email", "Work email", "email")}
            {field("joiningDate", "Joining date", "date")}
            <Field
              label="Department"
              as="select"
              required
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              options={[
                { value: "", label: "Select a department" },
                ...(company?.departments || []),
              ]}
            />
            <Field
              label="Designation"
              as="select"
              required
              value={form.designation}
              onChange={(e) =>
                setForm({ ...form, designation: e.target.value })
              }
              options={[
                { value: "", label: "Select a designation" },
                ...(company?.designations || []),
              ]}
            />
            {field("basic", "Monthly basic salary (PKR)", "number")}
            <Field
              label="Status"
              as="select"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              options={["active", "probation", "inactive"]}
            />
            <Field
              label="Gender"
              as="select"
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
              options={["unspecified", "female", "male", "other"]}
            />
            {field("leavingDate", "Leaving date", "date")}
            {field("phone", "Phone")}
            {field("address", "Address")}
          </div>
          <p className="help">
            Gross = basic + 40% house rent + 10% medical. A login is created
            with a temporary password.
          </p>
          <ActionNotices action={action} />
          <div className="form-actions">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={action.busy}>
              {employee ? "Save changes" : "Register employee"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
export function EmployeeProfile({ employeeId, onClose }) {
  const resource = useResource(`/employees/${employeeId}`),
    overview = useResource(`/employees/${employeeId}/overview`),
    [tab, setTab] = useState("Details"),
    { user } = useAuth(),
    action = useAction(),
    [edit, setEdit] = useState(false),
    [contact, setContact] = useState({ phone: "", address: "" });
  const content = (
    <State resource={resource}>
      {resource.data && (
        <>
          <div className="profile-heading">
            <span className="avatar large">{resource.data.name[0]}</span>
            <div>
              <h2>{resource.data.name}</h2>
              <p>
                {resource.data.designation} · {resource.data.department}
              </p>
              <Badge>{resource.data.status}</Badge>
            </div>
          </div>
          <div className="tabs profile-tabs">
            {["Details", "Attendance", "Leave", "Payslips"].map((t) => (
              <button
                key={t}
                className={t === tab ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === "Details" && (
            <dl className="profile-grid">
              {[
                ["Employee code", resource.data.code],
                ["Work email", resource.data.email],
                ["Joined", resource.data.joiningDate],
                ["Phone", resource.data.phone || "Not provided"],
                ["Address", resource.data.address || "Not provided"],
                ["Basic salary", money(resource.data.basicCents)],
                [
                  "Gross salary",
                  money(Math.round(resource.data.basicCents * 1.5)),
                ],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {tab !== "Details" && (
            <State resource={overview}>
              {tab === "Attendance" ? (
                <Table
                  rows={overview.data?.attendance}
                  columns={[
                    { key: "date", label: "Date" },
                    {
                      key: "checkIn",
                      label: "In",
                      render: (r) => time(r.checkIn),
                    },
                    {
                      key: "checkOut",
                      label: "Out",
                      render: (r) => time(r.checkOut),
                    },
                    {
                      key: "status",
                      label: "Status",
                      render: (r) => <Badge>{r.status}</Badge>,
                    },
                  ]}
                />
              ) : tab === "Leave" ? (
                <Table
                  rows={overview.data?.leaves}
                  columns={[
                    { key: "type", label: "Type" },
                    { key: "start", label: "From" },
                    { key: "end", label: "To" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r) => <Badge>{r.status}</Badge>,
                    },
                  ]}
                />
              ) : (
                <Table
                  rows={overview.data?.payslips}
                  rowKey="id"
                  columns={[
                    { key: "month", label: "Month" },
                    {
                      key: "net",
                      label: "Net pay",
                      render: (r) => money(r.line.netCents),
                    },
                    {
                      key: "pdf",
                      label: "Download",
                      render: (r) => (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            action.run(() =>
                              download(
                                `/payroll/${r.id}/payslip/${employeeId}`,
                                `payslip-${r.month}.pdf`,
                              ),
                            )
                          }
                        >
                          <Download size={15} />
                          PDF
                        </Button>
                      ),
                    },
                  ]}
                />
              )}
            </State>
          )}
          {user.role === "EMPLOYEE" &&
            (edit ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const r = await action.run(
                    () => api.patch(`/employees/${employeeId}`, contact),
                    "Contact details saved.",
                  );
                  if (r) {
                    setEdit(false);
                    resource.reload();
                  }
                }}
              >
                <Field
                  label="Phone"
                  value={contact.phone}
                  onChange={(e) =>
                    setContact({ ...contact, phone: e.target.value })
                  }
                />
                <Field
                  label="Address"
                  as="textarea"
                  value={contact.address}
                  onChange={(e) =>
                    setContact({ ...contact, address: e.target.value })
                  }
                />
                <Button loading={action.busy}>Save contact details</Button>
              </form>
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  setContact({
                    phone: resource.data.phone || "",
                    address: resource.data.address || "",
                  });
                  setEdit(true);
                }}
              >
                <Pencil size={15} />
                Edit contact details
              </Button>
            ))}
          <ActionNotices action={action} />
        </>
      )}
    </State>
  );
  return onClose ? (
    <Modal title="Employee 360" onClose={onClose} wide>
      {content}
    </Modal>
  ) : (
    <>
      <PageHeader
        title="My profile"
        description="Your work details and personal contact information."
      />
      <Panel title="Employee profile">{content}</Panel>
    </>
  );
}
function CSVImport({ onClose, onSaved }) {
  const [csv, setCSV] = useState(""),
    [report, setReport] = useState(null),
    action = useAction();
  const submit = async (commit) => {
    const data = await action.run(
      async () => (await api.post("/employees/import", { csv, commit })).data,
    );
    if (data) {
      setReport(data);
      if (commit) onSaved();
    }
  };
  return (
    <Modal title="Import employees" onClose={onClose} wide>
      <p className="help">
        CSV headers: code,name,email,department,designation,joiningDate,basic.
        Optional: status,gender,phone,address. Dates use YYYY-MM-DD. Up to 500
        rows.
      </p>
      <Field
        label="Choose CSV file"
        type="file"
        accept=".csv,text/csv"
        onChange={async (e) => {
          if (e.target.files[0]) {
            setCSV(await e.target.files[0].text());
            setReport(null);
          }
        }}
      />
      <Field
        label="CSV content"
        as="textarea"
        rows={7}
        value={csv}
        onChange={(e) => {
          setCSV(e.target.value);
          setReport(null);
        }}
      />
      <ActionNotices action={action} />
      <div className="form-actions">
        <Button
          variant="secondary"
          loading={action.busy}
          disabled={!csv}
          onClick={() => submit(false)}
        >
          Validate only
        </Button>
        {report?.dryRun && report.valid > 0 && (
          <Button loading={action.busy} onClick={() => submit(true)}>
            Import {report.valid} valid rows
          </Button>
        )}
      </div>
      {report && (
        <>
          <Notice type="success">
            {report.dryRun
              ? `${report.valid} valid rows of ${report.total}. No data has been saved.`
              : `${report.created.length} employees imported. Share the temporary passwords securely.`}
          </Notice>
          <Table
            columns={[
              { key: "row", label: "Row" },
              { key: "field", label: "Field" },
              { key: "reason", label: "Reason" },
            ]}
            rows={report.errors}
            empty="No validation errors"
          />
          {report.created && (
            <Table
              columns={[
                { key: "row", label: "Row" },
                {
                  key: "email",
                  label: "Email",
                  render: (r) => r.employee.email,
                },
                { key: "temporaryPassword", label: "Temporary password" },
              ]}
              rows={report.created}
            />
          )}
        </>
      )}
    </Modal>
  );
}
export default function Employees() {
  const { user } = useAuth(),
    [search, setSearch] = useState(""),
    [department, setDepartment] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [modal, setModal] = useState(null),
    [profile, setProfile] = useState(null),
    company = useResource("/organization"),
    action = useAction();
  const resource = useResource(
    `/employees?${new URLSearchParams({ search, department, status, page: String(page) })}`,
  );
  return (
    <>
      <PageHeader
        title="Your people."
        description="A connected directory of the people behind your organization."
      >
        {user.role === "HR" && (
          <>
            <Button
              variant="secondary"
              onClick={() =>
                action.run(() => download("/employees/export", "employees.csv"))
              }
            >
              <Download size={16} />
              Export
            </Button>
            <Button variant="secondary" onClick={() => setModal("csv")}>
              <Upload size={16} />
              Import CSV
            </Button>
            <Button onClick={() => setModal("new")}>
              <Plus size={17} />
              Add employee
            </Button>
          </>
        )}
      </PageHeader>
      <div className="filter-bar">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Search employees"
            placeholder="Search name, email or code"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Field
          label="Department"
          as="select"
          value={department}
          onChange={(e) => {
            setDepartment(e.target.value);
            setPage(1);
          }}
          options={[
            { value: "", label: "All departments" },
            ...(company.data?.departments || []),
          ]}
        />
        <Field
          label="Status"
          as="select"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          options={[
            { value: "", label: "All statuses" },
            "active",
            "probation",
            "inactive",
          ]}
        />
      </div>
      <ActionNotices action={action} />
      <Panel
        title="Employee directory"
        subtitle={`${resource.data?.total || 0} employees found`}
      >
        <State resource={resource}>
          <Table
            columns={[
              {
                key: "name",
                label: "Employee",
                render: (e) => (
                  <button
                    className="person-cell"
                    onClick={() => setProfile(e._id)}
                  >
                    <span className="avatar">{e.name[0]}</span>
                    <span>
                      <strong>{e.name}</strong>
                      <small>{e.email}</small>
                    </span>
                  </button>
                ),
              },
              { key: "code", label: "Code" },
              { key: "department", label: "Department" },
              { key: "designation", label: "Designation" },
              {
                key: "status",
                label: "Status",
                render: (e) => <Badge>{e.status}</Badge>,
              },
              {
                key: "basicCents",
                label: "Monthly gross",
                render: (e) => money(Math.round(e.basicCents * 1.5)),
              },
              {
                key: "actions",
                label: "Actions",
                render: (e) => (
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      aria-label={`View ${e.name}`}
                      onClick={() => setProfile(e._id)}
                    >
                      <Eye size={17} />
                    </button>
                    {user.role === "HR" && (
                      <button
                        className="icon-button"
                        aria-label={`Edit ${e.name}`}
                        onClick={() => setModal(e)}
                      >
                        <Pencil size={16} />
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
            rows={resource.data?.items}
            empty="Your employee directory is ready for its first person"
          />
          <div className="pagination">
            <span>
              Page {page} of {resource.data?.pages || 1}
            </span>
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ArrowLeft size={15} />
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={page >= (resource.data?.pages || 1)}
              onClick={() => setPage(page + 1)}
            >
              Next
              <ArrowRight size={15} />
            </Button>
          </div>
        </State>
      </Panel>
      {modal === "csv" ? (
        <CSVImport onClose={() => setModal(null)} onSaved={resource.reload} />
      ) : (
        modal && (
          <EmployeeForm
            employee={modal === "new" ? null : modal}
            company={company.data}
            onClose={() => setModal(null)}
            onSaved={resource.reload}
          />
        )
      )}{" "}
      {profile && (
        <EmployeeProfile
          employeeId={profile}
          onClose={() => setProfile(null)}
        />
      )}
    </>
  );
}
