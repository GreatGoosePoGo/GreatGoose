/** Playback wrapper for raid simulations that use the experimental strategy policy. */
import { parse_replay_text } from './battle_replay.js';
import { replay_config, reconstruct } from './battle_playback.js';
import { createRaidEngine } from './super_mega_raid_simulator.js';
import { applySavedEnergyReturnValuePolicy } from './saved_energy_policy.js';
import type { CalculatorEntry } from './types.js';

export function buildStrategyPlayback(text: string, catalog: CalculatorEntry[]): Record<string, any> {
    if (text.length > 2000000)
        throw new Error('Replay text is too large.');

    const document = parse_replay_text(text);
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
    applySavedEnergyReturnValuePolicy(engine);
    if (engine.RAID_SECONDS > 3600)
        throw new Error('Replay timer must be at most 3600 seconds.');
    engine.validate_settings();
    if (document.summary.last_tick > Math.round(engine.RAID_SECONDS * 2))
        throw new Error('A recorded action occurs after the raid timer expires.');
    return reconstruct(document, engine);
}
