from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak,
    Table, TableStyle, KeepTogether, CondPageBreak
)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "powerinai-user-journey-guide.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)

VIOLET = colors.HexColor("#5B52E6")
VIOLET_LIGHT = colors.HexColor("#EFEEFF")
PINK = colors.HexColor("#FF3C7E")
INK = colors.HexColor("#18192B")
MUTED = colors.HexColor("#5B6175")
LINE = colors.HexColor("#DDE0EA")
SOFT = colors.HexColor("#F7F8FC")
GREEN = colors.HexColor("#1F7A4D")
AMBER = colors.HexColor("#A15C00")
RED = colors.HexColor("#B42318")
BLUE = colors.HexColor("#1769AA")
WHITE = colors.white

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CoverKicker", fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=VIOLET, spaceAfter=10, alignment=TA_CENTER))
styles.add(ParagraphStyle(name="CoverTitle", fontName="Helvetica-Bold", fontSize=27, leading=32, textColor=INK, alignment=TA_CENTER, spaceAfter=12))
styles.add(ParagraphStyle(name="CoverSub", fontName="Helvetica", fontSize=12, leading=18, textColor=MUTED, alignment=TA_CENTER, spaceAfter=16))
styles.add(ParagraphStyle(name="H1x", fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=INK, spaceAfter=12, spaceBefore=4))
styles.add(ParagraphStyle(name="H2x", fontName="Helvetica-Bold", fontSize=14, leading=18, textColor=INK, spaceAfter=7, spaceBefore=10))
styles.add(ParagraphStyle(name="H3x", fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=VIOLET, spaceAfter=4, spaceBefore=6))
styles.add(ParagraphStyle(name="Bodyx", fontName="Helvetica", fontSize=9.2, leading=13.5, textColor=INK, spaceAfter=6))
styles.add(ParagraphStyle(name="Smallx", fontName="Helvetica", fontSize=7.8, leading=10.8, textColor=MUTED))
styles.add(ParagraphStyle(name="StepNum", fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=WHITE, alignment=TA_CENTER))
styles.add(ParagraphStyle(name="StepText", fontName="Helvetica", fontSize=8.7, leading=12.2, textColor=INK))
styles.add(ParagraphStyle(name="Callout", fontName="Helvetica", fontSize=9, leading=13, textColor=INK, leftIndent=8, rightIndent=8, spaceBefore=5, spaceAfter=5))
styles.add(ParagraphStyle(name="Footer", fontName="Helvetica", fontSize=7.2, leading=9, textColor=MUTED))


def header_footer(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setStrokeColor(LINE)
    canvas.line(18 * mm, h - 14 * mm, w - 18 * mm, h - 14 * mm)
    canvas.setFont("Helvetica-Bold", 7.5)
    canvas.setFillColor(VIOLET)
    canvas.drawString(18 * mm, h - 10.5 * mm, "POWERINAI - USER JOURNEY GUIDE")
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(w - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


doc = BaseDocTemplate(str(OUT), pagesize=A4, rightMargin=18*mm, leftMargin=18*mm, topMargin=20*mm, bottomMargin=16*mm, title="PowerInAI User Journey Guide", author="PowerInAI Product Team")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
doc.addPageTemplates(PageTemplate(id="main", frames=[frame], onPage=header_footer))
story = []


def p(text, style="Bodyx"):
    story.append(Paragraph(text, styles[style]))


def title(text):
    story.append(Paragraph(text, styles["H1x"]))
    story.append(Table([[""]], colWidths=[doc.width], rowHeights=[2], style=TableStyle([("BACKGROUND", (0,0), (-1,-1), VIOLET), ("LINEBELOW", (0,0), (-1,-1), 0, VIOLET)])))
    story.append(Spacer(1, 7))


def h2(text):
    story.append(Paragraph(text, styles["H2x"]))


def callout(label, text, tone=VIOLET_LIGHT):
    t = Table([[Paragraph(f"<b>{label}</b><br/>{text}", styles["Callout"])]], colWidths=[doc.width])
    t.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), tone), ("BOX", (0,0), (-1,-1), .7, LINE), ("LEFTPADDING", (0,0), (-1,-1), 8), ("RIGHTPADDING", (0,0), (-1,-1), 8), ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6)]))
    story.append(t)
    story.append(Spacer(1, 7))


def bullets(items):
    for item in items:
        p(f"<font color='#5B52E6'><b>•</b></font> {item}")


def steps(items):
    rows = []
    for idx, item in enumerate(items, 1):
        rows.append([Paragraph(str(idx), styles["StepNum"]), Paragraph(item, styles["StepText"])])
    table = Table(rows, colWidths=[9*mm, doc.width-9*mm], hAlign="LEFT")
    commands = [("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 6), ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5)]
    for row in range(len(rows)):
        commands += [("BACKGROUND", (0,row), (0,row), VIOLET), ("BACKGROUND", (1,row), (1,row), WHITE if row % 2 == 0 else SOFT), ("BOX", (0,row), (-1,row), .4, LINE)]
    table.setStyle(TableStyle(commands))
    story.append(table)
    story.append(Spacer(1, 7))


def journey(name, audience, goal, flow, outcome, exceptions=None, status="Demo-ready frontend"):
    block = [Paragraph(name, styles["H2x"])]
    meta = Table([
        [Paragraph("WHO", styles["Smallx"]), Paragraph(audience, styles["Bodyx"]), Paragraph("CURRENT STATE", styles["Smallx"]), Paragraph(status, styles["Bodyx"])],
        [Paragraph("GOAL", styles["Smallx"]), Paragraph(goal, styles["Bodyx"]), Paragraph("SUCCESS", styles["Smallx"]), Paragraph(outcome, styles["Bodyx"])],
    ], colWidths=[18*mm, 61*mm, 25*mm, doc.width-104*mm])
    meta.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), VIOLET_LIGHT), ("BOX", (0,0), (-1,-1), .6, LINE), ("INNERGRID", (0,0), (-1,-1), .3, LINE), ("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6), ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5)]))
    block += [meta, Spacer(1, 6), Paragraph("What the person does", styles["H3x"])]
    rows = []
    for idx, item in enumerate(flow, 1):
        rows.append([Paragraph(str(idx), styles["StepNum"]), Paragraph(item, styles["StepText"])])
    st = Table(rows, colWidths=[9*mm, doc.width-9*mm])
    cmds=[("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),5),("RIGHTPADDING",(0,0),(-1,-1),6),("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4)]
    for row in range(len(rows)):
        cmds += [("BACKGROUND",(0,row),(0,row),VIOLET),("BACKGROUND",(1,row),(1,row),WHITE if row%2==0 else SOFT),("BOX",(0,row),(-1,row),.35,LINE)]
    st.setStyle(TableStyle(cmds)); block += [st]
    if exceptions:
        block += [Spacer(1,5), Paragraph("When something is different", styles["H3x"]), Paragraph("<br/>".join([f"• {x}" for x in exceptions]), styles["Bodyx"])]
    # Give every journey enough room for its heading and summary. Allow the
    # detailed steps to split normally if the complete journey is taller than
    # the remaining frame; wrapping a tall journey in KeepTogether can clip
    # leading cells at a forced page boundary in ReportLab.
    story.append(CondPageBreak(72 * mm))
    story.extend(block)
    story.append(Spacer(1, 8))


# Cover
story += [Spacer(1, 35*mm), Paragraph("PRODUCT EXPERIENCE", styles["CoverKicker"]), Paragraph("Multi-Division Timesheet and Work Management", styles["CoverTitle"]), Paragraph("A plain-language guide to every major user journey", styles["CoverSub"])]
cover = Table([
    [Paragraph("Prepared for", styles["Smallx"]), Paragraph("PowerInAI stakeholders, operational leaders, and delivery teams", styles["Bodyx"])],
    [Paragraph("Product scope", styles["Smallx"]), Paragraph("Time, attendance, work, people, reviews, reporting, and administration", styles["Bodyx"])],
    [Paragraph("Snapshot date", styles["Smallx"]), Paragraph("10 September 2026", styles["Bodyx"])],
], colWidths=[35*mm, 105*mm], hAlign="CENTER")
cover.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),SOFT),("BOX",(0,0),(-1,-1),.7,LINE),("INNERGRID",(0,0),(-1,-1),.3,LINE),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),8),("RIGHTPADDING",(0,0),(-1,-1),8),("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7)]))
story += [cover, Spacer(1, 22*mm)]
callout("How to use this guide", "Start with the role overview, then follow the numbered journeys. Each journey explains the human goal, the visible steps, the successful outcome, and what happens when an exception occurs.")
story.append(PageBreak())

title("1. Product story at a glance")
p("This product gives one trusted view of work across five divisions: PowerInAI, PowerInAI Training, Government Projects, Computer Jagat, and WesternCF. Employees record where their time went; Team Leads resolve operational exceptions; HR protects employee records and verifies monthly periods; Management sees trends without editing; and Super Administrators configure the system.")
callout("The central promise", "Record work once. Keep the division, project, and task detail. Add the day across all divisions. Protect sensitive information before any totals or reports are produced.")
h2("A normal workday")
steps([
    "The employee signs in and lands on a dashboard tailored to their role.",
    "They add work manually, run a timer, or copy a previous entry and then confirm the details.",
    "Each entry is linked to an allowed division and, where relevant, an active project and task.",
    "The system totals active work across every division for that local day and displays one separate break value.",
    "The employee sees whether the day is Missing, Under-time, Complete, Overtime, or Critical and is guided to resolve any issue.",
    "At month end, HR reviews exceptions, verifies the period, and locks it for formal reporting and payroll preparation."
])
h2("Rules people need to understand")
rules = [
    ["Rule", "Plain-language meaning"],
    ["Complete day", "At least 7 hours of active work plus one separately recognized 1-hour break, producing an 8-hour total."],
    ["Under-time", "The day is under-time if either the active-work target or the total-day target is missed."],
    ["Overtime", "More than 8 hours and up to exactly 12 hours. A reason is required."],
    ["Critical", "More than 12 hours. An explanation is required and both the Team Lead and HR are notified."],
    ["No daily approval", "A Team Lead does not approve ordinary daily timesheets. They review exceptions and may request corrections."],
    ["No overlap", "An employee cannot record two activities for the same moment, even in different divisions."],
    ["Locked month", "After HR verifies a period, historical entries cannot be silently changed."],
]
t=Table([[Paragraph(f"<b>{c}</b>",styles["Smallx"]) for c in rules[0]]] + [[Paragraph(c,styles["Smallx"]) for c in row] for row in rules[1:]], colWidths=[34*mm, doc.width-34*mm], repeatRows=1)
t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),VIOLET),("TEXTCOLOR",(0,0),(-1,0),WHITE),("GRID",(0,0),(-1,-1),.4,LINE),("VALIGN",(0,0),(-1,-1),"TOP"),("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE,SOFT]),("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6),("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5)])); story.append(t)
story.append(PageBreak())

title("2. People and responsibilities")
roles = [
    ["Person", "What they come here to do", "Important boundary"],
    ["Employee", "Record time; view own attendance; request WFH or leave; raise tasks; read notices and documents.", "Sees only permitted work and personal information."],
    ["Team Lead", "Understand team workload; review exceptions; request corrections; review WFH, leave, and employee-raised tasks.", "Does not approve normal daily timesheets."],
    ["HR Manager", "Maintain people records; oversee leave/WFH; verify and lock periods; manage evaluations; access finance capabilities only when separately granted.", "Sensitive salary, cost, evaluation, and attachment data remains permission-based."],
    ["Management / View-Only", "See organizational trends, utilization, attendance, and performance summaries.", "Cannot create, edit, approve, verify, or export unless explicitly granted."],
    ["Super Administrator", "Manage divisions, accounts, roles, policies, holidays, integrations, feature flags, and audit access.", "Administrative power is audited and still deny-by-default for protected data."],
    ["Historical Finance Manager", "May remain on old stored records for history.", "No longer assigned as a current frontend role; HR absorbed the workflow, not automatic cost permission."],
]
t=Table([[Paragraph(f"<b>{c}</b>",styles["Smallx"]) for c in roles[0]]] + [[Paragraph(c,styles["Smallx"]) for c in row] for row in roles[1:]], colWidths=[30*mm,76*mm,doc.width-106*mm], repeatRows=1)
t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),INK),("TEXTCOLOR",(0,0),(-1,0),WHITE),("GRID",(0,0),(-1,-1),.4,LINE),("VALIGN",(0,0),(-1,-1),"TOP"),("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE,SOFT]),("LEFTPADDING",(0,0),(-1,-1),5),("RIGHTPADDING",(0,0),(-1,-1),5),("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5)])); story.append(t)
h2("The trust model")
bullets([
    "People see only the records and fields they are authorized to see.",
    "Protected government-project, salary, cost, evaluation, export, attachment, and audit information is hidden before calculations are made.",
    "A person who asks for a restricted record receives the same response as if the record did not exist.",
    "Every significant action creates an audit trail: who acted, what changed, when it happened, and why where applicable."
])
story.append(PageBreak())

title("3. Employee journeys")
journey("E1. Sign in and orient", "Employee", "Reach the right personal workspace safely.", ["Open the sign-in page and enter credentials.", "Complete two-factor verification when required.", "Arrive at the employee dashboard with today's status, useful shortcuts, and personal alerts.", "Use the navigation to reach Timesheets, Tasks, WFH, Leave, Attendance, Documents, Messages, Notifications, or Profile."], "The employee can immediately tell what needs attention today.", ["Repeated failed attempts may lock the account.", "Expired sessions return the employee to a safe sign-in path without exposing data."])
journey("E2. Add time manually", "Employee", "Record work against the correct business context.", ["Choose the local work date.", "Select a division currently assigned to the employee.", "Optionally select an active project and an approved/active task that belongs to that context.", "Enter a valid start and end time, then add the single general remark if useful.", "Review the calculated duration and save."], "The entry appears in the day and contributes integer minutes to the daily total.", ["Overlapping time is rejected, including overlap across divisions.", "Inactive projects, unassigned divisions, invalid ranges, approved-leave periods, and tasks still awaiting endorsement are rejected or clearly flagged.", "Every validation message identifies the field, the problem, and how to correct it."])
journey("E3. Track work with a timer", "Employee", "Capture work as it happens.", ["Choose the division, project, and task context.", "Start the timer.", "See the active timer persist while moving around the application.", "Stop the timer and review the resulting entry before saving."], "Elapsed work becomes a normal time entry with the same validation rules as manual entry.", ["The timer cannot create overlapping work.", "If the selected task or project becomes unavailable, the employee is asked to select a valid destination."])
journey("E4. Copy previous work", "Employee", "Reduce repetitive entry without copying mistakes.", ["Open a previous day or entry.", "Choose Copy.", "The system creates an editable draft for the new date.", "Review division, project, task, and time because availability may have changed.", "Save only after validation succeeds."], "A new entry is created; the original remains unchanged.", ["A copied inactive task or expired assignment must be replaced.", "Copying never bypasses overlap or leave checks."])
journey("E5. Understand the day status", "Employee", "Know whether the workday is complete and what action is needed.", ["Open the daily timesheet.", "Review active minutes, the one separate break value, and total scheduled time.", "Read the text status and supporting visual indicator.", "If overtime or critical, add the required reason or explanation.", "Resolve missing or conflicting records before month end."], "The employee understands the status without relying on color alone.", ["Exactly 12:00 is Overtime, not Critical.", "More than 12:00 is Critical and alerts the Team Lead and HR.", "A day is Under-time when either required threshold is missed."])
journey("E6. Correct a record", "Employee and Team Lead", "Repair an error without losing history.", ["The employee or Team Lead identifies the incorrect entry.", "A correction request explains what should change and why.", "The employee opens the request, edits the permitted details, and resubmits.", "The system recalculates the day using the central rules and records the audit history."], "The corrected day is accurate and the original change history remains traceable.", ["A locked payroll period cannot be directly edited.", "There is no daily approval state; this is an exception-and-correction process."])
story.append(PageBreak())

title("4. Requests and personal work journeys")
journey("R1. Request Work From Home", "Employee; Team Lead; HR oversight", "Ask to work remotely for a date or period.", ["Employee opens WFH and creates a request with dates and reason.", "The assigned Team Lead reviews the request and approves or rejects it with context.", "The employee receives a notification and sees the updated status.", "HR can oversee the process and use an audited override when authorized."], "The decision is visible, attributable, and connected to attendance context.", ["The reviewer cannot act outside their effective team scope.", "An HR override is exceptional and audited."])
journey("R2. Request leave", "Employee; Team Lead; HR oversight", "Request time away and keep attendance accurate.", ["Employee checks available leave information and selects leave type and dates.", "Employee submits the reason and any permitted supporting document.", "Team Lead reviews and decides; HR maintains oversight and balances.", "The employee receives the outcome and attendance reflects approved leave."], "Approved leave is visible in the employee's schedule and prevents conflicting time entry.", ["Protected documents require explicit permission.", "Insufficient balance or conflicting dates produce clear guidance."])
journey("R3. Raise a task", "Employee; current Team Lead", "Propose necessary work that was not already assigned.", ["Employee creates a narrowly scoped task for themselves with the correct division/project context.", "The task is marked Pending review and cannot receive time.", "The current effective Team Lead reviews the task.", "Approval makes it ordinary active work; rejection requires a note and keeps it unavailable for time."], "Only endorsed employee-raised work becomes selectable for time entry.", ["An employee cannot endorse their own task.", "A former or unrelated Team Lead cannot decide it.", "Repeated decisions are handled safely and do not create duplicate outcomes."])
journey("R4. View attendance and personal history", "Employee", "Understand attendance patterns and personal records.", ["Open Attendance or Timesheets.", "Filter or move through dates.", "Review statuses, work contributions by division/project/task, leave/WFH context, and correction history.", "Open a day for detail when necessary."], "The employee can explain their own work history using consistent dates and durations.", ["Restricted fields are omitted or marked Restricted, never displayed as zero."])
journey("R5. Receive notifications and communicate", "All permitted users", "Stay informed and resolve work questions.", ["Open Notifications to see relevant decisions, exceptions, reminders, and system events.", "Follow a notification to the related record when access is allowed.", "Use lightweight Messages for operational communication when the feature is enabled.", "Mark items read and return to the task at hand."], "People receive actionable information without being shown unauthorized details.", ["Documents, messages, global search, and integrations are runtime feature flags and may be switched off."])
story.append(PageBreak())

title("5. Team Lead journeys")
journey("T1. Start the day from the team dashboard", "Team Lead", "See where the team needs attention.", ["Open the dashboard and review team status summaries.", "Move to Team or Workload for individual and capacity detail.", "Use exception lists to focus on missing, under-time, overtime, critical, or conflicting records.", "Open an employee/day detail only within the current effective team scope."], "The Team Lead prioritizes exceptions rather than checking every normal day.", ["Counts and totals are calculated only from records the Team Lead may see."])
journey("T2. Review a time exception", "Team Lead", "Help correct unusual or incomplete time.", ["Open the exception queue.", "Review the employee's day, contribution split, remarks, and relevant context.", "If something is wrong, create a correction request with clear guidance.", "Track whether the employee has resolved it."], "The exception is explained or corrected before HR's monthly verification.", ["There is deliberately no Approve day or Approve timesheet action."])
journey("T3. Review WFH and leave", "Team Lead", "Make timely, accountable people decisions.", ["Open the requests queue.", "Review dates, reason, team coverage, and allowed supporting information.", "Approve or reject the request.", "The system records the decision and notifies the employee."], "The request has one clear status and auditable decision.", ["HR retains oversight and audited override authority."])
journey("T4. Plan workload", "Team Lead", "Balance assignments across people and divisions.", ["Open Workload and select the relevant period.", "Compare planned allocations and actual work for visible team members.", "Identify overload, under-allocation, deadlines, or gaps.", "Adjust projects/tasks or discuss priorities outside the tool as appropriate."], "Work is allocated with fewer avoidable overloads and missed deadlines.", ["An allocation total different from 100% is a warning, not an automatic rewrite of the data."])
journey("T5. Evaluate an employee", "Team Lead with HR governance", "Record a fair, structured performance review.", ["Open Evaluations and select an eligible employee and period.", "Review permitted work and attendance context.", "Complete the structured evaluation and supporting comments.", "Submit through the governed evaluation process; HR manages visibility and records."], "A traceable evaluation is available only to authorized people.", ["Evaluation information is deny-by-default and never included in broad summaries before authorization."])
story.append(PageBreak())

title("6. HR and finance-capability journeys")
journey("H1. Maintain an employee record", "HR Manager", "Keep the workforce directory accurate over time.", ["Open Employees and search for the person.", "Create or update identity, employment, department, location, and profile information.", "Manage effective-dated division assignments, Team Lead relationship, primary assignment, and allocation.", "Deactivate historical employees or assignments instead of deleting referenced history."], "Current information is accurate while old timesheets and audit history remain reproducible.", ["Temporary assignments require an end date.", "Overlapping primary assignments are rejected.", "Profile photos and attachments use protected short-lived access."])
journey("H2. Manage divisions, projects, and tasks", "HR or authorized administrator", "Keep valid work destinations available.", ["Create or update a configurable division.", "Create a project with division, manager, dates, members, client label, and active status.", "Create and assign tasks within the project's scope.", "Deactivate completed or retired records rather than erasing history.", "Review actual minutes derived from accepted time entries."], "People can select only valid work destinations and historical reporting stays intact.", ["Actual time is calculated from saved records and cannot be manually overwritten.", "Inactive projects and tasks reject new time."])
journey("H3. Verify and lock a monthly period", "HR Manager", "Create a reliable payroll/reporting cutoff.", ["Open HR Timesheets and select the month.", "Review completeness, leave/WFH context, overtime, critical days, corrections, and unresolved exceptions.", "Resolve exceptions or explicitly accept permitted remaining exceptions with accountability.", "Choose Verify period, confirm the action, and lock the period.", "Use the verified period for payroll preparation and formal reporting."], "The period becomes a stable historical record.", ["Verification is monthly, not a daily Team Lead approval.", "Later changes require a governed amendment path and audit trail."])
journey("H4. Prepare finance views and payroll export", "HR Manager with finance.cost.view and export permission", "Turn verified time into protected labor-cost and payroll information.", ["Open finance reporting after the period is verified.", "Choose division, project, employee, dates, billability, or overtime filters.", "Review exact money values in BDT using authorized rates and integer minutes.", "Configure the export, confirm sensitive-data handling, and generate the permitted format.", "Use the audit record to trace who produced the output."], "Authorized users receive accurate, reproducible totals and an auditable export.", ["HR receives no automatic cost access from the retired Finance role.", "Unauthorized viewers receive no monetary value at all - not zero and not a blank placeholder.", "Money is calculated in minor units and rounded once at the end."])
journey("H5. Administer leave, WFH, attendance, and evaluations", "HR Manager", "Maintain consistent people operations across divisions.", ["Use WFH and Leave administration to oversee balances, requests, and exceptional overrides.", "Use Attendance to investigate patterns and reconcile approved absences.", "Use Evaluations to manage periods, records, and authorized visibility.", "Use reports to identify organization-level trends without leaking protected detail."], "People operations share one consistent and auditable record.", ["All override actions require authorization and an audit trail."])
story.append(PageBreak())

title("7. Management and administrator journeys")
journey("M1. View organizational performance", "Management / View-Only", "Understand the organization without changing operational data.", ["Open the management dashboard.", "Review authorized attendance, workload, utilization, division, project, and performance summaries.", "Filter by permitted dates and organizational dimensions.", "Open report detail where access is allowed."], "Management can make informed decisions from consistent, protected summaries.", ["No edit, approve, verify, override, delete, create, or export action appears without a separate grant.", "Authorization happens before aggregation, so even counts cannot leak hidden records."])
journey("A1. Configure organization and access", "Super Administrator", "Keep the application aligned with the operating model.", ["Manage divisions and user accounts.", "Assign current roles and fine-grained permissions.", "Configure policies, holidays, and integration settings.", "Enable or disable optional modules using runtime feature flags.", "Review audit records for sensitive administrative actions."], "The product changes safely without code edits for ordinary organizational configuration.", ["The historical finance_manager value remains legal for old records but is not assigned as a current role.", "Feature flags change navigation and route access together."])
journey("A2. Investigate an audit event", "Super Administrator or specifically authorized auditor", "Understand who changed a sensitive record.", ["Open Audit and apply permitted filters.", "Locate the event by actor, record, action, or time.", "Review before/after context and reason when available.", "Follow operational procedures outside the system if remediation is needed."], "A material action can be reconstructed without exposing unrelated protected records.", ["Audit access is itself restricted and audited."])
journey("A3. Use search, documents, and integrations", "Authorized users; administrator configuration", "Find information and connect supporting tools safely.", ["Administrator enables the relevant module.", "User searches only across records they are allowed to see.", "User opens a permitted document through protected access.", "Configured integrations exchange only approved data and record failures safely."], "Supporting capabilities improve findability without bypassing normal authorization.", ["These modules may be disabled in the current demo.", "Search results, file names, empty groups, and response timing must not reveal protected records."], status="Optional modules; feature-flag controlled")
story.append(PageBreak())

title("8. Procurement and expense journeys")
journey("P1. Submit and decide a requisition", "Employee/requester; assigned reviewers", "Request a purchase through a consistent approval path.", ["Requester creates a requisition with purpose, items, amounts, and permitted attachments.", "The shared approval chain routes it to the current responsible reviewer.", "Each reviewer sees only their actionable stage and records a decision.", "The requester follows status and receives notifications until completion."], "The request reaches a final, auditable outcome without skipping stages.", ["Requisition and conveyance use the same approval-chain model so their behavior cannot drift.", "Protected attachments require explicit access."])
journey("P2. Submit and decide conveyance", "Employee/claimant; assigned reviewers", "Claim eligible travel or conveyance costs.", ["Claimant creates the claim with date, route/purpose, exact amount, and permitted evidence.", "The same governed approval chain routes the claim through its stages.", "Reviewers approve or reject within their scope.", "The claimant sees the final status and any required correction."], "The claim is traceable from submission to decision.", ["Amounts are fixed-precision values with a currency code, never floating-point numbers."])

title("9. Reporting journey")
journey("X1. Build a report", "Authorized HR, Management, Team Lead, or Administrator", "Answer a business question with the right scope.", ["Choose a report appropriate to the role.", "Set dates and relevant filters such as division, employee, project, task, status, billability, or overtime.", "Review on-screen totals and drill into permitted detail.", "Export only when the viewer has explicit export permission.", "Retain the report or export according to policy."], "The report matches the same calculations shown in operational screens.", ["Authorization is applied before totals and grouping.", "Durations remain integer-minute based and money remains fixed precision.", "Print and export views preserve labels so status is never color-only."])
story.append(PageBreak())

title("10. Cross-role lifecycle")
p("The complete operating journey is a relay. Each role adds confidence without duplicating responsibility.")
steps([
    "Administrator establishes divisions, users, permissions, policies, holidays, and optional modules.",
    "HR creates employee records and effective assignments; authorized managers create projects and tasks.",
    "Employees record work, submit personal requests, and respond to correction guidance.",
    "Team Leads watch workload and exceptions, decide WFH/leave and employee-raised tasks, and request corrections where necessary.",
    "HR resolves remaining issues, verifies the month, and locks the historical period.",
    "Authorized HR finance capabilities prepare cost/payroll outputs; Management reviews protected trends.",
    "Audit history preserves the chain of responsibility from setup through reporting."
])
h2("What never happens")
bullets([
    "A Team Lead never approves a normal daily timesheet.",
    "A break is never added once per time entry.",
    "An employee is never allowed to work in two recorded places at the same time.",
    "A restricted value is never disguised as zero.",
    "A verified historical record is never silently rewritten after a policy change.",
    "An employee-raised task never accepts time before the current Team Lead endorses it."
])
story.append(PageBreak())

title("11. Product status and stakeholder expectations")
status_rows = [
    ["Area", "Current position", "What this means for a demonstration"],
    ["Frontend", "Core product phases 0-8 and role consolidation are implemented; packaging Phase 9 remains.", "Role-based screens and journeys are available with the established demo data."],
    ["Backend", "Foundations, MySQL schema, authentication/authorization/audit, and organization/projects/tasks phases are complete.", "Later operational modules may still use typed mock services until their backend phases are delivered."],
    ["Finance role", "Merged into HR, with cost visibility retained as a separate per-user permission.", "Choose an HR demo user with the grant when showing monetary reports."],
    ["Optional modules", "Documents, Messages, Global Search, and Integrations default to off through runtime flags.", "Enable deliberately before a demonstration if these journeys are in scope."],
    ["Demo data", "Purpose-built sample organization; demo today is 2 September 2026.", "Use it to explain behavior, not as stakeholder-approved production master data."],
]
t=Table([[Paragraph(f"<b>{c}</b>",styles["Smallx"]) for c in status_rows[0]]] + [[Paragraph(c,styles["Smallx"]) for c in row] for row in status_rows[1:]], colWidths=[30*mm,68*mm,doc.width-98*mm], repeatRows=1)
t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),VIOLET),("TEXTCOLOR",(0,0),(-1,0),WHITE),("GRID",(0,0),(-1,-1),.4,LINE),("VALIGN",(0,0),(-1,-1),"TOP"),("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE,SOFT]),("LEFTPADDING",(0,0),(-1,-1),5),("RIGHTPADDING",(0,0),(-1,-1),5),("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5)])); story.append(t)
h2("Recommended demonstration sequence")
steps([
    "Employee: sign in, add a valid entry, then show how an overlap is prevented.",
    "Employee: open a day and explain Complete, Overtime, and Critical using plain examples.",
    "Employee and Team Lead: raise a task, show Pending review, approve it, then show it becomes available for time.",
    "Team Lead: review exceptions and send a correction request without approving the day.",
    "HR: maintain an assignment, review the month, and demonstrate verification and locking.",
    "Authorized HR: show a protected cost report; then switch to a user without the cost grant to demonstrate safe redaction.",
    "Management: finish with read-only organizational insights and no operational controls."
])
callout("Stakeholder decisions still needed", "Production employee data, division memberships, Team Lead mapping, holiday calendars, schedules, leave balances, initial projects, work-policy approval, payroll periods, cost-rate rules, and payroll-export rules must be confirmed by the business.", colors.HexColor("#FFF4E5"))
story.append(PageBreak())

title("12. Plain-language glossary")
glossary = [
    ["Term", "Meaning"],
    ["Active time", "Minutes spent working. Stored and calculated as whole minutes."],
    ["Break", "One separately recognized break value for the day, not one break per entry."],
    ["Contribution", "The portion of a day's work attributed to a division, project, task, or client label."],
    ["Effective-dated assignment", "An assignment that is valid only between its start date and optional end date."],
    ["Exception", "A record that needs attention, such as missing time, under-time, overtime, critical time, or a conflict."],
    ["Locked period", "A month HR has verified so ordinary edits are no longer allowed."],
    ["Permission grant", "A specific capability given to a person in addition to their general role."],
    ["Restricted", "Information the current viewer is not allowed to receive."],
    ["Runtime feature flag", "A switch that enables or disables a module immediately, including its navigation and route."],
    ["Work date", "The local business date in Asia/Dhaka, retained alongside UTC timestamps and the applied policy version."],
]
t=Table([[Paragraph(f"<b>{c}</b>",styles["Smallx"]) for c in glossary[0]]] + [[Paragraph(c,styles["Smallx"]) for c in row] for row in glossary[1:]], colWidths=[40*mm,doc.width-40*mm], repeatRows=1)
t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),INK),("TEXTCOLOR",(0,0),(-1,0),WHITE),("GRID",(0,0),(-1,-1),.4,LINE),("VALIGN",(0,0),(-1,-1),"TOP"),("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE,SOFT]),("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6),("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5)])); story.append(t)
h2("Source basis")
p("This guide was synthesized from the implemented routes and feature modules, role-journey automation, product requirements, information architecture, demo setup, frontend and backend milestones, architecture notes, service contracts, and project memory. It explains the experience rather than prescribing technical implementation.")
p("Document owner: Product Management | Version: 1.0 | Snapshot: 10 September 2026", "Smallx")

doc.build(story)
print(OUT)
