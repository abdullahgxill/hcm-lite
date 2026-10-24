# HCM Lite: five-minute demonstration

Use a **fresh empty database** and three browser sessions (separate profiles or private windows). Configure a real hosted tool-calling provider before the demo. The app never creates demonstration employees automatically. Keep the Admin, HR and employee sessions separate so passwords and roles do not get mixed up.

| Time | Role | Demonstration |
| --- | --- | --- |
| 0:00–0:40 | Admin | Open the live site. Create company and Admin. Organization → set office hours/location, add Engineering and Operations, add Developer. Show annual 14 / sick 8 / casual 10 / unpaid unlimited. Save. |
| 0:40–1:05 | Admin | Access management → create HR login. Securely copy the one-time temporary password. |
| 1:05–1:45 | HR | Sign in, change temporary password. People → add two employees, job details and basic salary. Show calculated gross = 1.5 × basic. |
| 1:45–2:15 | Employee | Sign in, change temporary password. Check in. Click again via an API client to demonstrate 409 duplicate protection. Show personal attendance. |
| 2:15–2:45 | Employee | Leave → describe “I need next Monday and Tuesday off for my sister’s wedding.” Prepare form. Review casual type and resolved dates, then explicitly Confirm & submit. If AI is down, explain the visible fallback and use the normal form; do not claim live AI worked. |
| 2:45–3:15 | HR | Approve with comment. Open dashboard, choose date/department filters, show counts and Summarize. Ask “How many active employees are in Engineering?” and “Who is on leave today?” Explain that a future approved request does not make someone on leave today. |
| 3:15–4:10 | HR → Admin | Payroll → calculate draft for the month. Review gross, eligible days, absences, unpaid/half-day deductions, illustrative tax and net. Switch to Admin, review and finalize. A stale draft requires HR to recalculate. |
| 4:10–4:35 | Employee | Payroll → Details → PDF. Show payslip notification. Ask “What is my colleague’s salary?” and show the access-control refusal. |
| 4:35–5:00 | Admin | Audit trail → actor, action, time and redacted before/after JSON. Demonstrate that HR receives 403 on audit/finalization, and employees receive 403 on another employee’s profile or payslip. |

## Useful judge questions

- HR: How many active employees are in Engineering?
- HR: Who came late most often this month?
- HR: What is this month’s attendance rate?
- Employee: How many sick leaves do I have left this year?
- Employee: What is my colleague’s salary?
- Employee: I need next Monday and Tuesday off for my sister’s wedding.

Attendance is stamped by the server in the company timezone. Do not adjust the browser clock to create artificial attendance. If a late/half-day example is needed during judging, use a real employee correction and HR review. There is no backdoor for direct employee attendance edits.

A current-month payroll is a **full-month draft**: every eligible working day without a record or approved leave is absent, including future working days. Use a completed month for realistic payroll, or explicitly explain this projection in the short demo. Finalization is irreversible in the UI and locks attendance and leave for the month.

## Architecture explanation (30 seconds)

“React calls an Express API using short-lived JWTs. Every request reloads the user, checks role and enforces employee scope. Mongoose stores company settings, people and operational records in MongoDB. Transactions serialize leave approvals and payroll locking. Business services calculate working days, attendance status, deductions and illustrative tax. AI only requests validated tools; those tools call the same analytics services as the dashboards. The frontend never sees the provider key. Vercel hosts the Vite SPA and an exported Express serverless function as separate projects.”

## Submission

Each student submits their Git repository link and verified hosted frontend URL to https://lms.saylaniit.com/. Ensure judges have repository access. A local preview URL does not satisfy the hosted-link requirement.
