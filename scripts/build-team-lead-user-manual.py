from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "team_lead_user_manual.pdf"

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm

INK = HexColor("#18192B")
TEXT = HexColor("#475569")
MUTED = HexColor("#64748B")
LINE = HexColor("#E5E7EB")
SOFT = HexColor("#F7F6FF")
VIOLET = HexColor("#6C63FF")
VIOLET_DARK = HexColor("#5B52E6")
VIOLET_PALE = HexColor("#EEECFF")
PINK = HexColor("#FF3C7E")
GREEN = HexColor("#16803A")
GREEN_PALE = HexColor("#ECFDF3")
AMBER = HexColor("#B45309")
AMBER_PALE = HexColor("#FFF7E8")
RED = HexColor("#C62828")
RED_PALE = HexColor("#FFF1F2")
BLUE = HexColor("#0369A1")
BLUE_PALE = HexColor("#EFF8FF")


def register_fonts():
    candidates = [
        ("Manual", "C:/Windows/Fonts/arial.ttf"),
        ("Manual-Bold", "C:/Windows/Fonts/arialbd.ttf"),
    ]
    for name, path in candidates:
        if Path(path).exists():
            pdfmetrics.registerFont(TTFont(name, path))
    return "Manual" if "Manual" in pdfmetrics.getRegisteredFontNames() else "Helvetica"


FONT = register_fonts()
BOLD = "Manual-Bold" if "Manual-Bold" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold"


def style(size=10, color=TEXT, leading=None, bold=False, align=TA_LEFT):
    return ParagraphStyle(
        name=f"s-{size}-{bold}-{align}",
        fontName=BOLD if bold else FONT,
        fontSize=size,
        leading=leading or size * 1.38,
        textColor=color,
        alignment=align,
        spaceAfter=0,
        spaceBefore=0,
    )


def paragraph(c, text, x, y_top, width, size=10, color=TEXT, leading=None, bold=False, align=TA_LEFT):
    p = Paragraph(text, style(size, color, leading, bold, align))
    _, height = p.wrap(width, PAGE_H)
    p.drawOn(c, x, y_top - height)
    return height


def round_rect(c, x, y, w, h, fill=white, stroke=LINE, radius=4 * mm, line=0.7):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(line)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def brand(c):
    c.setFillColor(VIOLET)
    c.roundRect(MARGIN, PAGE_H - 25 * mm, 13 * mm, 13 * mm, 3.5 * mm, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont(BOLD, 15)
    c.drawCentredString(MARGIN + 6.5 * mm, PAGE_H - 20.7 * mm, "T")
    c.setFillColor(INK)
    c.setFont(BOLD, 13)
    c.drawString(MARGIN + 17 * mm, PAGE_H - 19 * mm, "PowerInAI Timesheet")
    c.setFillColor(VIOLET_DARK)
    c.setFont(BOLD, 8)
    c.drawString(MARGIN + 17 * mm, PAGE_H - 23.5 * mm, "TEAM LEAD GUIDE  |  BETA")


def footer(c, page_no, total=11):
    c.setStrokeColor(LINE)
    c.setLineWidth(0.5)
    c.line(MARGIN, 14 * mm, PAGE_W - MARGIN, 14 * mm)
    c.setFillColor(MUTED)
    c.setFont(FONT, 7.5)
    c.drawString(MARGIN, 9.5 * mm, "Team Lead User Manual")
    c.drawRightString(PAGE_W - MARGIN, 9.5 * mm, f"Page {page_no} of {total}")


def page_header(c, page_no, title, subtitle):
    brand(c)
    paragraph(c, title, MARGIN, PAGE_H - 37 * mm, PAGE_W - 2 * MARGIN, 23, INK, 28, True)
    paragraph(c, subtitle, MARGIN, PAGE_H - 48 * mm, PAGE_W - 2 * MARGIN, 10.5, TEXT, 15)
    footer(c, page_no)


def label(c, x, y, text, fill=VIOLET_PALE, color=VIOLET_DARK):
    w = c.stringWidth(text, BOLD, 7.5) + 7 * mm
    c.setFillColor(fill)
    c.roundRect(x, y - 4.5 * mm, w, 7 * mm, 3.5 * mm, fill=1, stroke=0)
    c.setFillColor(color)
    c.setFont(BOLD, 7.5)
    c.drawString(x + 3.5 * mm, y - 2 * mm, text)
    return w


def step_card(c, number, title, body, x, y_top, width, height=25 * mm, tone=VIOLET):
    round_rect(c, x, y_top - height, width, height, white, LINE)
    c.setFillColor(tone)
    c.circle(x + 9 * mm, y_top - 9 * mm, 4.8 * mm, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont(BOLD, 9)
    c.drawCentredString(x + 9 * mm, y_top - 10.5 * mm, str(number))
    paragraph(c, title, x + 18 * mm, y_top - 5 * mm, width - 23 * mm, 11, INK, 14, True)
    paragraph(c, body, x + 18 * mm, y_top - 12 * mm, width - 23 * mm, 8.8, TEXT, 12)


def bullet_list(c, items, x, y_top, width, size=9.5, gap=5.5 * mm, color=TEXT):
    y = y_top
    for item in items:
        c.setFillColor(VIOLET)
        c.circle(x + 1.5 * mm, y - 2.7 * mm, 1.2 * mm, fill=1, stroke=0)
        h = paragraph(c, item, x + 6 * mm, y, width - 6 * mm, size, color, size * 1.4)
        y -= max(h, gap)
    return y


def callout(c, title, body, x, y_top, width, height=24 * mm, fill=BLUE_PALE, accent=BLUE):
    round_rect(c, x, y_top - height, width, height, fill, fill)
    c.setFillColor(accent)
    c.roundRect(x, y_top - height, 2.5 * mm, height, 1.2 * mm, fill=1, stroke=0)
    paragraph(c, title, x + 8 * mm, y_top - 5 * mm, width - 13 * mm, 9.5, INK, 12, True)
    paragraph(c, body, x + 8 * mm, y_top - 12 * mm, width - 13 * mm, 8.5, TEXT, 11.5)


def menu_row(c, name, purpose, x, y, width):
    c.setStrokeColor(LINE)
    c.line(x, y - 2 * mm, x + width, y - 2 * mm)
    c.setFillColor(VIOLET_PALE)
    c.circle(x + 5 * mm, y + 3.5 * mm, 3.5 * mm, fill=1, stroke=0)
    c.setFillColor(VIOLET_DARK)
    c.setFont(BOLD, 7)
    c.drawCentredString(x + 5 * mm, y + 2 * mm, name[0])
    paragraph(c, name, x + 12 * mm, y + 7 * mm, 42 * mm, 9.3, INK, 12, True)
    paragraph(c, purpose, x + 55 * mm, y + 7 * mm, width - 55 * mm, 8.7, TEXT, 12)


def cover(c):
    c.setFillColor(SOFT)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(VIOLET)
    c.circle(PAGE_W - 20 * mm, PAGE_H - 17 * mm, 35 * mm, fill=1, stroke=0)
    c.setFillColor(PINK)
    c.circle(PAGE_W - 7 * mm, 40 * mm, 23 * mm, fill=1, stroke=0)
    c.setFillColor(white)
    c.circle(PAGE_W - 12 * mm, 45 * mm, 18 * mm, fill=1, stroke=0)

    c.setFillColor(VIOLET)
    c.roundRect(MARGIN, PAGE_H - 58 * mm, 18 * mm, 18 * mm, 5 * mm, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont(BOLD, 22)
    c.drawCentredString(MARGIN + 9 * mm, PAGE_H - 52.3 * mm, "T")
    c.setFillColor(INK)
    c.setFont(BOLD, 14)
    c.drawString(MARGIN + 23 * mm, PAGE_H - 49 * mm, "PowerInAI Timesheet")
    label(c, MARGIN + 23 * mm, PAGE_H - 55 * mm, "BETA")

    paragraph(c, "Team Lead<br/>User Manual", MARGIN, PAGE_H - 87 * mm, 130 * mm, 34, INK, 38, True)
    paragraph(c, "A simple, step-by-step guide for managing your own work and supporting your team.", MARGIN, PAGE_H - 127 * mm, 128 * mm, 13, TEXT, 19)

    round_rect(c, MARGIN, 63 * mm, 118 * mm, 35 * mm, white, LINE, 5 * mm)
    paragraph(c, "This guide helps you:", MARGIN + 8 * mm, 91 * mm, 100 * mm, 10, INK, 13, True)
    bullet_list(c, [
        "Check team progress and time exceptions",
        "Manage tasks, requests, workload, and evaluations",
        "Record your own work as a Team Lead",
    ], MARGIN + 8 * mm, 83 * mm, 100 * mm, 8.8, 6 * mm)

    c.setFillColor(MUTED)
    c.setFont(FONT, 8)
    c.drawString(MARGIN, 24 * mm, "Plain-language edition  |  October 2026")
    c.setFillColor(INK)
    c.setFont(BOLD, 9)
    c.drawString(MARGIN, 18 * mm, "For Team Leads only")


def quick_start(c):
    page_header(c, 2, "Start here", "You can learn the main Team Lead tasks in a few minutes.")
    y = PAGE_H - 64 * mm
    step_card(c, 1, "Sign in", "Open the login page. Enter your work email or employee ID and your password.", MARGIN, y, PAGE_W - 2 * MARGIN)
    y -= 30 * mm
    step_card(c, 2, "Open your dashboard", "Use the dashboard to see team activity, exceptions, requests, and workload warnings.", MARGIN, y, PAGE_W - 2 * MARGIN)
    y -= 30 * mm
    step_card(c, 3, "Check items that need attention", "Review time exceptions, pending requests, overdue tasks, and overloaded team members.", MARGIN, y, PAGE_W - 2 * MARGIN)
    y -= 30 * mm
    step_card(c, 4, "Complete your own work", "You are also an employee. Use My Tasks and My Timesheet for your personal work.", MARGIN, y, PAGE_W - 2 * MARGIN)
    y -= 32 * mm
    callout(c, "Demo account", "For development or demonstration only: use the Team Lead account shown on the login page. Demo accounts use password <b>Demo1234!</b>.", MARGIN, y, PAGE_W - 2 * MARGIN, 25 * mm, AMBER_PALE, AMBER)


def navigation(c):
    page_header(c, 3, "Know the menu", "The left menu is your shortcut to every part of the system.")
    x = MARGIN
    y = PAGE_H - 65 * mm
    w = PAGE_W - 2 * MARGIN
    rows = [
        ("Dashboard", "Your daily overview and items that need attention."),
        ("My Team", "Employees you are allowed to support."),
        ("Team Timesheets", "Team time records, exceptions, remarks, and corrections."),
        ("Projects", "Projects you are allowed to manage."),
        ("Tasks", "Team tasks, assignments, progress, and due dates."),
        ("Workload", "Planned work compared with available team capacity."),
        ("Requests", "WFH and leave requests waiting for your decision."),
        ("Evaluations", "Employee performance review work assigned to you."),
        ("Reports", "Team and project information you are allowed to view."),
        ("My Timesheet", "Your own daily work entries."),
    ]
    round_rect(c, x, 45 * mm, w, 180 * mm, white, LINE, 5 * mm)
    for i, row in enumerate(rows):
        menu_row(c, row[0], row[1], x + 7 * mm, y - i * 16 * mm, w - 14 * mm)
    callout(c, "What you can see", "You only see employees, divisions, projects, and records that are inside your assigned responsibility.", MARGIN, 38 * mm, w, 20 * mm, VIOLET_PALE, VIOLET_DARK)


def dashboard(c):
    page_header(c, 4, "Use the Team Lead dashboard", "Start each day here. Focus on the items that need action first.")
    left = MARGIN
    gap = 8 * mm
    card_w = (PAGE_W - 2 * MARGIN - gap) / 2
    cards = [
        ("1", "Team today", "See who is working and whether anyone has a time exception."),
        ("2", "Requests", "Open pending WFH or leave requests and make a decision."),
        ("3", "Tasks", "Check overdue, upcoming, and recently completed team tasks."),
        ("4", "Workload", "Look for people who have too much or too little planned work."),
        ("5", "Projects", "Review progress for projects you manage."),
        ("6", "Evaluations", "See reviews that are waiting for your input."),
    ]
    y = PAGE_H - 67 * mm
    for i, (num, title, body) in enumerate(cards):
        col = i % 2
        row = i // 2
        x = left + col * (card_w + gap)
        top = y - row * 48 * mm
        round_rect(c, x, top - 39 * mm, card_w, 39 * mm, white, LINE, 4 * mm)
        c.setFillColor(VIOLET_PALE)
        c.circle(x + 10 * mm, top - 10 * mm, 5 * mm, fill=1, stroke=0)
        c.setFillColor(VIOLET_DARK)
        c.setFont(BOLD, 10)
        c.drawCentredString(x + 10 * mm, top - 11.5 * mm, num)
        paragraph(c, title, x + 19 * mm, top - 6 * mm, card_w - 25 * mm, 11, INK, 14, True)
        paragraph(c, body, x + 8 * mm, top - 20 * mm, card_w - 16 * mm, 9, TEXT, 12.5)
    callout(c, "Simple daily habit", "Open the dashboard in the morning, check requests and exceptions, then review workload before assigning new tasks.", MARGIN, 60 * mm, PAGE_W - 2 * MARGIN, 24 * mm, GREEN_PALE, GREEN)


def team_page(c):
    page_header(c, 5, "Find and support a team member", "Use My Team to find the right person and open their work details.")
    y = PAGE_H - 65 * mm
    step_card(c, 1, "Open My Team", "The list contains only employees within your Team Lead responsibility.", MARGIN, y, PAGE_W - 2 * MARGIN)
    y -= 31 * mm
    step_card(c, 2, "Use the filters", "Filter by department, division, or name. Clear filters when you want to see the full list again.", MARGIN, y, PAGE_W - 2 * MARGIN)
    y -= 31 * mm
    step_card(c, 3, "Open the employee", "Select a person to view their tasks, recent work, attendance information, and workload that you are allowed to see.", MARGIN, y, PAGE_W - 2 * MARGIN)
    y -= 37 * mm
    callout(c, "Department scope", "Being a department lead gives you access to that department's employees. It does not automatically give access to every employee in the division.", MARGIN, y, PAGE_W - 2 * MARGIN, 27 * mm, BLUE_PALE, BLUE)
    y -= 36 * mm
    callout(c, "Respect privacy", "Use employee information only for work. Do not share personal, evaluation, salary, or restricted information with unauthorized people.", MARGIN, y, PAGE_W - 2 * MARGIN, 27 * mm, RED_PALE, RED)


def timesheets(c):
    page_header(c, 6, "Review team timesheets", "You review exceptions and request corrections. You do not approve daily timesheets.")
    y = PAGE_H - 65 * mm
    step_card(c, 1, "Open Team Timesheets", "Choose an employee and date, or use the filters to find an exception.", MARGIN, y, PAGE_W - 2 * MARGIN)
    y -= 30 * mm
    step_card(c, 2, "Read the daily summary", "Check active work, the separate break, daily total, task details, and the day status.", MARGIN, y, PAGE_W - 2 * MARGIN)
    y -= 30 * mm
    step_card(c, 3, "Add a general remark", "Use one clear remark when you only need to leave a helpful comment for the employee.", MARGIN, y, PAGE_W - 2 * MARGIN)
    y -= 30 * mm
    step_card(c, 4, "Request a correction when needed", "Choose the exact work entry, explain what should be corrected, preview, and send the request.", MARGIN, y, PAGE_W - 2 * MARGIN)
    y -= 34 * mm
    callout(c, "Important", "There is no daily Team Lead approval. HR verifies and locks payroll periods. Your job is to review exceptions and help employees correct mistakes.", MARGIN, y, PAGE_W - 2 * MARGIN, 28 * mm, AMBER_PALE, AMBER)


def statuses(c):
    page_header(c, 7, "Understand daily time status", "The system uses active work plus one separate break for the day.")
    round_rect(c, MARGIN, PAGE_H - 112 * mm, PAGE_W - 2 * MARGIN, 50 * mm, SOFT, LINE, 5 * mm)
    paragraph(c, "A normal complete day", MARGIN + 8 * mm, PAGE_H - 71 * mm, 70 * mm, 10, INK, 13, True)
    paragraph(c, "7:00", MARGIN + 8 * mm, PAGE_H - 84 * mm, 40 * mm, 26, VIOLET_DARK, 30, True)
    paragraph(c, "active work", MARGIN + 8 * mm, PAGE_H - 96 * mm, 40 * mm, 8.5, MUTED, 11)
    paragraph(c, "+ 1:00", MARGIN + 70 * mm, PAGE_H - 84 * mm, 40 * mm, 26, BLUE, 30, True)
    paragraph(c, "separate break", MARGIN + 70 * mm, PAGE_H - 96 * mm, 45 * mm, 8.5, MUTED, 11)
    paragraph(c, "= 8:00", MARGIN + 132 * mm, PAGE_H - 84 * mm, 42 * mm, 26, GREEN, 30, True)
    paragraph(c, "daily total", MARGIN + 132 * mm, PAGE_H - 96 * mm, 40 * mm, 8.5, MUTED, 11)

    y = PAGE_H - 128 * mm
    entries = [
        ("Missing", "No work is recorded for a required workday.", RED_PALE, RED),
        ("Under-time", "Active work or the full daily total is below the required amount.", AMBER_PALE, AMBER),
        ("Complete", "Both the active-work and total-time requirements are met.", GREEN_PALE, GREEN),
        ("Overtime", "The total is above 8:00 and up to exactly 12:00. A reason is required.", BLUE_PALE, BLUE),
        ("Critical", "The total is above 12:00. An explanation is required and Team Lead plus HR are notified.", RED_PALE, RED),
    ]
    for title, body, fill, color in entries:
        round_rect(c, MARGIN, y - 22 * mm, PAGE_W - 2 * MARGIN, 18 * mm, fill, fill, 3 * mm)
        paragraph(c, title, MARGIN + 7 * mm, y - 6 * mm, 33 * mm, 9.5, color, 12, True)
        paragraph(c, body, MARGIN + 42 * mm, y - 5 * mm, PAGE_W - 2 * MARGIN - 49 * mm, 8.6, TEXT, 11.5)
        y -= 24 * mm


def tasks(c):
    page_header(c, 8, "Manage team tasks", "Tasks move through three simple stages: Pending, In Progress, and Completed.")
    x = MARGIN
    y = PAGE_H - 67 * mm
    w = PAGE_W - 2 * MARGIN
    stages = [
        ("Pending", "Assigned but not started. Time cannot be recorded yet.", AMBER_PALE, AMBER),
        ("In Progress", "Work has started. The assigned person can record actual hours.", BLUE_PALE, BLUE),
        ("Completed", "The work is finished. No more time can be added unless it is reopened.", GREEN_PALE, GREEN),
    ]
    card_w = (w - 10 * mm) / 3
    for i, (title, body, fill, tone) in enumerate(stages):
        cx = x + i * (card_w + 5 * mm)
        round_rect(c, cx, y - 55 * mm, card_w, 55 * mm, fill, fill, 4 * mm)
        label(c, cx + 6 * mm, y - 9 * mm, title, white, tone)
        paragraph(c, body, cx + 6 * mm, y - 23 * mm, card_w - 12 * mm, 9, TEXT, 13)
    y -= 70 * mm
    paragraph(c, "Your basic task routine", MARGIN, y, w, 13, INK, 16, True)
    y -= 10 * mm
    bullet_list(c, [
        "Create a task with a clear title, assignee, due date, and estimated hours.",
        "Assign it only to someone you are allowed to manage.",
        "Check progress and due dates without changing the employee's recorded time.",
        "Use a note when helpful. Reopening a completed task always needs a reason.",
        "Remember: moving a task does not add work hours. Actual hours are recorded separately.",
    ], MARGIN, y, w, 9.4, 8 * mm)
    callout(c, "Overdue and Upcoming", "These are helpful filters, not extra task stages. The stored stages remain Pending, In Progress, and Completed.", MARGIN, 56 * mm, w, 23 * mm, VIOLET_PALE, VIOLET_DARK)


def personal_work(c):
    page_header(c, 9, "Do your own work", "A Team Lead still uses the employee tools for personal tasks and time.")
    y = PAGE_H - 66 * mm
    step_card(c, 1, "Create a task for yourself", "When creating a task, choose <b>Self (me)</b> as the assignee. It does not need approval.", MARGIN, y, PAGE_W - 2 * MARGIN)
    y -= 31 * mm
    step_card(c, 2, "Move it to In Progress", "A Pending task does not accept work time. Start the task before adding actual hours.", MARGIN, y, PAGE_W - 2 * MARGIN)
    y -= 31 * mm
    step_card(c, 3, "Record actual time", "Open My Timesheet. Choose the division, project, and task. Enter the duration, location, and work details, then save.", MARGIN, y, PAGE_W - 2 * MARGIN)
    y -= 31 * mm
    step_card(c, 4, "Complete the task", "After the work is finished, move the task to Completed. You may add an optional completion note.", MARGIN, y, PAGE_W - 2 * MARGIN)
    y -= 35 * mm
    callout(c, "How time is entered", "Enter the duration, such as <b>1:30</b>. You do not need a start time or end time. Saved time is recorded immediately, without creating a draft.", MARGIN, y, PAGE_W - 2 * MARGIN, 27 * mm, GREEN_PALE, GREEN)


def requests(c):
    page_header(c, 10, "Review WFH and leave requests", "Read the request carefully, then choose one clear action.")
    y = PAGE_H - 66 * mm
    step_card(c, 1, "Open Requests", "Use the request type and status filters to find items waiting for you.", MARGIN, y, PAGE_W - 2 * MARGIN)
    y -= 31 * mm
    step_card(c, 2, "Check the details", "Read the dates, reason, employee, work impact, and any supporting information.", MARGIN, y, PAGE_W - 2 * MARGIN)
    y -= 31 * mm
    step_card(c, 3, "Choose a decision", "Approve, Reject, or Request information. Add a useful note so the employee understands the result.", MARGIN, y, PAGE_W - 2 * MARGIN)
    y -= 31 * mm
    step_card(c, 4, "Confirm", "Review your decision before sending. The employee is notified after the action is saved.", MARGIN, y, PAGE_W - 2 * MARGIN)
    y -= 36 * mm
    round_rect(c, MARGIN, y - 42 * mm, PAGE_W - 2 * MARGIN, 42 * mm, white, LINE, 4 * mm)
    paragraph(c, "When is a note required?", MARGIN + 8 * mm, y - 7 * mm, 60 * mm, 10, INK, 13, True)
    bullet_list(c, [
        "Approve: a note is optional.",
        "Reject: explain the reason.",
        "Request information: explain what is missing.",
    ], MARGIN + 8 * mm, y - 17 * mm, PAGE_W - 2 * MARGIN - 16 * mm, 9, 6.5 * mm)


def workload_evaluations(c):
    page_header(c, 11, "Workload, evaluations, and help", "Use these tools regularly to keep work balanced and records clear.")
    half = (PAGE_W - 2 * MARGIN - 8 * mm) / 2
    top = PAGE_H - 66 * mm
    round_rect(c, MARGIN, top - 82 * mm, half, 82 * mm, white, LINE, 4 * mm)
    paragraph(c, "Workload", MARGIN + 8 * mm, top - 8 * mm, half - 16 * mm, 13, INK, 16, True)
    bullet_list(c, [
        "Compare planned hours with available capacity.",
        "Use filters to focus on a department or project.",
        "Check warnings before adding more work.",
        "Move or reschedule work when the plan is not realistic.",
    ], MARGIN + 8 * mm, top - 22 * mm, half - 16 * mm, 9, 10 * mm)

    rx = MARGIN + half + 8 * mm
    round_rect(c, rx, top - 82 * mm, half, 82 * mm, white, LINE, 4 * mm)
    paragraph(c, "Evaluations", rx + 8 * mm, top - 8 * mm, half - 16 * mm, 13, INK, 16, True)
    bullet_list(c, [
        "Open the review assigned to you.",
        "Read the work facts shown by the system.",
        "Score only the defined areas and add clear comments.",
        "Submit the review for HR when it is complete.",
    ], rx + 8 * mm, top - 22 * mm, half - 16 * mm, 9, 10 * mm)

    y = top - 96 * mm
    paragraph(c, "Before you finish for the day", MARGIN, y, PAGE_W - 2 * MARGIN, 13, INK, 16, True)
    y -= 10 * mm
    bullet_list(c, [
        "Check pending requests and urgent time exceptions.",
        "Review overdue tasks and workload warnings.",
        "Record your own actual work in My Timesheet.",
        "Read notifications for new actions or corrections.",
        "Sign out when using a shared computer.",
    ], MARGIN, y, PAGE_W - 2 * MARGIN, 9.4, 8 * mm)
    callout(c, "Need help?", "First refresh the page and check your filters. If the problem remains, note what you were doing and contact your HR team or system administrator.", MARGIN, 51 * mm, PAGE_W - 2 * MARGIN, 25 * mm, BLUE_PALE, BLUE)


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = Canvas(str(OUTPUT), pagesize=A4, pageCompression=1)
    c.setTitle("Team Lead User Manual")
    c.setAuthor("PowerInAI")
    c.setSubject("Simple non-technical guide for Team Leads")

    pages = [cover, quick_start, navigation, dashboard, team_page, timesheets, statuses, tasks, personal_work, requests, workload_evaluations]
    for draw in pages:
        draw(c)
        c.showPage()
    c.save()
    print(OUTPUT)


if __name__ == "__main__":
    build()
