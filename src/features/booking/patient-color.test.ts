import { describe, expect, test } from 'bun:test';

import {
  MIN_TONE_DISTANCE,
  type Tone,
  paletteTones,
  patientHue,
  patientTone,
  patientToneStyle,
  toneDistance,
} from './patient-color';

/**
 * The palette's distinctness, measured rather than asserted.
 *
 * Ten colours always *look* varied in source — ten different numbers, ten
 * different names. Whether they are ten colours anyone can tell apart is a
 * question about their distance in a perceptual space, and these answer it per
 * theme, because the two themes draw the same hues at their own lightness and
 * chroma and are two different palettes to the eye.
 */
const THEMES = ['light', 'dark'] as const;


const show = ({ l, c, h }: Tone) => `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;

/** Hue difference the short way round the wheel. */
function hueGap(a: number, b: number): number {
  const raw = Math.abs(a - b) % 360;
  return Math.min(raw, 360 - raw);
}

describe('patient palette', () => {
  test('has exactly ten colours', () => {
    for (const theme of THEMES) expect(paletteTones(theme)).toHaveLength(10);
  });

  test('is ascending by hue, so the palette reads as one trip round the wheel', () => {
    const hues = paletteTones('light').map((tone) => tone.h);
    expect(hues).toEqual([...hues].sort((a, b) => a - b));
  });

  for (const theme of THEMES) {
    test(`keeps every pair clearly apart in the ${theme} theme`, () => {
      const tones = paletteTones(theme);

      // Collected rather than asserted in place, so a failure names the offending
      // colours instead of only the number they missed by.
      const tooClose: string[] = [];
      for (let i = 0; i < tones.length; i += 1) {
        for (let j = i + 1; j < tones.length; j += 1) {
          const distance = toneDistance(tones[i]!, tones[j]!);
          if (distance < MIN_TONE_DISTANCE) {
            tooClose.push(`${show(tones[i]!)} / ${show(tones[j]!)} = ${distance.toFixed(4)}`);
          }
        }
      }

      expect(tooClose).toEqual([]);
    });
  }

  test('is ten colour families, not shades of fewer', () => {
    // Distance alone would happily return a pale red and a deep red: far apart
    // in OKLab, still two reds. Thirty degrees is the floor that makes these
    // families.
    const hues = paletteTones('light').map((tone) => tone.h);

    for (let i = 0; i < hues.length; i += 1) {
      for (let j = i + 1; j < hues.length; j += 1) {
        expect(hueGap(hues[i]!, hues[j]!)).toBeGreaterThanOrEqual(30);
      }
    }
  });

  test('has no near-neutrals: every colour is a colour', () => {
    // A grey is easy to place far from everything else and reads as nobody's
    // colour. Chroma floors differ per theme because the gamut does.
    for (const tone of paletteTones('light')) expect(tone.c).toBeGreaterThanOrEqual(0.075);
    for (const tone of paletteTones('dark')) expect(tone.c).toBeGreaterThanOrEqual(0.05);
  });

  test('stays clear of the just-noticeable difference by a margin', () => {
    // Spelled out so a change to MIN_TONE_DISTANCE cannot quietly walk the
    // palette back to "different hex values". ~0.02 is one JND.
    expect(MIN_TONE_DISTANCE).toBeGreaterThanOrEqual(0.06);
  });
});

describe('patientTone', () => {
  test('gives the first ten clients the palette itself, one each', () => {
    for (const theme of THEMES) {
      const anchors = paletteTones(theme).map(show);
      const first = Array.from({ length: 10 }, (_, seq) => show(patientTone(seq, theme)));

      expect(new Set(first).size).toBe(10);
      expect([...first].sort()).toEqual([...anchors].sort());
    }
  });

  test('never gives two clients the same colour', () => {
    // The promise the mixing exists for. A thousand is well past any clinic and
    // well past where a scheme that wrapped would have collided.
    for (const theme of THEMES) {
      const tones = Array.from({ length: 1000 }, (_, seq) => show(patientTone(seq, theme)));
      expect(new Set(tones).size).toBe(1000);
    }
  });

  test('is stable: the same client is always the same colour', () => {
    expect(patientTone(7, 'light')).toEqual(patientTone(7, 'light'));
    expect(patientToneStyle(7)).toEqual(patientToneStyle(7));
  });

  test('puts clients registered together far apart', () => {
    // The stride's whole job: neighbours in the register are the people most
    // likely to share a screen, so consecutive positions must not land on
    // neighbouring colours.
    for (const theme of THEMES) {
      for (let seq = 0; seq < 40; seq += 1) {
        expect(toneDistance(patientTone(seq, theme), patientTone(seq + 1, theme))).toBeGreaterThan(
          MIN_TONE_DISTANCE,
        );
      }
    }
  });

  test('stays inside sRGB, mixes included', () => {
    // The reason `clampToGamut` exists: the gamut is not convex, so the straight
    // line between two colours inside it leaves for a stretch of the hues
    // between. A colour that leaves is clipped per channel by the browser, which
    // moves the hue — the one coordinate identifying the client.
    for (const theme of THEMES) {
      for (let seq = 0; seq < 500; seq += 1) {
        const tone = patientTone(seq, theme);
        expect(srgbOf(tone).every((channel) => channel >= -1e-9 && channel <= 1 + 1e-9)).toBe(true);
      }
    }
  });

  test('stays on the wheel and inside the theme band', () => {
    for (let seq = 0; seq < 500; seq += 1) {
      for (const theme of THEMES) {
        const tone = patientTone(seq, theme);
        expect(tone.h).toBeGreaterThanOrEqual(0);
        expect(tone.h).toBeLessThan(360);
      }

      // The bands the text contrast was measured against. A mix is a linear
      // blend of two anchors, so it cannot leave the range they span — this is
      // the assertion that keeps a future anchor edit from widening it silently.
      expect(patientTone(seq, 'light').l).toBeGreaterThanOrEqual(0.755);
      expect(patientTone(seq, 'light').l).toBeLessThanOrEqual(0.92);
      expect(patientTone(seq, 'dark').l).toBeGreaterThanOrEqual(0.285);
      expect(patientTone(seq, 'dark').l).toBeLessThanOrEqual(0.455);
    }
  });

  test('lands on a colour for input the queries should never produce', () => {
    for (const seq of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const tone = patientTone(seq, 'light');
      expect(Number.isFinite(tone.l)).toBe(true);
      expect(Number.isFinite(tone.c)).toBe(true);
      expect(Number.isFinite(patientHue(seq))).toBe(true);
    }
  });
});

describe('patientToneStyle', () => {
  test('spells all five properties the ramp reads', () => {
    const style = patientToneStyle(3) as Record<string, string>;

    expect(Object.keys(style).sort()).toEqual([
      '--tone-c-dark',
      '--tone-c-light',
      '--tone-h',
      '--tone-l-dark',
      '--tone-l-light',
    ]);
    for (const value of Object.values(style)) expect(value).toMatch(/^\d+\.\d{3}$/);
  });
});

/**
 * OKLCH → linear sRGB, written out here rather than imported.
 *
 * The module has its own copy inside `inGamut`, and a test that reached for it
 * would be asserting that a function agrees with itself. This is the independent
 * second implementation the gamut claim needs.
 */
function srgbOf({ l, c, h }: Tone): number[] {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);

  const long = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ];
}
