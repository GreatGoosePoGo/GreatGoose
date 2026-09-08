export type DodgeStrategy = 'none' | 'all_survivable' | 'super_effective' | 'non_resisted' | 'lethal_only' | 'downtime_saver';
export type PlayerStrategy = 'no_strategy' | 'hot_swap_greedy' | 'hot_swap_cautious' | 'hot_swap_very_cautious' | 'catch_tank';
export type RaidDifficulty = 'Tier 1' | 'Tier 3' | 'Tier 4' | 'Tier 5' | 'Mega' | 'Mega Legendary' | 'Super Mega' | 'Elite' | 'Primal' | 'Tier 1 Shadow' | 'Tier 3 Shadow' | 'Tier 5 Shadow';
export type Weather = null | 'Sunny/Clear' | 'Rainy' | 'Partly Cloudy' | 'Cloudy' | 'Windy' | 'Snow' | 'Fog';
export type TeamMember = [
    species: string,
    fast: string,
    charged: string,
    level: number,
    attackIV?: number,
    defenseIV?: number,
    staminaIV?: number,
    shadow?: boolean,
    megaLevel?: number
];
export interface RaidConfig {
    trials?: number;
    random_seed?: number | string | bigint;
    raid_difficulty?: RaidDifficulty;
    boss_form_id?: string;
    boss_manual_profile?: {
        name?: string;
        attack?: number;
        defense?: number;
        types?: string[];
    } | null;
    boss_fast_move_names?: string[];
    boss_charged_move_names?: string[];
    boss_move_display_names?: Record<string, string>;
    player_teams?: TeamMember[][];
    friendship_multipliers?: number[];
    zacian_adventure_effect?: boolean[];
    behemoth_bash_adventure_effect?: boolean[];
    dynamic_punch_adventure_effect?: boolean[];
    catch_tank_team_indices?: number[][];
    party_power_groups?: number[][];
    boosted_party_power?: boolean;
    weather?: Weather;
    dodge_strategy?: DodgeStrategy;
    player_strategy?: PlayerStrategy;
    battle_log_mode?: 'none' | 'moves' | 'full';
    use_purified_gems?: boolean;
    /** Explicit replay preamble overrides, validated before engine creation. */
    raid_seconds?: number;
    boss_hp?: number;
    boss_cpm?: number;
}
export interface CalculatorMove {
    id: string;
    name: string;
    power: number;
    energy: number;
    duration_ms: number;
    type: string;
    elite?: boolean;
    /** Raid power at Mega Levels 1–4 for a temporary Mega "+" move. */
    plus_powers?: number[];
}
export interface CalculatorEntry {
    form_id: string;
    name: string;
    dex_number: number;
    types: string[];
    stats: {
        attack: number;
        defense: number;
        stamina: number;
    };
    fast_moves: CalculatorMove[];
    charged_moves: CalculatorMove[];
    exclusive_fast_moves?: CalculatorMove[];
    exclusive_charged_moves?: CalculatorMove[];
    mega_charged_moves?: CalculatorMove[];
}
export interface PokemonInput {
    name: string;
    fast_move: string;
    charged_move: string;
    level: number;
    attack_iv?: number;
    defense_iv?: number;
    stamina_iv?: number;
    mega_level?: number;
    shadow?: boolean;
    catch_tank?: boolean;
}
export interface PlayerInput {
    team: PokemonInput[];
}
export interface SimulationRequest {
    boss: string;
    boss_fast_move: string;
    boss_charged_move: string;
    /** Legacy single-player input. Use players for calculator raids with multiple trainers. */
    team?: PokemonInput[];
    players?: PlayerInput[];
    raid_difficulty?: RaidDifficulty;
    weather?: Weather;
    simulation_count?: number;
    boss_moveset_mode?: 'selected' | 'all';
    random_seed?: number | string;
    friendship?: number;
    zacian_adventure_effect?: boolean;
    behemoth_bash_adventure_effect?: boolean;
    dynamic_punch_adventure_effect?: boolean;
    dodge_strategy?: DodgeStrategy;
    player_strategy?: PlayerStrategy;
    battle_log_mode?: 'none' | 'moves' | 'full';
    use_purified_gems?: boolean;
}
export type ManualAction = 'wait' | 'fast' | 'charged' | 'dodge' | 'switch' | 'quit' | 'rejoin';
