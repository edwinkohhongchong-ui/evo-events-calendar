// Keyword rules for what a "Label: dates" row is. Shared by the parser (to flag
// labels it does not recognise) and the classifier (to pick a season category).

export type LabelKind = "exam" | "schedule" | "unknown";

const EXAM_RE =
  /\b(exams?|examinations?|oral|listening|written|revision|reading|mt|mid[ -]?sem(?:ester)?(?: test)?|mid[ -]?terms?|practicals?|study week)\b/i;
const SCHEDULE_RE =
  /\b(vacation|holidays?|break|recess|orientation|(?:1st|first) week|terms?)\b/i;

export function labelKind(label: string): LabelKind {
  if (EXAM_RE.test(label)) return "exam";
  if (SCHEDULE_RE.test(label)) return "schedule";
  return "unknown";
}
