/** Canonical constructors for the different ways Great Goose uses the raid engine. */
import { createRaidEngineWithDodgeCompatibility, createRaidEngineWithDodgePolicy } from './dodge_policy.js';
import { applyCanonicalEventOrderPolicy } from './event_order_policy.js';
import { applySavedEnergyReturnValuePolicy } from './saved_energy_policy.js';
import type { CalculatorEntry, RaidConfig } from './types.js';

/**
 * Automatic raid simulation used by the raid calculator, batch simulations and
 * raid-counter rankings. Every automatic caller gets exactly the same event,
 * dodge and hot-swap semantics through this one entry point.
 */
export function createAutomaticRaidEngine(input: RaidConfig, catalog: CalculatorEntry[]) {
    const engine = createRaidEngineWithDodgePolicy(input, catalog);
    applyCanonicalEventOrderPolicy(engine);
    applySavedEnergyReturnValuePolicy(engine);
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
    if (options.legacyStrategy === true)
        applySavedEnergyReturnValuePolicy(engine);
    else
        neutralizeReplayDecisions(engine);
    return engine;
}
