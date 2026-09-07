/** Manually controlled half-second battles backed by the canonical raid engine. */
import { heappop, heappush } from './compatibility.js';
import { PythonRandom } from './random.js';
export function createTurnBattle(engine) {
    class ManualSimulation extends engine.Simulation {
        __post_init__() {
            super.__post_init__();
            this.detailed = true;
            this.tick = 0;
            this.pending_boss = null;
            this.lobby = false;
            this.rejoin_at = 0;
            this.stopped = false;
            this.push(0, 'boss_decision');
            this.resolve_until(0);
        }
        /** Manual battles never enqueue automatic player actions. */
        schedule_player(playerId, time) {
            this.players[playerId].next_action_time = time;
        }
        push(time, kind, data = []) {
            this.sequence += 1;
            if (kind === 'boss_hit') {
                const [move] = data;
                const dodgers = new Set();
                data = [move, dodgers];
                this.pending_boss = [time, move, dodgers];
            }
            const priority = kind.endsWith('_hit') ? 0 : 1;
            heappush(this.events, [time, priority, this.sequence, kind, data]);
        }
        resolve_until(target) {
            while (this.events.length && this.events[0][0] <= target && this.boss_hp > 0) {
                const [time, , , kind, data] = heappop(this.events);
                this.current_time = time;
                if (kind === 'boss_decision') {
                    // No new moves may begin after the raid timer expires.
                    if (time < engine.RAID_SECONDS)
                        super.boss_decision(time);
                }
                else if (kind === 'boss_hit') {
                    this.pending_boss = null;
                    super.apply_boss_hit(data[0], data[1]);
                }
                else if (kind === 'player_hit') {
                    super.apply_player_hit(data[0], data[1], data[2]);
                }
            }
            if (this.boss_hp > 0)
                this.current_time = target;
            this.tick = Math.round(this.current_time * 2);
        }
        enter_lobby() {
            const player = this.players[0];
            player.on_field = false;
            player.generation += 1;
            player.action_end = this.current_time;
            player.action_is_charged = false;
            this.lobby = true;
            this.rejoin_at = this.current_time + this.rng.choice(engine.REJOIN_TIMES);
            this.record_replay_action(this.current_time, 'player', 0, 'quit');
            this.log(this.current_time, `P1 enters lobby; ready to rejoin at ${this.rejoin_at.toFixed(1)}s`);
            this.pending_boss?.[2].delete(0);
        }
        /** Faints pause the player's actions, not the boss or raid clock. */
        switch(time, playerId, _tactical) {
            const player = this.players[playerId];
            player.on_field = false;
            player.generation += 1;
            player.action_end = time;
            player.action_is_charged = false;
            this.log(time, `P1 ${player.species.name} fainted; choose a surviving slot`);
            if (!player.team.some(member => member.hp > 0))
                this.enter_lobby();
        }
        get finished() {
            return this.stopped || this.boss_hp <= 0 || this.current_time >= engine.RAID_SECONDS;
        }
        availability() {
            const player = this.players[0];
            const alive = player.on_field && player.hp > 0;
            const animationBusy = alive && this.current_time < player.action_end;
            const ready = alive && !animationBusy;
            let dodge = ready && this.pending_boss !== null && !this.pending_boss[2].has(0);
            if (dodge && this.pending_boss) {
                const hitTime = this.pending_boss[0];
                dodge = !(player.action_is_charged && player.action_start < hitTime && hitTime < player.action_end);
            }
            return {
                fast: ready,
                charged: ready && player.energy >= player.pokemon.charged_move.energy,
                dodge,
                quit: !this.lobby,
                rejoin: this.lobby && this.current_time >= this.rejoin_at,
                switch_slots: player.team
                    .map((member, index) => ({ member, index }))
                    .filter(({ member, index }) => member.hp > 0
                    && (index !== player.pokemon_index || !player.on_field)
                    && !this.lobby
                    && !animationBusy)
                    .map(({ index }) => index + 1),
            };
        }
        act(action, slot = null) {
            if (this.finished)
                throw new Error('This battle has ended. Start a new battle to play again.');
            if (action === 'wait')
                return;
            const allowed = this.availability();
            if (action === 'switch') {
                if (!Number.isInteger(slot) || !allowed.switch_slots.includes(slot))
                    throw new Error('That slot cannot switch in now.');
            }
            else if (!['fast', 'charged', 'dodge', 'quit', 'rejoin'].includes(action)) {
                throw new Error('Unknown player action.');
            }
            else if (!allowed[action]) {
                throw new Error(`Cannot ${action} now. Advance a turn or choose an available action.`);
            }
            const player = this.players[0];
            const time = this.current_time;
            if (action === 'fast' || action === 'charged') {
                const move = action === 'fast' ? player.pokemon.fast_move : player.pokemon.charged_move;
                if (action === 'charged')
                    player.energy -= move.energy;
                player.action_start = time;
                player.action_end = time + move.duration;
                player.action_is_charged = action === 'charged';
                const name = engine.displayed_player_move_name(move, player.pokemon);
                this.record_replay_action(time, 'player', 0, 'move', name);
                this.log(time, `P1 starts ${name}; lands at ${player.action_end.toFixed(1)}s`, 'move_start');
                this.push(player.action_end, 'player_hit', [0, player.generation, move]);
            }
            else if (action === 'dodge') {
                this.pending_boss[2].add(0);
                player.action_end = Math.max(time, player.action_end) + engine.DODGE_SECONDS;
                this.record_replay_action(time, 'player', 0, 'dodge');
                this.log(time, `P1 dodges incoming ${this.pending_boss[1].name}`);
            }
            else if (action === 'switch') {
                player.generation += 1; // Cancel the departing Pokémon's unresolved hit.
                player.pokemon_index = slot - 1;
                player.on_field = true;
                player.switches += 1;
                player.action_start = time;
                player.action_end = time + engine.SWITCH_SECONDS;
                player.action_is_charged = false;
                this.pending_boss?.[2].delete(0);
                this.record_replay_action(time, 'player', 0, 'switch', slot);
                this.log(time, `P1 switches to slot ${slot}: ${player.species.name}`);
            }
            else if (action === 'quit') {
                this.enter_lobby();
            }
            else if (action === 'rejoin') {
                player.rejoins += 1;
                this.lobby = false;
                super.rejoin(time, 0);
            }
        }
        advance(action = 'wait', slot = null, snapshot = true) {
            this.act(action, slot);
            this.resolve_until(Math.min(engine.RAID_SECONDS, (this.tick + 1) / 2));
            return snapshot ? this.snapshot() : null;
        }
        recording() {
            const player = this.players[0];
            const result = new engine.TrialResult(this.boss_hp <= 0, this.current_time, Math.max(0, this.boss_hp), player.switches, player.faints, 0, player.rejoins, 0);
            let text = engine.render_battle_replay(this, result, engine.RANDOM_SEED);
            const status = this.stopped ? 'stopped' : this.finished ? 'finished' : 'in_progress';
            text = text.replace('\nEvents:', `\nRecording: manual; through=${this.current_time}; status=${status}\n\nEvents:`);
            return `${text}\n\n# Full event log (comments; compact actions above drive playback)\n${this.event_log.map(line => `# ${line}`).join('\n')}\n`;
        }
        snapshot() {
            const player = this.players[0];
            const member = (pokemon, index) => ({
                slot: index + 1,
                name: `${pokemon.is_shadow && !pokemon.species.name.startsWith('Shadow ') ? 'Shadow ' : ''}${pokemon.species.name}`,
                types: [...pokemon.species.types],
                hp: Math.max(0, pokemon.hp),
                max_hp: pokemon.max_hp,
                energy: pokemon.energy,
                max_energy: 100,
                fast: engine.displayed_player_move_name(pokemon.fast_move, pokemon),
                fast_type: pokemon.fast_move.move_type,
                fast_seconds: pokemon.fast_move.duration,
                fast_energy: pokemon.fast_move.energy,
                charged: engine.displayed_player_move_name(pokemon.charged_move, pokemon),
                charged_type: pokemon.charged_move.move_type,
                charged_seconds: pokemon.charged_move.duration,
                charged_energy: pokemon.charged_move.energy,
            });
            const status = this.stopped
                ? 'stopped'
                : this.boss_hp <= 0
                    ? 'victory'
                    : this.current_time >= engine.RAID_SECONDS
                        ? 'time_expired'
                        : 'in_progress';
            const activeHit = this.events.find(event => event[3] === 'player_hit' && event[4][1] === player.generation);
            const currentAction = activeHit
                ? engine.displayed_player_move_name(activeHit[4][2], player.pokemon)
                : 'Recovering';
            return {
                tick: this.tick,
                elapsed: this.current_time,
                remaining: Math.max(0, engine.RAID_SECONDS - this.current_time),
                status,
                seed: String(engine.RANDOM_SEED),
                boss: {
                    name: engine.BOSS_NAME,
                    types: [...engine.BOSS_TYPES],
                    hp: Math.max(0, this.boss_hp),
                    max_hp: engine.BOSS_HP,
                    energy: this.boss_energy,
                    max_energy: engine.BOSS_MAX_ENERGY,
                    incoming: this.pending_boss?.[1].name ?? null,
                    hits_at: this.pending_boss?.[0] ?? null,
                    enraged: this.enraged,
                },
                player: {
                    ...member(player.pokemon, player.pokemon_index),
                    on_field: player.on_field,
                    current_action: currentAction,
                    busy_until: player.action_end,
                    in_lobby: this.lobby,
                    rejoin_at: this.rejoin_at,
                    faints: player.faints,
                    rejoins: player.rejoins,
                },
                team: player.team.map(member),
                available: this.availability(),
                log: this.event_log,
                replay_text: this.recording(),
            };
        }
    }
    function rebuild(request) {
        engine.validate_settings();
        const sim = new ManualSimulation(Object.values(engine.BOSS_FAST_MOVES)[0], Object.values(engine.BOSS_CHARGED_MOVES)[0], new PythonRandom(engine.RANDOM_SEED));
        const commands = new Map(request.commands.map(command => [command.tick, command]));
        while (sim.tick < request.tick && !sim.finished) {
            const command = commands.get(sim.tick);
            sim.advance(command?.action ?? 'wait', command?.slot ?? null, false);
        }
        sim.stopped = request.stopped ?? false;
        return sim.snapshot();
    }
    return { ManualSimulation, rebuild };
}
//# sourceMappingURL=turn_battle.js.map