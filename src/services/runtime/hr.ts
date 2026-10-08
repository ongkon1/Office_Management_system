import type { HrService } from "@/contracts/hr";
import { serverHrService } from "@/services/server/hr";

/**
 * Tests keep deterministic HR scenarios. Production exposes only operations
 * already backed by MySQL; unfinished operations fail honestly instead of
 * reading fixture records.
 */
export const hrService: HrService = serverHrService;
