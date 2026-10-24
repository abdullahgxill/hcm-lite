import { useState, useEffect } from "react";
import { Save, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useResource } from "../hooks/useResource";
import { api } from "../services/api";
import {
  PageHeader,
  Panel,
  State,
  Button,
  Field,
  Notice,
  useAction,
  ActionNotices,
} from "../components/ui";
export default function Settings() {
  const { user } = useAuth(),
    resource = useResource("/organization"),
    [form, setForm] = useState(null),
    action = useAction(),
    readonly = user.role !== "ADMIN";
  useEffect(() => {
    if (resource.data)
      setForm({
        ...resource.data,
        departments: resource.data.departments.join("\n"),
        designations: resource.data.designations.join("\n"),
        holidays: resource.data.holidays.join("\n"),
      });
  }, [resource.data]);
  const f = (key, label, type = "text", extra = {}) => (
    <Field
      key={key}
      label={label}
      type={type}
      value={form?.[key] ?? ""}
      disabled={readonly}
      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      {...extra}
    />
  );
  return (
    <>
      <PageHeader
        title="The way your company works."
        description="One source of truth for your organization’s operating rules."
      />
      {readonly && (
        <Notice type="success">
          You have view access. Only an Admin can change company settings.
        </Notice>
      )}
      <State resource={resource}>
        {form && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const list = (k) => [
                ...new Set(
                  form[k]
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                ),
              ];
              const r = await action.run(
                () =>
                  api.put("/organization", {
                    ...form,
                    departments: list("departments"),
                    designations: list("designations"),
                    holidays: list("holidays"),
                    latitude: form.latitude === "" ? undefined : form.latitude,
                    longitude:
                      form.longitude === "" ? undefined : form.longitude,
                  }),
                "Organization settings saved. New records will use these rules.",
              );
              if (r) resource.reload();
            }}
          >
            <Panel
              title="Company & working day"
              subtitle="Attendance records retain their original rule snapshot."
            >
              <div className="form-grid">
                {f("name", "Company name", "text", { required: true })}
                {f("timezone", "IANA timezone", "text", { required: true })}
                {f("officeStart", "Office start", "time", { required: true })}
                {f("officeEnd", "Office end", "time", { required: true })}
                {f("graceMinutes", "Grace period (minutes)", "number", {
                  min: 0,
                  max: 120,
                  required: true,
                })}
                {f("halfDayHours", "Half-day threshold (hours)", "number", {
                  min: 1,
                  max: 12,
                  step: ".5",
                  required: true,
                })}
              </div>
              <fieldset className="weekends">
                <legend>Weekend days</legend>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (d, i) => (
                    <label key={d}>
                      <input
                        type="checkbox"
                        disabled={readonly}
                        checked={form.weekends.includes(i)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            weekends: e.target.checked
                              ? [...form.weekends, i]
                              : form.weekends.filter((n) => n !== i),
                          })
                        }
                      />
                      {d}
                    </label>
                  ),
                )}
              </fieldset>
            </Panel>
            <Panel
              title="Organization structure"
              subtitle="One value per line. Departments and designations in use cannot be removed."
            >
              <div className="form-grid">
                {f("departments", "Departments", "text", {
                  as: "textarea",
                  rows: 5,
                })}
                {f("designations", "Designations", "text", {
                  as: "textarea",
                  rows: 5,
                })}
              </div>
            </Panel>
            <Panel
              title="Leave policy & public holidays"
              subtitle="Default annual 14, sick 8, casual 10; unpaid unlimited."
            >
              <div className="leave-type-editor">
                {form.leaveTypes.map((t, i) => (
                  <div key={i}>
                    <Field
                      label="Leave type"
                      value={t.name}
                      disabled={readonly}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          leaveTypes: form.leaveTypes.map((t, j) =>
                            i === j ? { ...t, name: e.target.value } : t,
                          ),
                        })
                      }
                    />
                    <Field
                      label="Annual quota (blank = unlimited)"
                      type="number"
                      min={0}
                      value={t.quota ?? ""}
                      disabled={readonly}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          leaveTypes: form.leaveTypes.map((t, j) =>
                            i === j
                              ? {
                                  ...t,
                                  quota:
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                                }
                              : t,
                          ),
                        })
                      }
                    />
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={t.paid}
                        disabled={readonly}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            leaveTypes: form.leaveTypes.map((t, j) =>
                              i === j ? { ...t, paid: e.target.checked } : t,
                            ),
                          })
                        }
                      />
                      Paid
                    </label>
                    {!readonly && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remove ${t.name}`}
                        onClick={() =>
                          setForm({
                            ...form,
                            leaveTypes: form.leaveTypes.filter(
                              (_, j) => j !== i,
                            ),
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {!readonly && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setForm({
                      ...form,
                      leaveTypes: [
                        ...form.leaveTypes,
                        { name: "", quota: 0, paid: true },
                      ],
                    })
                  }
                >
                  <Plus size={15} />
                  Add leave type
                </Button>
              )}
              {f(
                "holidays",
                "Public holidays (YYYY-MM-DD, one per line)",
                "text",
                { as: "textarea", rows: 5 },
              )}
            </Panel>
            <Panel
              title="Office location"
              subtitle="Stored for the optional camera attendance extension; core attendance uses web check-in."
            >
              <div className="form-grid">
                {f("latitude", "Latitude", "number", {
                  step: "any",
                  min: -90,
                  max: 90,
                })}
                {f("longitude", "Longitude", "number", {
                  step: "any",
                  min: -180,
                  max: 180,
                })}
                {f("radius", "Office radius (metres)", "number", {
                  min: 1,
                  max: 10000,
                  required: true,
                })}
              </div>
            </Panel>
            <ActionNotices action={action} />
            {!readonly && (
              <div className="form-actions">
                <Button loading={action.busy}>
                  <Save size={16} />
                  Save organization settings
                </Button>
              </div>
            )}
          </form>
        )}
      </State>
    </>
  );
}
