import type {RaidDifficulty} from './types.js';

export const BATTLE_TIME_LIMITS = [27, 72, 147, 180, 222, 300] as const;
export type BattleTimeLimit = typeof BATTLE_TIME_LIMITS[number];

let automaticBattleTimeOverride: BattleTimeLimit | undefined;

export function parseBattleTimeLimit(value: unknown): BattleTimeLimit {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || !(BATTLE_TIME_LIMITS as readonly number[]).includes(seconds)) {
        throw new Error(`Battle time limit must be one of ${BATTLE_TIME_LIMITS.join(', ')} seconds.`);
    }
    return seconds as BattleTimeLimit;
}

export function defaultBattleTimeForDifficulty(difficulty: RaidDifficulty | undefined): BattleTimeLimit {
    return difficulty === 'Tier 1' || difficulty === 'Tier 3'
        || difficulty === 'Tier 1 Shadow' || difficulty === 'Tier 3 Shadow'
        ? 180
        : 300;
}

/** Worker-local override used by counters, whose engine is created deep in the ranking pipeline. */
export function setAutomaticBattleTimeOverride(value: BattleTimeLimit | undefined): void {
    automaticBattleTimeOverride = value;
}

export function automaticBattleTimeLimit(configured: number | undefined): number | undefined {
    return configured ?? automaticBattleTimeOverride;
}
