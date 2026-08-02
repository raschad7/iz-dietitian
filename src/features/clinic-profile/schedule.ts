import type { ClinicWorkingHours } from '@/db/schema';

import type { ClinicDayHours, ClinicSchedule } from './types';

export function toClinicDayHours(row: Pick<ClinicWorkingHours, 'weekday' | 'isWorking' | 'openMinute' | 'closeMinute'>): ClinicDayHours {
  if (row.isWorking && row.openMinute !== null && row.closeMinute !== null) {
    return {
      weekday: row.weekday,
      isWorking: true,
      openMinute: row.openMinute,
      closeMinute: row.closeMinute,
    };
  }

  return { weekday: row.weekday, isWorking: false, openMinute: null, closeMinute: null };
}

export function scheduleEnvelope(days: readonly ClinicDayHours[]): ClinicSchedule['envelope'] {
  const working = days.filter((day): day is Extract<ClinicDayHours, { isWorking: true }> => day.isWorking);
  if (working.length === 0) throw new Error('clinic schedule has no working days');

  return {
    openMinute: Math.min(...working.map((day) => day.openMinute)),
    closeMinute: Math.max(...working.map((day) => day.closeMinute)),
  };
}

export function toClinicSchedule(
  rows: readonly Pick<ClinicWorkingHours, 'weekday' | 'isWorking' | 'openMinute' | 'closeMinute'>[],
): ClinicSchedule {
  const days = rows.map(toClinicDayHours).sort((a, b) => a.weekday - b.weekday);
  return { days, envelope: scheduleEnvelope(days) };
}
