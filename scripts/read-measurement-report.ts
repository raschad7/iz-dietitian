/**
 * Reads a body composition report and prints what the parser made of it.
 *
 * ```bash
 * bun run report:read path/to/report.pdf                    # what we read
 * bun run report:read path/to/report.pdf --fixture out.json # capture a test fixture
 * ```
 *
 * This is the tool for adding a machine. A new analyser's sheet is supported by
 * writing a template in `src/features/measurements/parse/`, and a template is
 * written by looking at where the figures actually sit — which `--positions`
 * prints. The `--fixture` output is what the tests then run against, so a
 * template is always checked against a page that really came off the device.
 *
 * ⚠ A captured fixture holds whatever the report held. **Replace the subject's
 * name and the machine's own subject number before committing one** — the
 * figures are what the tests need, the identity is not.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { extractFirstPage } from '../src/features/measurements/parse/extract';
import { parseReport } from '../src/features/measurements/parse/report';
import { REPORT_FIGURES } from '../src/features/measurements/parse/types';

const [path, ...flags] = process.argv.slice(2);

if (!path) {
  console.error('usage: bun run report:read <file.pdf> [--positions] [--fixture <out.json>]');
  process.exit(1);
}

const page = await extractFirstPage(new Uint8Array(readFileSync(path)));

console.info(`page ${page.width}x${page.height}, ${page.items.length} text items`);

if (flags.includes('--positions')) {
  console.info('\n   y    x  text');
  for (const item of page.items) {
    console.info(`${String(item.y).padStart(4)} ${String(item.x).padStart(4)}  ${item.text}`);
  }
}

const report = parseReport(page);

console.info(`\ndevice: ${report.device ?? 'not recognised'}`);
console.info(`parser: ${report.parserVersion ?? '-'}`);
console.info(`subject: ${report.subjectName ?? '-'} (${report.subjectId ?? '-'})`);
console.info(`measured: ${report.measuredOn ?? '-'} ${report.measuredAtMinute ?? ''}`);

console.info('\nfigures');
for (const figure of REPORT_FIGURES) {
  const parsed = report.figures[figure];
  const value = parsed.value === null ? '—' : String(parsed.value);
  console.info(`  ${figure.padEnd(24)} ${value.padStart(8)}  ${parsed.origin}  ${parsed.raw ?? ''}`);
}

if (report.warnings.length > 0) {
  console.info('\nwarnings');
  for (const warning of report.warnings) console.info(`  ${JSON.stringify(warning)}`);
} else {
  console.info('\nno warnings');
}

const fixtureIndex = flags.indexOf('--fixture');
if (fixtureIndex !== -1) {
  const out = flags[fixtureIndex + 1];
  if (!out) {
    console.error('--fixture needs an output path');
    process.exit(1);
  }
  writeFileSync(out, `${JSON.stringify(page, null, 2)}\n`, 'utf8');
  console.info(`\nfixture written to ${out} — replace the name and subject number before committing`);
}
