import type { ConveyanceService } from '@/contracts/conveyance';
import { unavailableService } from './unavailable';

export const conveyanceService = unavailableService<ConveyanceService>('Conveyance operations');
