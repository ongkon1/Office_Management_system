import type { TaskCategory, TaskCategoryCommand } from '@/contracts/task-categories';
import { serverPost } from './http';

export const taskCategories = (command: TaskCategoryCommand) =>
  serverPost<readonly TaskCategory[]>('/api/task-categories', command);
