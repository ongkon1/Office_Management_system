/**
 * Development-only reset orchestration (`FE-0904`).
 *
 * Every mutable mock adapter is restored from its deterministic fixture seed.
 * Keeping this in the mock composition layer prevents the demo UI from knowing
 * how individual services store their data.
 */

import { resetAdminState } from './admin';
import { resetConveyanceState } from './conveyance';
import { resetFinanceState } from './finance';
import { resetHrState } from './hr';
import { resetReportingState } from './reporting';
import { resetRequisitionState } from './requisition';
import { mockStore } from './store';
import { resetTaskReviewState } from './task-review';
import { resetWorkspaceState } from './workspace';

export function resetDemoData(): void {
  mockStore.reset();
  resetAdminState();
  resetConveyanceState();
  resetFinanceState();
  resetHrState();
  resetReportingState();
  resetRequisitionState();
  resetTaskReviewState();
  resetWorkspaceState();
}
