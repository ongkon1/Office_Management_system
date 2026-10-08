import type { TeamLeadService } from "@/contracts/team-lead";
import { serverOperationsTeamLeadService } from "@/services/server/operations";

export const teamLeadService: TeamLeadService = serverOperationsTeamLeadService;
