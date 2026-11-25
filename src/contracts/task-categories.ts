export interface TaskCategory {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
}

export type TaskCategoryCommand =
  | { readonly action: 'list'; readonly includeArchived?: boolean }
  | { readonly action: 'create'; readonly name: string }
  | { readonly action: 'rename'; readonly id: string; readonly name: string }
  | { readonly action: 'setActive'; readonly id: string; readonly isActive: boolean };
