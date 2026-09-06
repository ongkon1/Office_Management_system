import { z } from 'zod';

const databaseEnvironmentSchema = z.object({
  DATABASE_URL: z.string().url().startsWith('mysql://'),
  DATABASE_POOL_LIMIT: z.coerce.number().int().min(1).max(50).default(10),
});

export type DatabaseEnvironment = z.infer<typeof databaseEnvironmentSchema>;

export function parseDatabaseEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): DatabaseEnvironment {
  return databaseEnvironmentSchema.parse(environment);
}
