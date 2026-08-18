import { resolveOptionValue } from './professional-options';

function minuteFromTime(value: FormDataEntryValue | null): number {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return Number.NaN;
  const [hour, minute] = value.split(':').map(Number);
  return (hour ?? Number.NaN) * 60 + (minute ?? Number.NaN);
}

export function readClinicProfileForm(formData: FormData) {
  return {
    clinic: {
      name: formData.get('clinicName'),
      phone: formData.get('clinicPhone'),
      contactEmail: formData.get('contactEmail'),
      address: formData.get('address'),
      // No logo here: it is written one column at a time by
      // `updateClinicFieldAction`, never as part of a bulk clinic write. See
      // `clinicInformationSchema` for why that separation is load-bearing.
    },
    schedule: {
      days: Array.from({ length: 7 }, (_, weekday) => {
        const isWorking = formData.get(`working-${weekday}`) === 'on';
        return isWorking
          ? {
              weekday,
              isWorking: true as const,
              openMinute: minuteFromTime(formData.get(`open-${weekday}`)),
              closeMinute: minuteFromTime(formData.get(`close-${weekday}`)),
            }
          : { weekday, isWorking: false as const, openMinute: null, closeMinute: null };
      }),
    },
    /*
      The title and the specialty each post two controls — a select and the
      text box that "أخرى" reveals — and collapse to the single string the
      column holds. Doing it here rather than in the component means the server
      action resolves the pair the same way the wizard's own client-side check
      does, from the same `FormData`, so the two can never disagree about what
      was chosen.

      `professionalPhone` and `licenseNumber` are gone from every screen; see
      the ⚠ on `professionalProfileSchema`.
    */
    professional: {
      name: formData.get('name'),
      professionalTitle: resolveOptionValue(
        formData.get('professionalTitle'),
        formData.get('professionalTitleCustom'),
      ),
      specialty: resolveOptionValue(
        formData.get('specialty'),
        formData.get('specialtyCustom'),
      ),
    },
  };
}
