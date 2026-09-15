import type {RaidDifficulty} from './types.js';

export const BATTLE_TIME_LIMITS = [27, 72, 147, 180, 222, 300] as const;
export type BattleTimeLimit = typeof BATTLE_TIME_LIMITS[number];

let automaticBattleTimeOverride: BattleTimeLimit | undefined;

export function defaultBattleTimeForDifficulty(difficulty: RaidDifficulty | undefined): BattleTimeLimit {
    return difficulty === 'Tier 1' || difficulty === 'Tier 3'
        || difficulty === 'Tier 1 Shadow' || difficulty === 'Tier 3 Shadow'
        ? 180
        : 300;
}

export function battleTimeLimitsForDifficulty(
    difficulty: RaidDifficulty | undefined,
): readonly BattleTimeLimit[] {
    const raidTimer = defaultBattleTimeForDifficulty(difficulty);
    return BATTLE_TIME_LIMITS.filter(seconds => seconds <= raidTimer);
}

export function parseBattleTimeLimit(
    value: unknown,
    difficulty?: RaidDifficulty,
): BattleTimeLimit {
    const seconds = Number(value);
    const allowed = battleTimeLimitsForDifficulty(difficulty);
    if (!Number.isFinite(seconds) || !(allowed as readonly number[]).includes(seconds)) {
        throw new Error(`Battle time limit must be one of ${allowed.join(', ')} seconds for this raid.`);
    }
    return seconds as BattleTimeLimit;
}

/** Worker-local override used by counters, whose engine is created deep in the ranking pipeline. */
export function setAutomaticBattleTimeOverride(value: BattleTimeLimit | undefined): void {
    automaticBattleTimeOverride = value;
}

/** Resolve the elapsed-time challenge limit without changing the raid's real clock. */
export function automaticBattleTimeLimit(configured: number | undefined): number | undefined {
    return configured ?? automaticBattleTimeOverride;
}
