/** The page sends jobs to this Web Worker; no HTTP simulation requests exist. */
import { publicCatalog, battle_config } from './website_api.js';
import { createRaidEngineWithDodgePolicy } from './dodge_policy.js';
import { applyCanonicalEventOrderPolicy } from './event_order_policy.js';
import { applySavedEnergyReturnValuePolicy } from './saved_energy_policy.js';
import { parse_replay_text } from './battle_replay.js';
import { buildStrategyPlayback } from './strategy_playback.js';
import { TurnService } from './turn_service.js';
import { saveBattle, loadBattle, listBattles } from './recording_store.js';
import type { CalculatorEntry } from './types.js';
let data: Promise<CalculatorEntry[]> | undefined;
async function catalog(): Promise<CalculatorEntry[]> {
    return data ??= fetch(new URL('./calculator_data.json', import.meta.url)).then(async (response) => {
        if (!response.ok)
            throw new Error('Could not load Pokémon data.');
        const entries = await response.json();
        if (!Array.isArray(entries))
            throw new Error('Invalid Pokémon catalog.');
        return entries;
    }).catch(error => { data = undefined; throw error; });
}
function runSimulationWithSavedEnergyPolicy(payload: any, entries: CalculatorEntry[]) {
    const config = battle_config(payload, entries);
    const engine = createRaidEngineWithDodgePolicy(config, entries);
    applyCanonicalEventOrderPolicy(engine);
    applySavedEnergyReturnValuePolicy(engine);
    engine.validate_settings();
    const fast = Object.values(engine.BOSS_FAST_MOVES);
    const charged = Object.values(engine.BOSS_CHARGED_MOVES);
    if (config.trials !== 1 || fast.length !== 1 || charged.length !== 1)
        return engine.aggregate_summary();
    const sim = engine.createSimulation({ detailed: true });
    const result = sim.run();
    return {
        mode: 'single', won: result.won, finish_time: result.finish_time, boss_hp: result.boss_hp, faints: result.faints,
        retreats: result.tactical_switches, rejoins: result.rejoins, catch_tanks: result.catch_tanks_used,
        purified_gems_used: result.purified_gems_used,
        random_seed: String(engine.RANDOM_SEED), boss_fast_type: fast[0].name === 'Hidden Power' ? sim.boss_fast.move_type : null,
        battle_log_mode: config.battle_log_mode, log: sim.event_log, replay_text: engine.render_battle_replay(sim, result, engine.RANDOM_SEED),
    };
}
let sessions: TurnService | undefined;
async function route(method: string, payload: any) {
    if (method === 'replay/parse') {
        if (typeof payload?.text !== 'string' || payload.text.length > 2000000)
            throw new Error('Replay text must be a string of at most 2 MB.');
        return parse_replay_text(payload.text);
    }
    const entries = await catalog();
    if (method === 'catalog')
        return { pokemon: publicCatalog(entries) };
    if (method === 'simulate')
        return runSimulationWithSavedEnergyPolicy(payload, entries);
    if (method === 'replay/playback')
        return buildStrategyPlayback(payload.text, entries);
    sessions ??= new TurnService(entries, saveBattle);
    if (method === 'turn/start')
        return sessions.start(payload);
    if (method === 'turn/step')
        return sessions.update(payload);
    if (method === 'turn/stop')
        return sessions.update(payload, true);
    if (method === 'turn/list')
        return listBattles();
    if (method === 'turn/restore')
        return sessions.restore(await loadBattle(payload.session_id));
    throw new Error('Unknown local request.');
}
// Serialize jobs so two pending actions cannot mutate the same turn together.
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent) => {
    const { id, method, payload } = event.data;
    queue = queue.then(async () => {
        try {
            self.postMessage({ id, result: await route(method, payload) });
        }
        catch (error) {
            self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
        }
    });
};
