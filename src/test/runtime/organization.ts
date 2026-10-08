export {
  ALL_DIVISIONS,
  effectiveDivisionIds,
  selectableProjects,
  selectableTasks,
} from "@/services/mock/organization";

import { success } from "@/contracts/results";
import {
  ALL_DIVISIONS,
  effectiveDivisionIds,
  selectableProjects,
  selectableTasks,
} from "@/services/mock/organization";

export const organizationService = {
  async getWorkEntryOptions(employeeId: string, workDate: string) {
    const divisionIds = effectiveDivisionIds(employeeId, workDate);
    const divisions = ALL_DIVISIONS.filter((item) =>
      divisionIds.includes(item.id),
    );
    const projects = divisions.flatMap((item) => selectableProjects(item.id));
    const projectIds = new Set(projects.map((item) => item.id));
    const tasks = projects
      .flatMap((item) => selectableTasks(item.id))
      .filter(
        (item) =>
          projectIds.has(item.projectId) &&
          (item.assigneeEmployeeId === employeeId ||
            item.supportingMemberIds.includes(employeeId)),
      );
    return success({ divisions, projects, tasks });
  },
};
