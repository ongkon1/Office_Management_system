/**
 * In-memory mock store.
 *
 * Seeded from the deterministic fixtures, then mutated by the services so a
 * demo behaves like a real application within a session. It is the mock
 * equivalent of the database, and nothing above the service layer touches it.
 *
 * The running timer is mirrored into `localStorage` so it survives a refresh,
 * which is what makes the timer-recovery state (`FE-0330`, `REQ-NFR-PERF-004`)
 * demonstrable rather than described.
 */

import type { ConveyanceClaim } from '@/contracts/conveyance';
import type { Requisition } from '@/contracts/requisition';
import type {
  EmployeeDivisionAssignment,
  GeneralRemark,
  Holiday,
  LeaveRequest,
  TimeEntry,
  TimerSession,
  TimesheetPeriod,
  WfhRequest,
} from '@/contracts/domain';
import {
  ASSIGNMENTS,
  CHECKLIST_ITEMS,
  HOLIDAYS,
  LEAVE_REQUESTS,
  PERIODS,
  REMARKS,
  TASKS,
  TIME_ENTRIES,
  WFH_REQUESTS,
  DAY_REASONS,
} from '@/fixtures';
import { REQUISITIONS } from '@/fixtures/requisition';
import { CONVEYANCE_CLAIMS } from '@/fixtures/conveyance';

const TIMER_KEY = 'oms.timer';

interface DayReason {
  overtimeReason?: string;
  criticalExplanation?: string;
}

interface MockState {
  timeEntries: TimeEntry[];
  remarks: GeneralRemark[];
  leaveRequests: LeaveRequest[];
  wfhRequests: WfhRequest[];
  tasks: (typeof TASKS)[number][];
  checklist: (typeof CHECKLIST_ITEMS)[number][];
  dayReasons: Record<string, DayReason>;
  /** Employee id → recognized break override in minutes. Keyed `emp|date`. */
  breakOverrides: Record<string, number>;
  assignments: EmployeeDivisionAssignment[];
  holidays: Holiday[];
  periods: TimesheetPeriod[];
  requisitions: Requisition[];
  conveyanceClaims: ConveyanceClaim[];
  timer: TimerSession | null;
}

function seed(): MockState {
  return {
    timeEntries: [...TIME_ENTRIES],
    remarks: [...REMARKS],
    leaveRequests: [...LEAVE_REQUESTS],
    wfhRequests: [...WFH_REQUESTS],
    tasks: [...TASKS],
    checklist: [...CHECKLIST_ITEMS],
    dayReasons: { ...DAY_REASONS },
    breakOverrides: {},
    assignments: [...ASSIGNMENTS],
    holidays: [...HOLIDAYS],
    periods: [...PERIODS],
    requisitions: [...REQUISITIONS],
    conveyanceClaims: [...CONVEYANCE_CLAIMS],
    timer: null,
  };
}

let state: MockState = seed();

/** Bumped on every mutation so views can re-read after a change. */
let version = 0;
const listeners = new Set<() => void>();

function notify(): void {
  version += 1;
  for (const listener of listeners) listener();
}

function readStoredTimer(): TimerSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TIMER_KEY);
    return raw ? (JSON.parse(raw) as TimerSession) : null;
  } catch {
    return null;
  }
}

function writeStoredTimer(timer: TimerSession | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (timer) window.localStorage.setItem(TIMER_KEY, JSON.stringify(timer));
    else window.localStorage.removeItem(TIMER_KEY);
  } catch {
    // Storage unavailable: the timer degrades to memory-only for this tab.
  }
}

if (typeof window !== 'undefined') {
  state.timer = readStoredTimer();
}

export const mockStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getVersion(): number {
    return version;
  },

  /* --- Time entries ----------------------------------------------------- */

  entriesFor(employeeId: string, workDate: string): TimeEntry[] {
    return state.timeEntries.filter(
      (entry) => entry.employeeId === employeeId && entry.workDate === workDate,
    );
  },

  entriesBetween(employeeId: string, from: string, to: string): TimeEntry[] {
    return state.timeEntries.filter(
      (entry) =>
        entry.employeeId === employeeId &&
        entry.workDate >= from &&
        entry.workDate <= to,
    );
  },

  entriesForTask(taskId: string): TimeEntry[] {
    return state.timeEntries.filter((entry) => entry.taskId === taskId);
  },

  entriesForProject(projectId: string): TimeEntry[] {
    return state.timeEntries.filter((entry) => entry.projectId === projectId);
  },

  allEntries(): readonly TimeEntry[] {
    return state.timeEntries;
  },

  findEntry(id: string): TimeEntry | undefined {
    return state.timeEntries.find((entry) => entry.id === id);
  },

  addEntry(entry: TimeEntry): void {
    state.timeEntries = [...state.timeEntries, entry];
    notify();
  },

  updateEntry(id: string, next: TimeEntry): void {
    state.timeEntries = state.timeEntries.map((entry) =>
      entry.id === id ? next : entry,
    );
    notify();
  },

  removeEntry(id: string): void {
    state.timeEntries = state.timeEntries.filter((entry) => entry.id !== id);
    notify();
  },

  /* --- Day reasons and break overrides ---------------------------------- */

  dayReason(employeeId: string, workDate: string): DayReason {
    return state.dayReasons[`${employeeId}|${workDate}`] ?? {};
  },

  setDayReason(employeeId: string, workDate: string, reason: DayReason): void {
    const key = `${employeeId}|${workDate}`;
    const existing = state.dayReasons[key] ?? {};
    state.dayReasons = {
      ...state.dayReasons,
      [key]: { ...existing, ...reason },
    };
    notify();
  },

  breakOverride(employeeId: string, workDate: string): number | null {
    const value = state.breakOverrides[`${employeeId}|${workDate}`];
    return value === undefined ? null : value;
  },

  setBreakOverride(employeeId: string, workDate: string, minutes: number): void {
    state.breakOverrides = {
      ...state.breakOverrides,
      [`${employeeId}|${workDate}`]: minutes,
    };
    notify();
  },

  /* --- Assignments, holidays and periods --------------------------------- */

  /**
   * These three live here rather than staying constant because HR mutates them
   * (`FE-0505`, `FE-0513`, `FE-0520`) and the daily calculation reads them. A
   * new assignment must immediately widen which divisions accept time, and
   * verifying a period must immediately lock its dates — that only holds if
   * both sides read the same state.
   */
  assignments(): readonly EmployeeDivisionAssignment[] {
    return state.assignments;
  },

  addAssignment(assignment: EmployeeDivisionAssignment): void {
    state.assignments = [...state.assignments, assignment];
    notify();
  },

  updateAssignment(id: string, next: EmployeeDivisionAssignment): void {
    state.assignments = state.assignments.map((assignment) =>
      assignment.id === id ? next : assignment,
    );
    notify();
  },

  holidays(): readonly Holiday[] {
    return state.holidays;
  },

  addHoliday(holiday: Holiday): void {
    state.holidays = [...state.holidays, holiday];
    notify();
  },

  updateHoliday(id: string, next: Holiday): void {
    state.holidays = state.holidays.map((holiday) => (holiday.id === id ? next : holiday));
    notify();
  },

  periods(): readonly TimesheetPeriod[] {
    return state.periods;
  },

  findPeriod(id: string): TimesheetPeriod | undefined {
    return state.periods.find((period) => period.id === id);
  },

  updatePeriod(id: string, next: TimesheetPeriod): void {
    state.periods = state.periods.map((period) => (period.id === id ? next : period));
    notify();
  },

  /** True when the date falls inside a verified or amended period (`REQ-TIME-027`). */
  isDateLocked(date: string): boolean {
    return state.periods.some(
      (period) =>
        (period.status === 'verified' || period.status === 'amended') &&
        date >= period.startDate &&
        date <= period.endDate,
    );
  },

  /* --- Timer ------------------------------------------------------------- */

  getTimer(): TimerSession | null {
    return state.timer;
  },

  setTimer(timer: TimerSession | null): void {
    state.timer = timer;
    writeStoredTimer(timer);
    notify();
  },

  /* --- Tasks ------------------------------------------------------------- */

  tasks(): readonly (typeof TASKS)[number][] {
    return state.tasks;
  },

  findTask(id: string) {
    return state.tasks.find((task) => task.id === id);
  },

  updateTask(id: string, next: (typeof TASKS)[number]): void {
    state.tasks = state.tasks.map((task) => (task.id === id ? next : task));
    notify();
  },

  addTask(task: (typeof TASKS)[number]): void {
    state.tasks = [...state.tasks, task];
    notify();
  },

  checklistFor(taskId: string) {
    return state.checklist.filter((item) => item.taskId === taskId);
  },

  setChecklistItem(itemId: string, isDone: boolean): void {
    state.checklist = state.checklist.map((item) =>
      item.id === itemId ? { ...item, isDone } : item,
    );
    notify();
  },

  replaceChecklist(taskId: string, labels: readonly string[]): void {
    state.checklist = [
      ...state.checklist.filter((item) => item.taskId !== taskId),
      ...labels.map((label, index) => ({
        id: `chk-${taskId}-${index + 1}`,
        taskId,
        label,
        isDone: false,
        order: index + 1,
      })),
    ];
    notify();
  },

  /* --- Remarks ----------------------------------------------------------- */

  remarksFor(employeeId: string): GeneralRemark[] {
    return state.remarks.filter((remark) => remark.employeeId === employeeId);
  },

  findRemark(id: string): GeneralRemark | undefined {
    return state.remarks.find((remark) => remark.id === id);
  },

  updateRemark(id: string, next: GeneralRemark): void {
    state.remarks = state.remarks.map((remark) => (remark.id === id ? next : remark));
    notify();
  },

  addRemark(remark: GeneralRemark): void {
    state.remarks = [...state.remarks, remark];
    notify();
  },

  /* --- Leave and WFH ----------------------------------------------------- */

  leaveFor(employeeId: string): LeaveRequest[] {
    return state.leaveRequests.filter((request) => request.employeeId === employeeId);
  },

  approvedLeaveOn(employeeId: string, date: string): LeaveRequest | undefined {
    return state.leaveRequests.find(
      (request) =>
        request.employeeId === employeeId &&
        request.state === 'approved' &&
        date >= request.startDate &&
        date <= request.endDate,
    );
  },

  wfhFor(employeeId: string): WfhRequest[] {
    return state.wfhRequests.filter((request) => request.employeeId === employeeId);
  },

  allLeaveRequests(): readonly LeaveRequest[] {
    return state.leaveRequests;
  },

  allWfhRequests(): readonly WfhRequest[] {
    return state.wfhRequests;
  },

  addLeaveRequest(request: LeaveRequest): void {
    state.leaveRequests = [...state.leaveRequests, request];
    notify();
  },

  addWfhRequest(request: WfhRequest): void {
    state.wfhRequests = [...state.wfhRequests, request];
    notify();
  },

  updateLeaveRequest(id: string, next: LeaveRequest): void {
    state.leaveRequests = state.leaveRequests.map((request) =>
      request.id === id ? next : request,
    );
    notify();
  },

  updateWfhRequest(id: string, next: WfhRequest): void {
    state.wfhRequests = state.wfhRequests.map((request) =>
      request.id === id ? next : request,
    );
    notify();
  },

  approvedWfhOn(employeeId: string, date: string): WfhRequest | undefined {
    return state.wfhRequests.find(
      (request) =>
        request.employeeId === employeeId &&
        request.state === 'approved' &&
        request.wfhDate === date,
    );
  },

  /* --- Requisitions ------------------------------------------------------ */

  requisitions(): readonly Requisition[] {
    return state.requisitions;
  },

  findRequisition(id: string): Requisition | undefined {
    return state.requisitions.find((requisition) => requisition.id === id);
  },

  addRequisition(requisition: Requisition): void {
    state.requisitions = [requisition, ...state.requisitions];
    notify();
  },

  updateRequisition(id: string, next: Requisition): void {
    state.requisitions = state.requisitions.map((requisition) =>
      requisition.id === id ? next : requisition,
    );
    notify();
  },

  /* --- Conveyance --------------------------------------------------------- */

  conveyanceClaims(): readonly ConveyanceClaim[] {
    return state.conveyanceClaims;
  },

  findConveyanceClaim(id: string): ConveyanceClaim | undefined {
    return state.conveyanceClaims.find((claim) => claim.id === id);
  },

  addConveyanceClaim(claim: ConveyanceClaim): void {
    state.conveyanceClaims = [claim, ...state.conveyanceClaims];
    notify();
  },

  updateConveyanceClaim(id: string, next: ConveyanceClaim): void {
    state.conveyanceClaims = state.conveyanceClaims.map((claim) =>
      claim.id === id ? next : claim,
    );
    notify();
  },

  /** Test seam: restores the fixture state. */
  reset(): void {
    state = seed();
    writeStoredTimer(null);
    notify();
  },
};
