import type { RequisitionService } from '@/contracts/requisition';
import { unavailableService } from './unavailable';

export const requisitionService = unavailableService<RequisitionService>('Requisition operations');
