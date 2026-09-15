/** Canonical constructors for the different ways Great Goose uses the raid engine. */
import { createRaidEngine } from './super_mega_raid_simulator.js';
import { createRaidEngineWithDodgeCompatibility, createRaidEngineWithDodgePolicy } from './dodge_policy.js';
import { applyCanonicalEventOrderPolicy } from './event_order_policy.js';
import { applySavedEnergyReturnValuePolicy } from './saved_energy_policy.js';
import { applyCatchTankRejoinPolicy } from './catch_tank_policy.js';
import { automaticRejoinTimeDistribution, applyRejoinTimeDistributionPolicy } from './rejoin_time.js';
import {automaticBattleTimeLimit} from './battle_time.js';
import type { CalculatorEntry, RaidConfig } from './types.js';

function makeReplayTimerSelfContained(engine: any): void {
    const originalRender = engine.render_battle_replay;
    if (typeof originalRender !== 'function') return;
    engine.render_battle_replay = (...args: any[]) => {
        const text = String(originalRender(...args));
        if (text.includes('\nRaid difficulty: ')) return text;
        const lines = text.split('\n');
        const raidLine = lines.findIndex(line => line.startsWith('Raid: '));
        if (raidLine >= 0) {
            lines.splice(raidLine + 1, 0,
                `Raid difficulty: ${engine.RAID_DIFFICULTY}; boss HP ${engine.BOSS_HP}; boss CPM ${engine.BOSS_CPM}; timer ${engine.RAID_SECONDS}s`);
        }
        return lines.join('\n');
    };
}

/**
 * Automatic raid simulation used by the raid calculator, batch simulations and
 * raid-counter rankings. Every automatic caller gets exactly the same event,
 * dodge, hot-swap, catch-tank, rejoin-time and battle-time semantics here.
 */
export function createAutomaticRaidEngine(input: RaidConfig, catalog: CalculatorEntry[]) {
    const raidSeconds = automaticBattleTimeLimit(input.raid_seconds);
    const resolvedInput = raidSeconds === undefined ? input : {...input, raid_seconds: raidSeconds};
    const engine = createRaidEngineWithDodgePolicy(resolvedInput, catalog);
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
 * Manual turn-by-turn battles deliberately use the unmodified core mechanics:
 * the player supplies dodge/switch/rejoin decisions, so no automatic policy is applied.
 */
export function createManualRaidEngine(input: RaidConfig, catalog: CalculatorEntry[]) {
    return createRaidEngine(input, catalog);
}
