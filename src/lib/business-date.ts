import { localParts } from '@/lib/calculation/instants';

export const BUSINESS_TIMEZONE = 'Asia/Dhaka';

/** Current local calendar date used by operational workflows. */
export function businessToday(now = new Date()): string {
  return localParts(now.toISOString(), BUSINESS_TIMEZONE).date;
}
