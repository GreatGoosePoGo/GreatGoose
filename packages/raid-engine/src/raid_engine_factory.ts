/** Canonical constructors for the different ways Great Goose uses the raid engine. */
import { createRaidEngine } from './super_mega_raid_simulator.js';
import { createRaidEngineWithDodgeCompatibility, createRaidEngineWithDodgePolicy } from './dodge_policy.js';
import { applyCanonicalEventOrderPolicy } from './event_order_policy.js';
import { applySavedEnergyReturnValuePolicy } from './saved_energy_policy.js';
import { applyCatchTankRejoinPolicy } from './catch_tank_policy.js';
import { automaticRejoinTimeDistribution, applyRejoinTimeDistributionPolicy } from './rejoin_time.js';
import {
    automaticBattleTimeLimit,
    defaultBattleTimeForDifficulty,
    parseBattleTimeLimit,
} from './battle_time.js';
import type { CalculatorEntry, RaidConfig } from './types.js';

function makeReplayTimerSelfContained(engine: any): void {
    const originalRender = engine.render_battle_replay;
    if (typeof originalRender !== 'function') return;
    engine.render_battle_replay = (...args: any[]) => {
        const lines = String(originalRender(...args)).split('\n');
        const timerLine = `Raid difficulty: ${engine.RAID_DIFFICULTY}; boss HP ${engine.BOSS_HP}; boss CPM ${engine.BOSS_CPM}; timer ${engine.RAID_SECONDS}s`;
        const existing = lines.findIndex(line => line.startsWith('Raid difficulty: '));
        if (existing >= 0) {
            lines[existing] = timerLine;
        }
        else {
            const raidLine = lines.findIndex(line => line.startsWith('Raid: '));
            if (raidLine >= 0) lines.splice(raidLine + 1, 0, timerLine);
        }
        return lines.join('\n');
    };
}

function realRaidSeconds(input: RaidConfig): number {
    return input.raid_seconds ?? defaultBattleTimeForDifficulty(input.raid_difficulty);
}

function elapsedBattleLimit(input: RaidConfig, raidSeconds: number): number {
    const configured = automaticBattleTimeLimit(input.battle_time_limit);
    if (configured === undefined) return raidSeconds;
    const parsed = parseBattleTimeLimit(configured, input.raid_difficulty);
    if (parsed > raidSeconds)
        throw new Error(`Battle time limit cannot exceed the ${raidSeconds}-second raid timer.`);
    return parsed;
}

/**
 * Automatic raid simulation used by the raid calculator, batch simulations and
 * raid-counter rankings. Every automatic caller gets exactly the same event,
 * dodge, hot-swap, catch-tank, rejoin-time and battle-time semantics here.
 */
export function createAutomaticRaidEngine(input: RaidConfig, catalog: CalculatorEntry[]) {
    const raidSeconds = realRaidSeconds(input);
    const battleLimit = elapsedBattleLimit(input, raidSeconds);

    // The ported core has one timer variable. Give that closure the elapsed
    // challenge cutoff, then expose the real in-game clock on the returned
    // engine. Only Simulation.run consumes the closure timer; UI/replay code
    // reads engine.RAID_SECONDS and therefore keeps the authentic 180/300 clock.
    const coreInput = {...input, raid_seconds: battleLimit};
    const engine = createRaidEngineWithDodgePolicy(coreInput, catalog);
    engine.RAID_SECONDS = raidSeconds;
    (engine as any).BATTLE_TIME_LIMIT = battleLimit;

    applyCanonicalEventOrderPolicy(engine);
    applySavedEnergyReturnValuePolicy(engine);
    applyCatchTankRejoinPolicy(engine);
    applyRejoinTimeDistributionPolicy(engine, automaticRejoinTimeDistribution(input.rejoin_time_distribution));
    makeReplayTimerSelfContained(engine);
    return engine;
}

/** Disable automatic decisions while retaining the configured team metadata. */
function neutralizeReplayDecisions(engine: any): void {
    const prototype = engine.Simulation.prototype;
    prototype.should_dodge_charged = function (): boolean { return false; };
    prototype.should_retreat = function (): boolean { return false; };
    prototype.announced_charge_prevents_next_charge = function (): boolean { return false; };
    prototype.schedule_catch_tank = function (): boolean { return false; };
}

/**
 * Replay reconstruction must understand modern strategy names but normally must
 * not make fresh dodge/swap decisions. Recorded actions are authoritative. The
 * legacy strategy switch exists only for old ambiguous replays produced before
 * the canonical same-tick ordering rule.
 */
export function createReplayRaidEngine(
    input: RaidConfig,
    catalog: CalculatorEntry[],
    options: { canonical?: boolean; legacyStrategy?: boolean } = {},
) {
    const engine = createRaidEngineWithDodgeCompatibility(input, catalog);
    if (options.canonical !== false)
        applyCanonicalEventOrderPolicy(engine);
    if (options.legacyStrategy === true) {
        applySavedEnergyReturnValuePolicy(engine);
        applyCatchTankRejoinPolicy(engine);
    }
    else
        neutralizeReplayDecisions(engine);
    return engine;
}

/**
 * Manual turn-by-turn battles keep the real raid clock and carry the elapsed
 * challenge cutoff separately because the player supplies every action.
 */
export function createManualRaidEngine(input: RaidConfig, catalog: CalculatorEntry[]) {
    const raidSeconds = realRaidSeconds(input);
    const battleLimit = input.battle_time_limit === undefined
        ? raidSeconds
        : parseBattleTimeLimit(input.battle_time_limit, input.raid_difficulty);
    if (battleLimit > raidSeconds)
        throw new Error(`Battle time limit cannot exceed the ${raidSeconds}-second raid timer.`);
    const engine = createRaidEngine({...input, raid_seconds: raidSeconds}, catalog);
    (engine as any).BATTLE_TIME_LIMIT = battleLimit;
    makeReplayTimerSelfContained(engine);
    return engine;
}
