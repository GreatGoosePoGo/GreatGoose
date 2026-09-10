import {PythonRandom} from './random.js';
import {RELEASED_MEGA_PLUS_FORM_IDS, type MegaLevel} from './rankings.js';
import {createRaidEngine} from './super_mega_raid_simulator.js';
import type {
    CalculatorEntry, CalculatorMove, DodgeStrategy, PlayerStrategy,
    RaidDifficulty, Weather,
} from './types.js';

export const RAID_COUNTER_DIFFICULTIES: readonly RaidDifficulty[] = [
    'Tier 1', 'Tier 3', 'Tier 4', 'Tier 5', 'Mega', 'Mega Legendary',
    'Super Mega', 'Elite', 'Primal', 'Tier 1 Shadow', 'Tier 3 Shadow',
    'Tier 5 Shadow',
];

export const RAID_COUNTER_LEVELS = [30, 40, 50] as const;
export type RaidCounterLevel = typeof RAID_COUNTER_LEVELS[number];
export const RAID_COUNTER_DODGE_STRATEGIES = [
    'none', 'all_survivable', 'super_effective', 'non_resisted', 'lethal_only',
] as const satisfies readonly DodgeStrategy[];
export type RaidCounterDodgeStrategy = typeof RAID_COUNTER_DODGE_STRATEGIES[number];
export const RAID_COUNTER_PLAYER_STRATEGIES = [
    'no_strategy', 'hot_swap_greedy', 'hot_swap_cautious', 'hot_swap_very_cautious',
] as const satisfies readonly PlayerStrategy[];
export type RaidCounterPlayerStrategy = typeof RAID_COUNTER_PLAYER_STRATEGIES[number];
export const RAID_COUNTER_WEATHER: readonly Weather[] = [
    null, 'Sunny/Clear', 'Rainy', 'Partly Cloudy', 'Cloudy', 'Windy', 'Snow', 'Fog',
];
export const RAID_COUNTER_FRIENDSHIP_MULTIPLIERS = [1, 1.03, 1.05, 1.07, 1.10, 1.12] as const;

export interface RaidCounterSettings {
    bossFormId: string;
    raidDifficulty: RaidDifficulty;
    includeMegas?: boolean;
    includeShadows?: boolean;
    includeLegendaries?: boolean;
    megaLevel?: MegaLevel;
    level?: RaidCounterLevel;
    friendshipMultiplier?: number;
    weather?: Weather;
    dodgeStrategy?: RaidCounterDodgeStrategy;
    playerStrategy?: RaidCounterPlayerStrategy;
    excludeLegacy?: boolean;
    /** Test/diagnostic override. The website intentionally uses the defaults. */
    trialsPerBossMoveset?: number;
    /** Test/diagnostic override. The website intentionally uses the defaults. */
    prefilterLimit?: number;
}

export interface RaidCounterRow {
    formId: string;
    dexNumber: number;
    name: string;
    pokemonTypes: string[];
    fastMove: string;
    fastMoveType: string;
    chargedMove: string;
    chargedMoveType: string;
    eliteFast: boolean;
    eliteCharged: boolean;
    mega: boolean;
    shadow: boolean;
    legendary: boolean;
    battleDps: number;
    averageDamagePercent: number;
    averageFaints: number;
    averageRejoins: number;
    winPercent: number;
    averageWinTime: number | null;
}

export interface RaidCounterResult {
    bossFormId: string;
    bossName: string;
    bossDexNumber: number;
    bossTypes: string[];
    raidDifficulty: RaidDifficulty;
    includeMegas: boolean;
    includeShadows: boolean;
    includeLegendaries: boolean;
    megaLevel: MegaLevel;
    bossFastMoves: string[];
    bossChargedMoves: string[];
    bossMovesets: number;
    totalBossMovesets: number;
    candidateMovesets: number;
    simulatedMovesets: number;
    simulatedBattles: number;
    rows: RaidCounterRow[];
    assumptions: {
        level: RaidCounterLevel;
        attackIV: 15;
        defenseIV: 15;
        staminaIV: 15;
        teamSize: 6;
        trialsPerBossMoveset: number;
        dodgeStrategy: RaidCounterDodgeStrategy;
        playerStrategy: RaidCounterPlayerStrategy;
        friendshipMultiplier: number;
        weather: Weather;
        excludeLegacyMoves: boolean;
        partyPower: false;
        purifiedGems: false;
        analyticalPrefilter: boolean;
        maximumBossMovesets: number;
    };
}

export interface RaidBossOption {
    formId: string;
    dexNumber: number;
    name: string;
    types: string[];
    fastMoveCount: number;
    chargedMoveCount: number;
}

interface Candidate {
    entry: CalculatorEntry;
    fastMove: CalculatorMove;
    chargedMove: CalculatorMove;
    mega: boolean;
    shadow: boolean;
    legendary: boolean;
    offenseProxy: number;
    effectiveProxy: number;
}

const PLAYER_CPM_BY_LEVEL: Record<RaidCounterLevel, number> = {
    30: 0.7317,
    40: 0.79030001,
    50: 0.84029999,
};
const TEAM_SIZE = 6;
const DEFAULT_TRIALS = 3;
const DEFAULT_PREFILTER_LIMIT = 600;
const MAX_BOSS_MOVESETS = 12;
const TOP_COUNTERS = 30;
const STAB = 1.2;
const SHADOW_OUTGOING = 1.2;
const SHADOW_INCOMING = 1.2;
const EPSILON = 1e-9;

const INTERNAL_SHADOW_FORM_IDS = new Set([
    'RAIKOU_S', 'ENTEI_S', 'SUICUNE_S', 'LUGIA_S',
    'HO_OH_S', 'LATIAS_S', 'LATIOS_S',
]);

function normalizeType(value: string): string {
    return value.trim().toLowerCase();
}

function titleType(value: string): string {
    const normalized = normalizeType(value);
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function isMegaOrPrimal(entry: CalculatorEntry): boolean {
    const parts = entry.form_id.toUpperCase().split('_');
    return parts.includes('MEGA') || parts.includes('PRIMAL');
}

function uniqueMoves(moves: CalculatorMove[]): CalculatorMove[] {
    const result = new Map<string, CalculatorMove>();
    for (const move of moves) {
        const key = move.id || `${move.name}:${move.type}:${move.energy}`;
        if (!result.has(key)) result.set(key, move);
    }
    return [...result.values()];
}

function playerFastMoves(entry: CalculatorEntry, excludeLegacy = false): CalculatorMove[] {
    return uniqueMoves([
        ...entry.fast_moves,
        ...(entry.exclusive_fast_moves ?? []),
    ]).filter(move => move.energy > 0 && move.duration_ms > 0
        && (!excludeLegacy || !move.elite));
}

function playerChargedMoves(entry: CalculatorEntry, excludeLegacy = false): CalculatorMove[] {
    return uniqueMoves([
        ...entry.charged_moves,
        ...(entry.exclusive_charged_moves ?? []),
        ...(RELEASED_MEGA_PLUS_FORM_IDS.has(entry.form_id)
            ? entry.mega_charged_moves ?? [] : []),
    ]).filter(move => move.energy < 0 && move.duration_ms > 0
        && (!excludeLegacy || !move.elite));
}

function ordinaryBossMoves(moves: CalculatorMove[]): CalculatorMove[] {
    return uniqueMoves(moves.filter(move => !move.elite && move.duration_ms > 0));
}

function movePower(move: CalculatorMove, megaLevel: MegaLevel): number {
    if (!move.plus_powers) return move.power;
    return move.plus_powers[megaLevel - 1] ?? move.power;
}

function displayedMoveName(move: CalculatorMove, megaLevel: MegaLevel): string {
    if (!move.plus_powers) return move.name;
    return `${move.name.replace(/\++$/, '')}${'+'.repeat(megaLevel)}`;
}

function simpleCycleDps(
    fastDamage: number,
    fastEnergy: number,
    fastSeconds: number,
    chargedDamage: number,
    chargedEnergy: number,
    chargedSeconds: number,
): number {
    let energy = 0;
    let damage = 0;
    let time = 0;
    const seen = new Map<number, {damage: number; time: number}>();
    for (let step = 0; step < 1000; step += 1) {
        const previous = seen.get(energy);
        if (previous) return (damage - previous.damage) / (time - previous.time);
        seen.set(energy, {damage, time});
        if (energy >= chargedEnergy) {
            energy -= chargedEnergy;
            damage += chargedDamage;
            time += chargedSeconds;
        } else {
            energy = Math.min(100, energy + fastEnergy);
            damage += fastDamage;
            time += fastSeconds;
        }
    }
    return 0;
}

function candidateKey(candidate: Candidate): string {
    return [
        candidate.entry.form_id,
        candidate.shadow ? 'shadow' : 'normal',
        candidate.fastMove.id,
        candidate.chargedMove.id,
    ].join(':');
}

function prefilterCandidates(candidates: Candidate[], limit: number): Candidate[] {
    if (candidates.length <= limit) return candidates;
    const selected = new Map<string, Candidate>();
    const offenseCount = Math.max(1, Math.floor(limit / 3));
    const effectiveCount = Math.max(1, limit - offenseCount);
    const add = (candidate: Candidate) => selected.set(candidateKey(candidate), candidate);
    [...candidates]
        .sort((a, b) => b.offenseProxy - a.offenseProxy)
        .slice(0, offenseCount)
        .forEach(add);
    const byEffective = [...candidates]
        .sort((a, b) => b.effectiveProxy - a.effectiveProxy || b.offenseProxy - a.offenseProxy)
    byEffective.slice(0, effectiveCount).forEach(add);
    for (const candidate of byEffective) {
        if (selected.size >= limit) break;
        add(candidate);
    }
    return [...selected.values()];
}

function evenlySample<T>(values: T[], limit: number): T[] {
    if (values.length <= limit) return values;
    return Array.from({length: limit}, (_, index) =>
        values[Math.floor((index + 0.5) * values.length / limit)]);
}

export function raidBossCatalog(catalog: CalculatorEntry[]): RaidBossOption[] {
    return catalog
        .filter(entry => entry?.stats
            && !INTERNAL_SHADOW_FORM_IDS.has(entry.form_id)
            && ordinaryBossMoves(entry.fast_moves ?? []).length > 0
            && ordinaryBossMoves(entry.charged_moves ?? []).length > 0)
        .map(entry => ({
            formId: entry.form_id,
            dexNumber: entry.dex_number,
            name: entry.name,
            types: entry.types,
            fastMoveCount: ordinaryBossMoves(entry.fast_moves).length,
            chargedMoveCount: ordinaryBossMoves(entry.charged_moves).length,
        }))
        .sort((a, b) => a.dexNumber - b.dexNumber
            || a.name.localeCompare(b.name)
            || a.formId.localeCompare(b.formId));
}

/**
 * Rank counters with full event-driven raid battles. A cheap deterministic
 * estimate narrows the large move catalog; every returned score comes only
 * from the real simulator, never from that estimate.
 */
export function calculateRaidCounters(
    catalog: CalculatorEntry[],
    settings: RaidCounterSettings,
    shadowFormIds: ReadonlySet<string> = new Set<string>(),
    legendaryDexNumbers: ReadonlySet<number> = new Set<number>(),
    onProgress?: (completed: number, total: number) => void,
): RaidCounterResult {
    if (!RAID_COUNTER_DIFFICULTIES.includes(settings.raidDifficulty)) {
        throw new Error(`Unknown raid difficulty: ${settings.raidDifficulty}`);
    }
    const boss = catalog.find(entry => entry.form_id === settings.bossFormId);
    if (!boss) throw new Error('Choose a valid raid boss.');
    const bossFastMoves = ordinaryBossMoves(boss.fast_moves ?? []);
    const bossChargedMoves = ordinaryBossMoves(boss.charged_moves ?? []);
    if (bossFastMoves.length === 0 || bossChargedMoves.length === 0) {
        throw new Error(`${boss.name} does not have a complete ordinary raid moveset.`);
    }

    const includeMegas = settings.includeMegas !== false;
    const includeShadows = Boolean(settings.includeShadows);
    const includeLegendaries = settings.includeLegendaries !== false;
    const megaLevel = settings.megaLevel ?? 1;
    if (![1, 2, 3, 4].includes(megaLevel)) throw new Error(`Unknown Mega Level: ${megaLevel}`);
    const level = settings.level ?? 40;
    if (!RAID_COUNTER_LEVELS.includes(level)) {
        throw new Error(`Raid-counter level must be 30, 40, or 50: ${level}`);
    }
    const friendshipMultiplier = settings.friendshipMultiplier ?? 1;
    if (!(RAID_COUNTER_FRIENDSHIP_MULTIPLIERS as readonly number[]).includes(friendshipMultiplier)) {
        throw new Error(`Unknown friendship multiplier: ${friendshipMultiplier}`);
    }
    const weather = settings.weather ?? null;
    if (!RAID_COUNTER_WEATHER.includes(weather)) throw new Error(`Unknown weather: ${weather}`);
    const dodgeStrategy = settings.dodgeStrategy ?? 'none';
    if (!RAID_COUNTER_DODGE_STRATEGIES.includes(dodgeStrategy)) {
        throw new Error(`Unsupported raid-counter dodge strategy: ${dodgeStrategy}`);
    }
    const playerStrategy = settings.playerStrategy ?? 'no_strategy';
    if (!RAID_COUNTER_PLAYER_STRATEGIES.includes(playerStrategy)) {
        throw new Error(`Unsupported raid-counter player strategy: ${playerStrategy}`);
    }
    const excludeLegacy = Boolean(settings.excludeLegacy);
    const trialsPerBossMoveset = settings.trialsPerBossMoveset ?? DEFAULT_TRIALS;
    if (!Number.isInteger(trialsPerBossMoveset) || trialsPerBossMoveset < 1 || trialsPerBossMoveset > 10) {
        throw new Error('Trials per boss moveset must be an integer from 1 through 10.');
    }
    const prefilterLimit = settings.prefilterLimit ?? DEFAULT_PREFILTER_LIMIT;
    if (!Number.isInteger(prefilterLimit) || prefilterLimit < TOP_COUNTERS) {
        throw new Error(`Counter prefilter must retain at least ${TOP_COUNTERS} movesets.`);
    }

    // The regular simulator registers configured forms on demand. This dummy
    // setup creates one boss-scoped engine; candidate teams are then supplied
    // directly so thousands of engines do not have to rebuild the same catalog.
    const dummy = catalog.find(entry => entry.form_id === 'MEWTWO'
        && playerFastMoves(entry, excludeLegacy).length
        && playerChargedMoves(entry, excludeLegacy).length)
        ?? catalog.find(entry => playerFastMoves(entry, excludeLegacy).length
            && playerChargedMoves(entry, excludeLegacy).length);
    if (!dummy) throw new Error('The Pokémon catalog has no usable attackers.');
    const dummyFast = playerFastMoves(dummy, excludeLegacy)[0];
    const dummyCharged = playerChargedMoves(dummy, excludeLegacy)[0];
    const dummyTeam = Array.from({length: TEAM_SIZE}, () => [
        dummy.form_id, dummyFast.name, dummyCharged.name, level, 15, 15, 15, false, 1,
    ] as const);
    const engine = createRaidEngine({
        trials: 1,
        random_seed: 20260909,
        raid_difficulty: settings.raidDifficulty,
        boss_form_id: boss.form_id,
        boss_fast_move_names: bossFastMoves.map(move => move.name),
        boss_charged_move_names: bossChargedMoves.map(move => move.name),
        player_teams: [dummyTeam.map(member => [...member])],
        friendship_multipliers: [friendshipMultiplier],
        zacian_adventure_effect: [false],
        behemoth_bash_adventure_effect: [false],
        dynamic_punch_adventure_effect: [false],
        catch_tank_team_indices: [[]],
        party_power_groups: [],
        weather,
        dodge_strategy: dodgeStrategy,
        player_strategy: playerStrategy,
        use_purified_gems: false,
        battle_log_mode: 'none',
    }, catalog);

    const bossDefense = (boss.stats.defense + 15) * engine.BOSS_CPM;
    const bossAttack = (boss.stats.attack + 15) * engine.BOSS_CPM;
    const playerCpm = PLAYER_CPM_BY_LEVEL[level];
    const candidates: Candidate[] = [];
    for (const entry of catalog) {
        if (!entry?.stats || INTERNAL_SHADOW_FORM_IDS.has(entry.form_id)) continue;
        const mega = isMegaOrPrimal(entry);
        const legendary = legendaryDexNumbers.has(entry.dex_number);
        if (!includeMegas && mega) continue;
        if (!includeLegendaries && legendary) continue;
        const fastMoves = playerFastMoves(entry, excludeLegacy);
        const chargedMoves = playerChargedMoves(entry, excludeLegacy);
        if (fastMoves.length === 0 || chargedMoves.length === 0) continue;
        const shadowStates = includeShadows && !mega && shadowFormIds.has(entry.form_id)
            ? [false, true] : [false];
        for (const shadow of shadowStates) {
            const attack = (entry.stats.attack + 15) * playerCpm;
            const defense = (entry.stats.defense + 15) * playerCpm;
            const hp = Math.max(10, Math.floor((entry.stats.stamina + 15) * playerCpm));
            const incomingSamples = [...bossFastMoves, ...bossChargedMoves].map(move => {
                const stab = boss.types.some(type => normalizeType(type) === normalizeType(move.type)) ? STAB : 1;
                const effectiveness = engine.type_effectiveness(titleType(move.type), entry.types.map(titleType));
                return Math.floor(0.5 * move.power * bossAttack / defense
                    * stab * effectiveness * engine.weather_move_multiplier(titleType(move.type))
                    * (shadow ? SHADOW_INCOMING : 1)) + 1;
            });
            const meanIncoming = incomingSamples.reduce((sum, damage) => sum + damage, 0)
                / incomingSamples.length;
            // Only used to retain likely contenders. Three seconds per mixed
            // boss hit is deliberately conservative about defensive value.
            const approximateFieldSeconds = Math.max(1, hp / (meanIncoming / 3));
            for (const fastMove of fastMoves) {
                for (const chargedMove of chargedMoves) {
                    const outgoing = (move: CalculatorMove) => {
                        const moveType = titleType(move.type);
                        const stab = entry.types.some(type => normalizeType(type) === normalizeType(move.type)) ? STAB : 1;
                        const effectiveness = engine.type_effectiveness(moveType, engine.BOSS_TYPES);
                        return Math.floor(0.5 * movePower(move, megaLevel) * attack / bossDefense
                            * stab * effectiveness * friendshipMultiplier
                            * engine.weather_move_multiplier(moveType)
                            * (shadow ? SHADOW_OUTGOING : 1)) + 1;
                    };
                    const offenseProxy = simpleCycleDps(
                        outgoing(fastMove), fastMove.energy, fastMove.duration_ms / 1000,
                        outgoing(chargedMove), Math.abs(chargedMove.energy), chargedMove.duration_ms / 1000,
                    );
                    const transitionSeconds = 5 + 7.5;
                    const effectiveProxy = offenseProxy
                        * (TEAM_SIZE * approximateFieldSeconds)
                        / (TEAM_SIZE * approximateFieldSeconds + transitionSeconds);
                    candidates.push({
                        entry, fastMove, chargedMove, mega, shadow, legendary,
                        offenseProxy, effectiveProxy,
                    });
                }
            }
        }
    }

    const selected = prefilterCandidates(candidates, prefilterLimit);
    const fastByName = new Map(Object.values(engine.BOSS_FAST_MOVES).map(move => [move.name, move]));
    const chargedByName = new Map(Object.values(engine.BOSS_CHARGED_MOVES).map(move => [move.name, move]));
    const allBossMovePairs = bossFastMoves.flatMap(fastMove => bossChargedMoves.map(chargedMove => ({
        fastMove,
        chargedMove,
        engineFast: fastByName.get(fastMove.name)!,
        engineCharged: chargedByName.get(chargedMove.name)!,
    })));
    const bossMovePairs = evenlySample(allBossMovePairs, MAX_BOSS_MOVESETS);
    const bestByForm = new Map<string, RaidCounterRow>();

    for (let candidateIndex = 0; candidateIndex < selected.length; candidateIndex += 1) {
        const candidate = selected[candidateIndex];
        const species = new engine.Species(
            candidate.entry.name,
            candidate.entry.stats.attack,
            candidate.entry.stats.defense,
            candidate.entry.stats.stamina,
            candidate.entry.types.map(titleType),
            false,
            [],
            false,
            candidate.entry.form_id,
        );
        const makeMove = (move: CalculatorMove) => new engine.Move(
            move.name,
            move.power,
            move.duration_ms / 1000,
            Math.abs(move.energy),
            titleType(move.type),
            false,
            move.plus_powers?.length === 4
                ? move.plus_powers as [number, number, number, number]
                : null,
        );
        const fast = makeMove(candidate.fastMove);
        const charged = makeMove(candidate.chargedMove);
        let totalDamage = 0;
        let totalBattleSeconds = 0;
        let totalFaints = 0;
        let totalRejoins = 0;
        let wins = 0;
        let winSeconds = 0;
        let battles = 0;

        for (let pairIndex = 0; pairIndex < bossMovePairs.length; pairIndex += 1) {
            const pair = bossMovePairs[pairIndex];
            for (let trial = 0; trial < trialsPerBossMoveset; trial += 1) {
                const seed = 20260909 + pairIndex * 1009 + trial * 7919;
                const team = Array.from({length: TEAM_SIZE}, () => new engine.BattlePokemon(
                    species, fast, charged, level, 15, 15, 15, candidate.shadow, megaLevel,
                ));
                const dodgeProfiles: Record<string, InstanceType<typeof engine.DodgeProfile>> = Object.create(null);
                team.forEach((pokemon, pokemonIndex) => {
                    const effectiveness = engine.type_effectiveness(
                        pair.engineCharged.move_type,
                        pokemon.species.types,
                    );
                    for (const enraged of [false, true]) {
                        const fullDamage = engine.incoming_damage_for_pokemon(
                            pair.engineCharged, pokemon, enraged, false, 1,
                        );
                        const dodgedDamage = engine.incoming_damage_for_pokemon(
                            pair.engineCharged, pokemon, enraged, true, 1,
                        );
                        dodgeProfiles[JSON.stringify([0, pokemonIndex, enraged])] = new engine.DodgeProfile(
                            fullDamage,
                            dodgedDamage,
                            effectiveness > 1,
                            effectiveness < 1,
                            false,
                        );
                    }
                });
                const simulation = new engine.Simulation(
                    pair.engineFast,
                    pair.engineCharged,
                    new PythonRandom(seed),
                    dodgeProfiles,
                );
                simulation.players = [new engine.Player(team)];
                const result = simulation.run();
                const damage = Math.min(engine.BOSS_HP, Math.max(0, engine.BOSS_HP - result.boss_hp));
                totalDamage += damage;
                totalBattleSeconds += result.won ? result.finish_time : engine.RAID_SECONDS;
                totalFaints += result.faints;
                totalRejoins += result.rejoins;
                battles += 1;
                if (result.won) {
                    wins += 1;
                    winSeconds += result.finish_time;
                }
            }
        }

        const row: RaidCounterRow = {
            formId: candidate.entry.form_id,
            dexNumber: candidate.entry.dex_number,
            name: candidate.entry.name,
            pokemonTypes: candidate.entry.types,
            fastMove: candidate.fastMove.name,
            fastMoveType: normalizeType(candidate.fastMove.type),
            chargedMove: displayedMoveName(candidate.chargedMove, megaLevel),
            chargedMoveType: normalizeType(candidate.chargedMove.type),
            eliteFast: Boolean(candidate.fastMove.elite),
            eliteCharged: Boolean(candidate.chargedMove.elite),
            mega: candidate.mega,
            shadow: candidate.shadow,
            legendary: candidate.legendary,
            battleDps: totalDamage / Math.max(EPSILON, totalBattleSeconds),
            averageDamagePercent: totalDamage / battles / engine.BOSS_HP * 100,
            averageFaints: totalFaints / battles,
            averageRejoins: totalRejoins / battles,
            winPercent: wins / battles * 100,
            averageWinTime: wins ? winSeconds / wins : null,
        };
        const key = `${row.formId}:${row.shadow ? 'shadow' : 'normal'}`;
        const previous = bestByForm.get(key);
        if (!previous || row.battleDps > previous.battleDps + EPSILON
            || (Math.abs(row.battleDps - previous.battleDps) <= EPSILON
                && row.averageDamagePercent > previous.averageDamagePercent)) {
            bestByForm.set(key, row);
        }
        if (candidateIndex % 8 === 0 || candidateIndex + 1 === selected.length) {
            onProgress?.(candidateIndex + 1, selected.length);
        }
    }

    const rows = [...bestByForm.values()]
        .sort((a, b) => b.battleDps - a.battleDps
            || b.averageDamagePercent - a.averageDamagePercent
            || a.averageFaints - b.averageFaints
            || a.dexNumber - b.dexNumber
            || a.name.localeCompare(b.name))
        .slice(0, TOP_COUNTERS);
    return {
        bossFormId: boss.form_id,
        bossName: boss.name,
        bossDexNumber: boss.dex_number,
        bossTypes: boss.types,
        raidDifficulty: settings.raidDifficulty,
        includeMegas,
        includeShadows,
        includeLegendaries,
        megaLevel,
        bossFastMoves: bossFastMoves.map(move => move.name),
        bossChargedMoves: bossChargedMoves.map(move => move.name),
        bossMovesets: bossMovePairs.length,
        totalBossMovesets: allBossMovePairs.length,
        candidateMovesets: candidates.length,
        simulatedMovesets: selected.length,
        simulatedBattles: selected.length * bossMovePairs.length * trialsPerBossMoveset,
        rows,
        assumptions: {
            level,
            attackIV: 15,
            defenseIV: 15,
            staminaIV: 15,
            teamSize: TEAM_SIZE,
            trialsPerBossMoveset,
            dodgeStrategy,
            playerStrategy,
            friendshipMultiplier,
            weather,
            excludeLegacyMoves: excludeLegacy,
            partyPower: false,
            purifiedGems: false,
            analyticalPrefilter: candidates.length > selected.length,
            maximumBossMovesets: MAX_BOSS_MOVESETS,
        },
    };
}
