import { bigint, datetime, int, varchar } from 'drizzle-orm/mysql-core';

export const idColumn = () => varchar({ length: 36 });
export const versionColumn = () => int({ unsigned: true }).notNull().default(1);
export const utcDateTimeColumn = () => datetime({ mode: 'string', fsp: 6 });
export const durationMinutesColumn = () => int({ unsigned: true });
export const sequenceColumn = () => bigint({ mode: 'number', unsigned: true }).autoincrement();
