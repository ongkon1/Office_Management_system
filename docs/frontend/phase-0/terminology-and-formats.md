# Terminology and Display Formats

Covers `FE-0013`. These are the only approved user-facing terms and formats. Any screen, component, fixture, or test that displays these values uses the shared formatters, never ad-hoc string building.

## 1. Terminology

| Approved term | Use for | Never use |
|---|---|---|
| Active work | Valid time attributed to a division, project, or task; breaks excluded | "Worked hours", "productive time", "billable time" |
| Break | The single recognized daily non-active hour | "Lunch", "rest time", "break hours" (plural per entry) |
| Daily total | Active work plus recognized break | "Total worked", "hours logged" |
| Required active | The active-hour requirement for that day under the effective policy | "Target", "quota" |
| Remaining | Required active minus recorded active, floored at zero | "Deficit", "shortfall" |
| Complete | 7 active hours and an 8-hour total under the standard policy | "Approved", "OK", "Full" |
| Under-time | A day with an entry below either normal threshold | "Incomplete", "Short" |
| Overtime | Daily total above 8:00 through 12:00 | "Extra hours", "OT" in body copy (the abbreviation is allowed only in a column header with an accessible name) |
| Critical | Daily total above 12:00 | "Excessive", "Alert", "Violation" |
| Missing | A required working day with no entry and no approved exemption | "Absent", "No show" |
| General remark | The single remark type | "Comment", "Feedback", "Note", "Flag" |
| Correction request | A remark that names a record to change | "Rejection", "Denial", "Return" |
| Verified period | An HR-verified and locked payroll/reporting period | "Approved period", "Signed off", "Closed by manager" |
| Amendment | An authorized change to a verified period | "Edit", "Fix", "Reopen" |
| Planned allocation | Expected division or project allocation | "Target hours" |
| Actual contribution | Active work recorded for a division or project | "Real hours" |
| WFH | Work From Home, as a work location and as a request type | "Remote", "Home office" |
| Division | The top organizational unit | "Department", "Business unit", "Company" |
| Team Lead | The assigned reviewer role | "Manager", "Supervisor", "Approver" |

Explicitly forbidden across the entire interface: any word implying **daily approval** of a timesheet — "approve", "approval", "pending approval", "awaiting sign-off" — on a daily time record. Approval language is permitted only on WFH requests, leave requests, and HR period verification, where a decision genuinely exists.

## 2. Dates

| Context | Format | Example |
|---|---|---|
| Full date | `D MMM YYYY` | `2 Sep 2026` |
| Full date with weekday | `ddd, D MMM YYYY` | `Wed, 2 Sep 2026` |
| Short date in dense tables | `DD MMM` | `02 Sep` |
| Date with year in dense tables | `DD MMM YY` | `02 Sep 26` |
| Month heading | `MMMM YYYY` | `September 2026` |
| Date range, same month | `D – D MMM YYYY` | `1 – 30 Sep 2026` |
| Date range, crossing months | `D MMM – D MMM YYYY` | `28 Aug – 3 Sep 2026` |
| URL and machine values | `YYYY-MM-DD` | `2026-09-02` |
| Relative (≤ 7 days, secondary only) | `Today`, `Yesterday`, `Tomorrow`, `in 3 days`, `3 days ago` | — |

Rules: relative dates never stand alone where accuracy matters — the absolute date is present in a tooltip or adjacent text. Numeric-only formats such as `02/09/2026` are never used, since they are ambiguous across locales.

## 3. Times

| Context | Format | Example |
|---|---|---|
| Clock time | `h:mm A` | `9:15 AM` |
| Clock range | `h:mm A – h:mm A` | `9:15 AM – 12:30 PM` |
| Cross-midnight range | range with a next-day marker | `10:30 PM – 1:15 AM (+1)` |
| Timestamp | `D MMM YYYY, h:mm A` | `2 Sep 2026, 9:15 AM` |
| Machine values | ISO 8601 with offset | `2026-09-02T09:15:00+06:00` |

All times display in the configured business timezone, which is named wherever a period, report, or export is shown (`REQ-RPT-009`).

## 4. Durations

Durations are stored and passed as **integer minutes** everywhere in the frontend contracts. They are never stored or transported as decimal hours.

| Context | Format | Example |
|---|---|---|
| Standard display | `H:MM` | `7:00`, `6:59`, `12:30` |
| With unit label where ambiguous | `H:MM h` or `Xh Ym` | `7:00 h`, `7 h 30 m` |
| Zero | `0:00` | `0:00` |
| Accessible name | spelled out | `7 hours 30 minutes` |
| Aggregate over 99 hours | `H:MM` without padding | `142:30` |
| Signed variance | leading `+` or `−` | `+1:30`, `−0:45` |

Rules: never render `7.5 hours`; never round a displayed duration — `6:59` must never appear as `7:00`. A duration column is right-aligned and uses tabular numerals.

## 5. Money

| Context | Format | Example |
|---|---|---|
| Amount with currency | `{CODE} {amount}` with thousands separators and two decimals | `BDT 125,000.00` |
| Compact in charts and tiles | `{CODE} {value}{K\|M}` | `BDT 1.25M` |
| Restricted value | a restricted marker, never a blank or a zero | `Restricted` with a lock icon and an accessible explanation |
| Machine values | fixed-precision decimal string plus an ISO currency code | `"125000.00"`, `"BDT"` |

Rules: the currency code is always present — a bare number is never shown for money. A redacted field keeps its label and shows the restricted marker, so the viewer knows the field exists but is not authorized (`REQ-NFR-SEC-004`).

## 6. Percentages

| Context | Format | Example |
|---|---|---|
| Allocation | integer percent | `50%` |
| Completion | integer percent | `72%` |
| Variance | signed integer percent | `+12%`, `−8%` |

Allocation warnings state the total explicitly: `Concurrent allocation is 130%. Expected 100%.`

## 7. Status Presentation

Every status renders as **text plus a shape or icon plus colour** — never colour alone (`REQ-TIME-017`, `REQ-NFR-UX-003`).

| Status | Label | Icon | Colour token | Accessible description |
|---|---|---|---|---|
| Missing | `Missing` | Empty circle outline | `status-missing` (grey/red) | `Missing timesheet` |
| Under-time | `Under-time` | Half-filled circle | `status-undertime` (yellow) | `Under-time: below the required hours` |
| Complete | `Complete` | Filled check circle | `status-complete` (green) | `Complete day` |
| Overtime | `Overtime` | Upward chevron circle | `status-overtime` (orange) | `Overtime: above eight hours` |
| Critical | `Critical` | Filled warning triangle | `status-critical` (red) | `Critical: above twelve hours` |

| Workflow state | Label set |
|---|---|
| Task | `Pending`, `In Progress`, `Completed` (plus a separate `Overdue` marker, which is derived, not a status) |
| Request | `Draft`, `Pending`, `Information requested`, `Approved`, `Rejected`, `Cancelled` |
| Remark | `Open`, `Responded`, `Corrected`, `Resolved` |
| Period | `Open`, `Pending verification`, `Verified`, `Amended` |
| Export | `Queued`, `Processing`, `Ready`, `Expired`, `Failed`, `Cancelled` |
| Record | `Active`, `Inactive` (never "Deleted") |

## 8. Divisions and Names

| Context | Format | Example |
|---|---|---|
| Division, full | Name as configured | `Government Projects` |
| Client | The project's recorded client name, verbatim | `Meghna Group` — `Not recorded` where the project stores none |
| Division, dense | Code | `GOV` — with the full name as an accessible name and tooltip |
| Employee, full | `{Full name}` | `Nadia Rahman` |
| Employee, with identifier | `{Full name} · {Employee ID}` | `Nadia Rahman · EMP-1001` |
| Employee, dense | `{Full name}` truncated at one line with a tooltip | — |
| Avatar fallback | Up to two initials | `NR` |
| Project | `{Name}` with `{Code}` as secondary text | `Vision Platform v2` / `PIA-VP2` |

Names are never truncated in a way that removes the surname without a tooltip carrying the full value, and never reordered or abbreviated to a single initial in primary content.

## 9. Empty and Unknown Values

| Situation | Display |
|---|---|
| No value recorded | `—` with an accessible name of `Not recorded` |
| Not applicable | `Not applicable` |
| Restricted by permission | `Restricted` with a lock icon |
| Loading | Skeleton block reserving the final content height |
| Zero as a real measurement | `0:00`, `0%`, `BDT 0.00` — never `—` |

`—` and `0` are never interchangeable: a zero measurement and an absent measurement are distinct facts.

## 10. Number and Alignment Conventions

- Durations, money, percentages, and counts are right-aligned in tables and use tabular numerals.
- Text columns are left-aligned; status columns are left-aligned with the icon leading.
- Thousands separators appear in all counts above 999.
- Totals rows are visually distinguished and labelled `Total`, and a scoped total states its scope, for example `Total · September 2026 · All divisions`.
