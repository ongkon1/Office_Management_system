import type { Pool } from "mysql2/promise";
import { createHrServices } from "@/server/hr/composition";
import { createTimeServices } from "@/server/time/composition";
import { OperationsService } from "./service";
export function createOperationsService(pool: Pool, token: string) {
  return new OperationsService(
    pool,
    token,
    createHrServices(pool, token),
    createTimeServices(pool, token),
  );
}
