/**
 * Reading a printed figure, with the unit it was printed in.
 *
 * ## Why the unit is read at all when the clinic's machine is metric
 *
 * Because it is one line of work and the failure it prevents is a 78 kg client
 * recorded at 173 kg. A Tanita's unit is a setting on the device, not a property
 * of the model — the manufacturer's own sample sheet is in pounds and feet — so
 * "our clinic uses kg" is a fact about a configuration that anyone in the room
 * can change. The number and its unit are printed together and arrive together;
 * refusing to look at the half already in hand is how that becomes a silent
 * error rather than a caught one.
 */

export const POUNDS_TO_KG = 0.45359237;
export const INCHES_TO_CM = 2.54;

export type Quantity = {
  value: number;
  /** As printed, lower-cased: `kg`, `lb`, `%`, `cm`, `kcal`, `kj`, or `''`. */
  unit: string;
  raw: string;
};

/**
 * Pulls a number and its unit out of one piece of printed text.
 *
 * Returns null for anything that is not a figure — `-` is what a Tanita prints
 * where it measured nothing, and a dash must never become a zero.
 */
export function readQuantity(raw: string): Quantity | null {
  const text = raw.trim();
  if (!text || text === '-' || text === '—') return null;

  // A leading number, optionally signed, then an optional unit word or `%`.
  const match = /^([+-]?\d+(?:[.,]\d+)?)\s*(%|[a-zA-Z]+)?$/.exec(text);
  if (!match) return null;

  const value = Number(match[1]!.replace(',', '.'));
  if (!Number.isFinite(value)) return null;

  return { value, unit: (match[2] ?? '').toLowerCase(), raw: text };
}

/**
 * A Tanita height, which is printed as one field in whichever system the machine
 * is set to: `157 cm`, or `5 10.08 ft_in`.
 *
 * The imperial form is two numbers in one string with the unit at the end, which
 * no general number reader would get right — hence its own function.
 */
export function readHeightCm(raw: string): { cm: number; converted: boolean; raw: string } | null {
  const text = raw.trim();
  if (!text) return null;

  const imperial = /^(\d+)\s+(\d+(?:\.\d+)?)\s*ft[_\s-]?in$/i.exec(text);
  if (imperial) {
    const feet = Number(imperial[1]);
    const inches = Number(imperial[2]);
    if (!Number.isFinite(feet) || !Number.isFinite(inches)) return null;
    return { cm: (feet * 12 + inches) * INCHES_TO_CM, converted: true, raw: text };
  }

  const metric = /^(\d+(?:[.,]\d+)?)\s*cm$/i.exec(text);
  if (metric) {
    return { cm: Number(metric[1]!.replace(',', '.')), converted: false, raw: text };
  }

  const inchesOnly = /^(\d+(?:\.\d+)?)\s*(?:in|inch|inches)$/i.exec(text);
  if (inchesOnly) {
    return { cm: Number(inchesOnly[1]) * INCHES_TO_CM, converted: true, raw: text };
  }

  return null;
}

/** A mass in kilograms, whatever the machine printed it in. */
export function toKilograms(quantity: Quantity): { kg: number; converted: boolean } | null {
  switch (quantity.unit) {
    case 'kg':
    case '':
      return { kg: quantity.value, converted: false };
    case 'lb':
    case 'lbs':
    case 'pound':
    case 'pounds':
      return { kg: quantity.value * POUNDS_TO_KG, converted: true };
    default:
      return null;
  }
}

/** Energy in kcal. Tanita prints kJ and kcal side by side; either may be read. */
export function toKilocalories(quantity: Quantity): { kcal: number; converted: boolean } | null {
  switch (quantity.unit) {
    case 'kcal':
    case '':
      return { kcal: quantity.value, converted: false };
    case 'kj':
      return { kcal: quantity.value / 4.184, converted: true };
    default:
      return null;
  }
}

/** Rounds to the precision a measurement is stored and shown at. */
export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
