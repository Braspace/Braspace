// Question-specific, fail-closed classroom quiz grading. Never equate missing NASA data with "wrong".
export type QuizMetric = { longestDarkH: { value: number | null }; longestBlackoutH: { value: number | null } };
export type QuizAnswer = { verdicts: (boolean | null)[]; correctIds: string[]; status: "ready" | "unknown" };
export function evaluateQuestion(question: number, metrics: readonly QuizMetric[], limits: { night: number; blackout: number }): QuizAnswer {
  const needsNight = question !== 3;
  const needsEarth = question !== 2;
  const verdicts = metrics.map(m => {
    const requirements = [
      ...(needsNight ? [[m.longestDarkH?.value, limits.night]] : []),
      ...(needsEarth ? [[m.longestBlackoutH?.value, limits.blackout]] : [])
    ];
    let missing = false;
    for (const [value, limit] of requirements) {
      if (value == null || !Number.isFinite(value) || !Number.isFinite(limit)) { missing = true; continue; }
      if (value > limit) return false;
    }
    return missing ? null : true;
  });
  const passing = verdicts.flatMap((v, i) => v === true ? [String.fromCharCode(65 + i)] : []);
  const unknown = passing.length === 0 && verdicts.some(v => v === null);
  return { verdicts, status: unknown ? "unknown" : "ready", correctIds: unknown ? [] : passing.length ? passing : ["none"] };
}
export function gradeChoice(choice: string | null, result: QuizAnswer): "correct" | "incorrect" | "unknown" | "unanswered" {
  if (result.status === "unknown") return "unknown";
  if (!choice) return "unanswered";
  return result.correctIds.includes(choice) ? "correct" : "incorrect";
}
