import { type ParsedReport, type ParseWarning } from './parse/types';

/**
 * The state of "read this report", kept out of `actions.ts` because a
 * `"use server"` module may only export async functions.
 */

/**
 * A warning that only the *client's record* can raise, added by the action after
 * the parser has run.
 *
 * They are separate from `ParseWarning` because the parser is pure over a page
 * and knows nothing about who the report is supposed to be for. These three are
 * the mistakes a person makes rather than the ones a template makes, and the
 * first of them — a report dropped onto the wrong record — is the likeliest
 * error in the whole feature.
 */
export type RecordWarning =
  /** The name on the report does not look like this client's. */
  | { kind: 'nameMismatch'; onReport: string; onRecord: string }
  /** The report's height differs from the one the record holds. */
  | { kind: 'heightMismatch'; onReport: number; onRecord: number }
  /** There is already a measurement for this client at this date and time. */
  | { kind: 'duplicate'; measuredOn: string };

export type ReadReportState =
  | { status: 'idle' }
  | {
      status: 'ready';
      report: ParsedReport;
      /** Warnings from the parser and from the record, already merged for the screen. */
      warnings: (ParseWarning | RecordWarning)[];
      file: { name: string; byteSize: number };
      /** How many figures the template actually filled, for "21 of 24 found". */
      found: number;
      total: number;
    }
  | {
      status: 'error';
      messageKey:
        | 'errors.fileTooLarge'
        | 'errors.fileNotPdf'
        | 'errors.fileMissing'
        | 'errors.unreadable';
    };

export const initialReadReportState: ReadReportState = { status: 'idle' };
