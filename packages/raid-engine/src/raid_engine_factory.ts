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

/**
 * Replay reconstruction must understand modern strategy names but must not make
 * fresh dodge/swap decisions. Recorded actions are authoritative. The legacy
 * strategy switch exists only for old ambiguous replays produced before the
 * canonical same-tick ordering rule.
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
    return engine;
}
