import type { Division, Project, Task } from "./domain";

/**
 * Authorized choices for one employee and local work date.
 *
 * This is returned as one snapshot so a task deep link and the cascading
 * division/project/task controls cannot be assembled from different policy
 * or assignment states.
 */
export interface WorkEntryOptions {
  readonly divisions: readonly Division[];
  readonly projects: readonly Project[];
  readonly tasks: readonly Task[];
}
