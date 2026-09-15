/** Application boundary used by the browser worker and optional Node callers. */
import { createAutomaticRaidEngine } from './raid_engine_factory.js';
import { parseSeed } from './compatibility.js';
import {isPlayerMoveAvailable} from './move_availability.js';
import type { CalculatorEntry, RaidConfig, SimulationRequest, TeamMember } from './types.js';
export function publicCatalog(catalog: CalculatorEntry[]) {
    return catalog.map(entry => {
        const fast = [...entry.fast_moves, ...(entry.exclusive_fast_moves || [])];
        const charged = [...entry.charged_moves, ...(entry.exclusive_charged_moves || []), ...(entry.mega_charged_moves || [])];
        const shadowFast = fast.filter(move => isPlayerMoveAvailable(move, {shadow: true}));
        const shadowCharged = charged.filter(move => isPlayerMoveAvailable(move, {shadow: true}));
        return {
            form_id: entry.form_id, dex_number: entry.dex_number, name: entry.name, types: entry.types,
            fast_moves: fast.map(m => m.name), charged_moves: charged.map(m => m.name),
            shadow_fast_moves: shadowFast.map(m => m.name),
            shadow_charged_moves: shadowCharged.map(m => m.name),
            mega_charged_moves: (entry.mega_charged_moves || []).map(m => m.name),
            boss_fast_moves: entry.fast_moves.filter(m => !m.elite).map(m => m.name),
            boss_charged_moves: entry.charged_moves.filter(m => !m.elite).map(m => m.name),
            fast_move_data: fast.map(({ id, name }) => ({ id, name })),
            charged_move_data: charged.map(({ id, name }) => ({ id, name })),
            shadow_fast_move_data: shadowFast.map(({ id, name }) => ({ id, name })),
            shadow_charged_move_data: shadowCharged.map(({ id, name }) => ({ id, name })),
        };
    });
}
function finite(value: unknown, label: string): number {
    if (value === null || value === '' || typeof value === 'boolean' || !['string', 'number'].includes(typeof value))
        throw new Error(`${label} must be a number.`);
    const n = Number(value);
    if (!Number.isFinite(n))
        throw new Error(`${label} must be a finite number.`);
    return n;
}
function integer(value: unknown, lo: number, hi: number, label: string): number {
    const n = finite(value, label);
    if (!Number.isInteger(n) || n < lo || n > hi)
        throw new Error(`${label} must be an integer from ${lo} to ${hi}.`);
    return n;
}
function randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    const browserCrypto = globalThis.crypto;
    if (browserCrypto && typeof browserCrypto.getRandomValues === 'function')
        return browserCrypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length; i++)
        bytes[i] = Math.floor(Math.random() * 256);
    return bytes;
}
export function freshId(): string {
    const browserCrypto = globalThis.crypto;
    if (browserCrypto && typeof browserCrypto.randomUUID === 'function')
        return browserCrypto.randomUUID();
    const bytes = randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function freshSeed(): string {
    const bytes = randomBytes(8);
    let value = 0n;
    for (const byte of bytes)
        value = (value << 8n) | BigInt(byte);
    return (value & 0x7fffffffffffffffn).toString();
}
export function battle_config(request: SimulationRequest, catalog: CalculatorEntry[]): RaidConfig {
    if (!request || typeof request !== 'object' || Array.isArray(request))
        throw new Error('Request must be an object.');
    const publicById = new Map(publicCatalog(catalog).map(p => [p.form_id, p]));
    const boss = publicById.get(request.boss);
    if (!boss)
        throw new Error('Choose a valid raid boss.');
    const mode = request.boss_moveset_mode ?? 'selected';
    if (!['selected', 'all'].includes(mode))
        throw new Error("Boss movesets must be 'selected' or 'all'.");
    const trials = integer(request.simulation_count ?? 1, 1, 1000, 'Games per moveset');
    if (!boss.boss_fast_moves.includes(request.boss_fast_move) || !boss.boss_charged_moves.includes(request.boss_charged_move))
        throw new Error('Choose legal ordinary moves for the raid boss.');
    const fast = mode === 'all' ? boss.boss_fast_moves : [request.boss_fast_move];
    const charged = mode === 'all' ? boss.boss_charged_moves : [request.boss_charged_move];
    const games = trials * fast.length * charged.length;
    if (games > 1000)
        throw new Error(`This would run ${games} battles. The limit is 1000; reduce games per moveset or use the selected moveset.`);
    const strategy = request.player_strategy ?? 'no_strategy';
    const requestedPlayers = request.players ?? (request.team ? [{ team: request.team }] : []);
    if (!Array.isArray(requestedPlayers) || requestedPlayers.length < 1 || requestedPlayers.length > 20)
        throw new Error('Choose between 1 and 20 players.');
    const tankTeams: number[][] = [];
    const teams: TeamMember[][] = requestedPlayers.map((requestedPlayer, playerIndex) => {
        if (!requestedPlayer || typeof requestedPlayer !== 'object' || !Array.isArray(requestedPlayer.team)
            || requestedPlayer.team.length < 1 || requestedPlayer.team.length > 6)
            throw new Error(`Player ${playerIndex + 1} must have between 1 and 6 Pokémon.`);
        const tanks: number[] = [];
        const team: TeamMember[] = requestedPlayer.team.map((p, slotIndex) => {
            if (!p || typeof p !== 'object')
                throw new Error(`Player ${playerIndex + 1}, slot ${slotIndex + 1} is invalid.`);
            const entry = publicById.get(p.name);
            const fastMoves = p.shadow === true ? entry?.shadow_fast_moves : entry?.fast_moves;
            const chargedMoves = p.shadow === true ? entry?.shadow_charged_moves : entry?.charged_moves;
            if (!entry || !fastMoves?.includes(p.fast_move) || !chargedMoves?.includes(p.charged_move))
                throw new Error(`Choose a valid Pokémon and its legal moves for player ${playerIndex + 1}, slot ${slotIndex + 1}.`);
            const level = finite(p.level, 'Pokémon level');
            if (level < 1 || level > 55 || !Number.isInteger(level * 2))
                throw new Error('Pokémon levels must be from 1 to 55 in half-level steps.');
            if (p.catch_tank === true)
                tanks.push(slotIndex);
            return [p.name, p.fast_move, p.charged_move, level,
                integer(p.attack_iv ?? 15, 0, 15, 'Attack IV'), integer(p.defense_iv ?? 15, 0, 15, 'Defense IV'), integer(p.stamina_iv ?? 15, 0, 15, 'Stamina IV'),
                p.shadow === true, integer(p.mega_level ?? 1, 1, 4, 'Mega Level')];
        });
        if (strategy === 'catch_tank' && tanks.length >= team.length)
            throw new Error(`Leave at least one Pokémon on player ${playerIndex + 1}'s team as a normal attacker.`);
        tankTeams.push(strategy === 'catch_tank' ? tanks : []);
        return team;
    });
    const seed = request.random_seed == null || request.random_seed === '' ? freshSeed() : String(parseSeed(request.random_seed));
    if (BigInt(seed) < 0n || BigInt(seed) >= 2n ** 63n)
        throw new Error('Random seed must be from 0 through 9223372036854775807.');
    const friendships = requestedPlayers.map(player => {
        const base = finite(player.friendship ?? request.friendship ?? 1, 'Friendship multiplier');
        if (base < 1 || base > 1.24) throw new Error('Friendship multiplier must be between 1 and 1.24.');
        return request.seasonal_friendship === true ? 1 + 2 * (base - 1) : base;
    });
    const groups = new Map<number, number[]>();
    requestedPlayers.forEach((player, index) => {
        const group = integer(player.party_group ?? 0, 0, 10, 'Party Power group');
        if (group) groups.set(group, [...(groups.get(group) ?? []), index]);
    });
    for (const [group, members] of groups) {
        if (members.length < 2 || members.length > 4) throw new Error(`Party ${group} needs 2–4 players; it currently has ${members.length}.`);
    }
    return {
        trials, random_seed: seed, raid_difficulty: request.raid_difficulty ?? 'Tier 5', boss_form_id: request.boss,
        boss_fast_move_names: fast, boss_charged_move_names: charged, player_teams: teams,
        friendship_multipliers: friendships, zacian_adventure_effect: requestedPlayers.map(p => (p.zacian_adventure_effect ?? request.zacian_adventure_effect) === true),
        behemoth_bash_adventure_effect: requestedPlayers.map(p => (p.behemoth_bash_adventure_effect ?? request.behemoth_bash_adventure_effect) === true), dynamic_punch_adventure_effect: requestedPlayers.map(p => (p.dynamic_punch_adventure_effect ?? request.dynamic_punch_adventure_effect) === true),
        party_power_groups: [...groups.values()], weather: request.weather || null, dodge_strategy: request.dodge_strategy ?? 'none', player_strategy: strategy,
        use_purified_gems: request.use_purified_gems === true,
        catch_tank_team_indices: tankTeams, battle_log_mode: request.battle_log_mode ?? 'moves',
    };
}
export function run_simulations(request: SimulationRequest, catalog: CalculatorEntry[]) {
    const config = battle_config(request, catalog);
    const engine = createAutomaticRaidEngine(config, catalog);
    engine.validate_settings();
    const fast = Object.values(engine.BOSS_FAST_MOVES), charged = Object.values(engine.BOSS_CHARGED_MOVES);
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
