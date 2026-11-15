export function evaluateQuestion(question, metrics, limits) {
    if (!metrics.length)
        return { verdicts: [], correctIds: [], status: "unknown" };
    const needsNight = question !== 3;
    const needsEarth = question !== 2;
    const verdicts = metrics.map(m => {
        const requirements = [];
        if (needsNight)
            requirements.push([m.longestDarkH?.value, limits.night]);
        if (needsEarth)
            requirements.push([m.longestBlackoutH?.value, limits.blackout]);
        let missing = false;
        for (const [value, limit] of requirements) {
            if (value == null || !Number.isFinite(value) || !Number.isFinite(limit)) {
                missing = true;
                continue;
            }
            if (value > limit)
                return false;
        }
        return missing ? null : true;
    });
    const passing = verdicts.flatMap((v, i) => v === true ? [String.fromCharCode(65 + i)] : []);
    const unknown = passing.length === 0 && verdicts.some(v => v === null);
    return { verdicts, status: unknown ? "unknown" : "ready", correctIds: unknown ? [] : passing.length ? passing : ["none"] };
}
export function gradeChoice(choice, result) {
    if (result.status === "unknown")
        return "unknown";
    if (!choice)
        return "unanswered";
    const index = choice.charCodeAt(0) - 65;
    if (choice.length === 1 && index >= 0 && index < result.verdicts.length && result.verdicts[index] === null)
        return "unknown";
    return result.correctIds.includes(choice) ? "correct" : "incorrect";
}
