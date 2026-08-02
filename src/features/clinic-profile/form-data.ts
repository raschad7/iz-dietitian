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
    professional: {
      name: formData.get('name'),
      professionalTitle: formData.get('professionalTitle'),
      specialty: formData.get('specialty'),
      phone: formData.get('professionalPhone'),
      licenseNumber: formData.get('licenseNumber'),
    },
  };
}
