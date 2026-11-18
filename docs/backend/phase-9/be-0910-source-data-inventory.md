# BE-0910 Source-Data Inventory and Intake Register

Status: **In progress — owner source data not yet supplied**  
Inventory date: **2 November 2026**  
Business timezone: **Asia/Dhaka**  
Production currency: **BDT**

## Purpose

This register identifies every authoritative business dataset required before
the production migration can be designed or rehearsed. It records the expected
owner, import boundary, minimum source fields, sensitivity, dependencies, and
receipt evidence for `BE-0910`.

It does not treat development fixtures as business data. The repository scan
found no owner-supplied CSV, TSV, Excel, JSON, or SQL source file. The records
in `scripts/seed-development.sql` are deterministic demonstrations only and
must never be promoted into production as an authoritative source.

## Intake summary

| # | Dataset | Accountable business owner | Expected steward | Sensitivity | Receipt status | Source/cut-off evidence |
|---:|---|---|---|---|---|---|
| 1 | Employees and account roles | HR Manager | HR data administrator | Restricted PII | Not received | Owner, source system, cut-off, row count and checksum missing |
| 2 | Divisions | Super Administrator / Management | Organization administrator | Internal; Government flag protected | Not received | Owner approval and authoritative division register missing |
| 3 | Division assignments, departments and department leads | HR Manager + Super Administrator | HR data administrator | Restricted organization data | Not received | Effective-dated placement and leadership source missing |
| 4 | Holiday calendars and holidays | HR Manager | HR policy administrator | Internal | Not received | Calendar year, policy source and owner approval missing |
| 5 | Opening leave balances | HR Manager | Payroll/leave administrator | Restricted HR data | Not received | Balance cut-off, leave-type register and signed totals missing |
| 6 | Projects and memberships | Division/project owners | Project administrator | Protected; may be Government | Not received | Project register, client labels and owner approval missing |
| 7 | Tasks and memberships | Division/project owners | Project administrator | Protected; may be Government | Not received | Task register and stable source keys missing |
| 8 | Effective internal cost rates | HR Manager / authorized financial owner | Payroll/cost administrator | Financial, deny by default | Not received | Effective-rate register and authorized sign-off missing |
| 9 | Opening timesheet and payroll periods | HR Manager | Payroll administrator | Restricted payroll data | Not received | Cutover date, period boundaries, policy version and opening status missing |

Receipt is therefore **0 of 9 required dataset families**. A zero-row dataset
still requires a signed owner declaration; silence is not evidence that the
dataset is intentionally empty.

## Source manifest required for every file

Each delivered file or source-system extract must have a manifest containing:

- dataset name and source-system name;
- accountable owner and operational steward;
- extraction instant and business cut-off date in Asia/Dhaka;
- file format, encoding, worksheet/table name, and header version;
- source row count and SHA-256 checksum;
- whether the extract is full, incremental, or an explicit zero-row set;
- sensitivity classification and approved transfer location;
- natural/stable source key and duplicate-key rule;
- known omissions, transformations, and unresolved records; and
- dated owner approval that the extract is authoritative for rehearsal.

Real business data must not be committed to this repository. The approved
secure intake location and retention window remain deployment decisions under
`BE-0915`.

## Dataset definitions

### 1. Employees and account roles

Minimum source fields:

- stable employee code, legal/display name, work email, job title, hire date,
  employment status and employment type;
- role key (`employee`, `team_lead`, `hr_manager`, `management`, or
  `super_admin`) with effective dates where historical assignment is
  required;
- office location, normal work mode, standard daily/weekly active minutes,
  phone and preferred name where approved; and
- termination/inactivation date where applicable.

Passwords, password hashes, two-factor secrets, sessions, and failed-login
state are not source-data fields and must not be imported. Account activation
or password setup must use the authentication workflow. Historical
`finance_manager` may be retained only for existing stored history; it is not
available for new assignments.

Identity key: `employee_code`; work email must also be unique after normalized
comparison.

### 2. Divisions

Minimum source fields: stable division key/code, name, description, active
status, Government-project flag, and effective operating date if one exists.

The five configured names are seed defaults, not proof of the production
register. The owner must confirm additions, renames, inactive divisions, and
which divisions require Government-project restrictions.

Identity key: stable division key/code.

### 3. Assignments, departments and department leadership

Minimum assignment fields: employee code, division key, department code,
effective-from/to dates, allocation percentage, expected weekly minutes,
primary flag, role in division, active status, and temporary flag.

Minimum department fields: division key, department code, department name,
description, and active status. Minimum leadership fields: division key,
department code, lead employee code, effective-from/to dates, and appointment
reason where applicable.

Departments are division-owned and placement belongs to the division
assignment. A department code must resolve inside the same division. An active
assignment requires one active department from that division. Leadership is
effective-dated, has at most one effective lead per department, and does not
replace the employee's account role. Concurrent allocations above 100 percent
must be reported for owner review.

Identity key: employee code + division key + effective-from date. Department
identity is division key + department code.

### 4. Holiday calendars and holidays

Minimum calendar fields: stable calendar key, optional division key, calendar
name, effective-from/to dates, and active status. Minimum holiday fields:
calendar key, local holiday date, name, portion (`full_day`, `first_half`, or
`second_half`), and active status.

The source must state the covered calendar year. Friday and Saturday are the
default weekly holidays and are policy configuration, not duplicated as one
holiday row per date unless the approved source explicitly models them that
way.

Identity key: calendar key + holiday date.

### 5. Opening leave balances

Minimum source fields: employee code, leave-type key/name, balance year,
entitled minutes, used minutes, reserved minutes, unit minutes, and the balance
cut-off date. The leave-type register must also state paid/unpaid status,
attachment requirement, and active status.

Balances must be supplied in integer minutes or with a documented conversion
rule. Used plus reserved minutes may not exceed entitlement. Signed totals are
required per leave type and for the complete extract.

Identity key: employee code + leave-type key + year.

### 6. Projects and memberships

Minimum project fields: stable project code, division key, name, status,
manager employee code, start/end dates, priority, estimated minutes,
description, completion percent, time-entry eligibility, active status,
budget amount/currency when authorized, and historical client label where
present.

Membership fields: project code, employee code, role, allocation percentage,
effective-from/to dates, and active status. Government projects must be marked
through their division and remain protected before aggregation.

The first-class Client migration is owned by Backend Phase 13. Until that
cutover, historical `client_name` labels must be retained for reconciliation
and must not be silently interpreted as Client identifiers.

Identity key: project code; membership key is project code + employee code +
effective-from date.

### 7. Tasks and memberships

Minimum task fields: stable source task key, project code, optional parent
source key, title, description, division key, creator employee code and creator
role, assignee employee code, supporting-member employee codes, stored status
(`pending`, `in_progress`, or `completed`), review state, priority, estimated
minutes, start date, due date, completed instant where applicable, and active
status.

`Overdue` and `Upcoming` are derived filters and are invalid stored statuses.
Imported tasks do not create work minutes. Pending tasks accept no work, and
Completed tasks stay closed until explicitly reopened through the workflow.

Identity key: source-system name + stable source task key. This external key is
required for the idempotent import design in `BE-0912` even though application
UUIDs are generated internally.

### 8. Effective cost rates

Minimum source fields: stable source rate key, exactly identified scope
(employee code and, where applicable, division/project code), decimal rate
amount, ISO currency, rate unit (`hour`, `day`, or `month`), effective-from/to
dates, and active status.

The owner must state the precedence rule when more than one rate could match.
Money must remain fixed precision and must never enter the intake sheet as a
floating-point-derived value. Cost files and their rejection reports require
`finance.cost.view` handling and protected storage.

Identity key: source rate key; overlap checks operate on scope and effective
dates.

### 9. Opening periods

Minimum fields: timesheet-period label, local start/end dates, opening status,
approved policy version, and the linked payroll-period label/status. The owner
must name the cutover date and whether the opening period starts on that date or
at the beginning of the containing payroll month.

A period may open only after assignments, calendars, leave balances, projects,
tasks, and effective rates required for that range are accepted. Verified or
closed history must not be represented as an opening balance without its
supporting immutable records and a separately approved historical-migration
scope.

Identity key: start date + end date; ranges may not overlap existing periods.

## Dependency and load order

1. Employees/account identities and divisions.
2. Departments and division assignments.
3. Department leadership and calendars/holidays.
4. Leave types and opening leave balances.
5. Projects and project memberships.
6. Tasks and task memberships.
7. Effective cost rates.
8. Opening timesheet and payroll periods.

This is inventory sequencing only. Mapping, validation, duplicate resolution,
dry-run, approval, and rollback are now defined by
`docs/backend/phase-9/be-0911-import-strategy.md`; import implementation belongs
to `BE-0912`.

## Completion gate

`BE-0910` may move to Done only when all nine rows in the intake summary have:

- a named accountable owner and steward;
- an identified authoritative source and approved secure location;
- a declared cut-off date, row count, and SHA-256 checksum;
- an approved data dictionary or confirmed mapping-ready header;
- recorded omissions and explicit zero-row declarations where applicable; and
- owner confirmation that the extract is ready for `BE-0911` mapping.

No application schema, production data, or import command is changed by this
inventory task.
