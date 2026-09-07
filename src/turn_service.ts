/** Browser-owned turn sessions. Persistence is injected, keeping the engine portable. */
import { createRaidEngine } from './super_mega_raid_simulator.js';
import { createTurnBattle } from './turn_battle.js';
import { PythonRandom } from './random.js';
import { battle_config, freshId } from './website_api.js';
import type { CalculatorEntry, RaidConfig, SimulationRequest, ManualAction } from './types.js';
export interface Command {
    tick: number;
    action: ManualAction;
    slot: number | null;
}
export interface SavedBattle {
    id: string;
    revision: number;
    updated: number;
    config: RaidConfig;
    commands: Command[];
    tick: number;
    stopped: boolean;
    snapshot: Record<string, any>;
}
type ManualSimulation = InstanceType<ReturnType<typeof createTurnBattle>['ManualSimulation']>;
interface Session {
    saved: SavedBattle;
    sim: ManualSimulation;
}
export class TurnService {
    private sessions = new Map<string, Session>();
    constructor(private catalog: CalculatorEntry[], private save: (record: SavedBattle) => Promise<void> = async () => { }) { }
    private make(config: RaidConfig): ManualSimulation {
        const e = createRaidEngine(config, this.catalog);
        e.validate_settings();
        return new (createTurnBattle(e).ManualSimulation)(Object.values(e.BOSS_FAST_MOVES)[0], Object.values(e.BOSS_CHARGED_MOVES)[0], new PythonRandom(e.RANDOM_SEED));
    }
    private decorate(sim: ManualSimulation, id: string): Record<string, any> {
        return { ...sim.snapshot(), session_id: id, filename: `turn-battle-${id}.txt`, recording_file: 'this browser' };
    }
    private reconstruct(saved: SavedBattle): ManualSimulation {
        const sim = this.make(saved.config), commands = new Map(saved.commands.map(c => [c.tick, c]));
        while (sim.tick < saved.tick && !sim.finished) {
            const command = commands.get(sim.tick);
            sim.advance(command?.action ?? 'wait', command?.slot ?? null, false);
        }
        sim.stopped = saved.stopped;
        return sim;
    }
    async start(request: SimulationRequest): Promise<Record<string, any>> {
        const config = battle_config({ ...request, player_strategy: 'no_strategy', dodge_strategy: 'none', battle_log_mode: 'full', simulation_count: 1, boss_moveset_mode: 'selected' }, this.catalog);
        const sim = this.make(config), id = freshId();
        const snapshot = this.decorate(sim, id);
        const saved: SavedBattle = { id, revision: 0, updated: Date.now(), config, commands: [], tick: sim.tick, stopped: false, snapshot };
        await this.save(structuredClone(saved));
        this.sessions.set(id, { sim, saved });
        this.trim();
        return snapshot;
    }
    async restore(saved: SavedBattle): Promise<Record<string, any>> {
        if (!saved || !Array.isArray(saved.commands) || !Number.isInteger(saved.tick) || saved.tick < 0 || saved.tick > 7200 || saved.commands.length > 7200)
            throw new Error('Invalid saved battle.');
        const sim = this.reconstruct(saved);
        const snapshot = this.decorate(sim, saved.id);
        this.sessions.set(saved.id, { saved: { ...saved, snapshot }, sim });
        this.trim();
        return snapshot;
    }
    async update(request: {
        session_id: string;
        expected_tick: number;
        action?: ManualAction;
        slot?: number | null;
    }, stop = false): Promise<Record<string, any>> {
        const session = this.sessions.get(request.session_id);
        if (!session)
            throw new Error('Choose a saved battle to restore this session.');
        const { sim, saved } = session;
        if (request.expected_tick !== saved.tick)
            throw new Error('This turn was already advanced. Restore the battle if this tab is out of date.');
        if (sim.finished)
            throw new Error('Battle has already ended; you can still export its recording.');
        const commands = [...saved.commands];
        try {
            if (stop)
                sim.stopped = true;
            else {
                const action = request.action ?? 'wait', slot = request.slot ?? null;
                sim.advance(action, slot, false);
                commands.push({ tick: saved.tick, action, slot });
            }
            const snapshot = this.decorate(sim, saved.id);
            const next: SavedBattle = { ...saved, revision: saved.revision + 1, commands, tick: sim.tick, stopped: sim.stopped, updated: Date.now(), snapshot };
            await this.save(structuredClone(next));
            session.saved = next;
            return snapshot;
        }
        catch (error) {
            // A failed save must leave the previously accepted turn playable/exportable.
            session.sim = this.reconstruct(saved);
            throw error;
        }
    }
    private trim(): void { while (this.sessions.size > 32)
        this.sessions.delete(this.sessions.keys().next().value!); }
}
