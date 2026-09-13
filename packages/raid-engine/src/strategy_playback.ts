/** Replay playback with canonical same-tick ordering.
 *
 * New replay text is reconstructed from its recorded actions without requiring
 * the strategy AI that originally chose them. A legacy strategy-aware retry is
 * kept only so replays generated on this test branch before canonical ordering
 * was introduced can still be opened.
 */
import { parse_replay_text } from './battle_replay.js';
import { replay_config, reconstruct } from './battle_playback.js';
import { createRaidEngine } from './super_mega_raid_simulator.js';
import { applyCanonicalEventOrderPolicy } from './event_order_policy.js';
import { applySavedEnergyReturnValuePolicy } from './saved_energy_policy.js';
import type { CalculatorEntry } from './types.js';

function configuredEngine(document: any, catalog: CalculatorEntry[], canonical: boolean, legacyStrategy: boolean) {
    const config = replay_config(document);
    const { raid, boss } = document;

    for (const [key, field] of [['boss_hp', 'boss_hp'], ['boss_cpm', 'boss_cpm'], ['timer_seconds', 'raid_seconds']]) {
        if (Object.hasOwn(raid, key)) {
            const value = raid[key];
            if (!(value > 0 && value <= (key === 'boss_cpm' ? 1 : 1000000)))
                throw new Error(`Invalid ${key}.`);
            config[field] = value;
        }
    }

    if (Object.hasOwn(boss, 'base_attack')) {
        config.boss_manual_profile = {
            ...(boss.name ? { name: boss.name } : {}),
            attack: boss.base_attack,
            defense: boss.base_defense,
            types: boss.types,
        };
    }

    const engine = createRaidEngine(config, catalog);
    if (canonical)
        applyCanonicalEventOrderPolicy(engine);
    if (legacyStrategy)
        applySavedEnergyReturnValuePolicy(engine);
    if (engine.RAID_SECONDS > 3600)
        throw new Error('Replay timer must be at most 3600 seconds.');
    engine.validate_settings();
    if (document.summary.last_tick > Math.round(engine.RAID_SECONDS * 2))
        throw new Error('A recorded action occurs after the raid timer expires.');
    return engine;
}

export function buildStrategyPlayback(text: string, catalog: CalculatorEntry[]): Record<string, any> {
    if (text.length > 2000000)
        throw new Error('Replay text is too large.');

    const document = parse_replay_text(text);

    try {
        // Normal path: replay text is authoritative. Strategy AI is irrelevant;
        // completed hits resolve before new actions on the same game tick.
        return reconstruct(document, configuredEngine(document, catalog, true, false));
    }
    catch (canonicalError) {
        // Compatibility only for replays produced before canonical same-tick
        // ordering. Their text omitted the hidden heap tie-break, so reproducing
        // the original seeded strategy is the only exact recovery available.
        try {
            return reconstruct(document, configuredEngine(document, catalog, false, true));
        }
        catch {
            throw canonicalError;
        }
    }
}
