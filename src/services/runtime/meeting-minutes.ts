import type { MeetingMinutesService } from '@/contracts/meeting-minutes';
import { unavailableService } from './unavailable';

export const meetingMinutesService = unavailableService<MeetingMinutesService>('Meeting Minutes');
