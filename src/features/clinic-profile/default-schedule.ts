import type { NewClinicWorkingHours } from '@/db/schema';

/** Defaults match the clinic-local working week used before per-day schedules. */
export function defaultClinicScheduleRows(clinicId: string): NewClinicWorkingHours[] {
  return Array.from({ length: 7 }, (_, weekday) => {
    const isWorking = weekday <= 4;

    return {
      clinicId,
      weekday,
      isWorking,
      openMinute: isWorking ? 8 * 60 : null,
      closeMinute: isWorking ? 18 * 60 : null,
    };
  });
}
