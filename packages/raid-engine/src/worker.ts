/** The page sends jobs to this Web Worker; no HTTP simulation requests exist. */
import { publicCatalog, run_simulations } from './website_api.js';
import { parse_replay_text } from './battle_replay.js';
import { build_playback } from './battle_playback.js';
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
        return run_simulations(payload, entries);
    if (method === 'replay/playback')
        return build_playback(payload.text, entries);
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
