/** Native TypeScript port of the supplied Python reference. No Python runtime is used. */
import * as py from "./compatibility.js";
import { PythonRandom } from "./random.js";
import { re } from "./text.js";
import type { RaidConfig, CalculatorEntry } from "./types.js";
export function createRaidEngine(input: RaidConfig, catalog: CalculatorEntry[]) {
    const config: any = structuredClone(input);
    let TRIALS_PER_MOVESET: any;
    let RANDOM_SEED: bigint;
    let RAID_DIFFICULTIES: any;
    let RAID_DIFFICULTY: any;
    let RAID_RULES: any;
    let RAID_SECONDS: number;
    let BOSS_HP: number;
    let BOSS_CPM: number;
    let SUPER_MEGA_ENRAGE: any;
    let SHADOW_RAID: any;
    let ENRAGE_HP: any;
    let SHADOW_UNENRAGE_HP: any;
    let FAST_MOVE_DELAY: any;
    let BOSS_CHARGED_CHANCE: any;
    let BOSS_MAX_ENERGY: any;
    let ENRAGE_ATTACK_MULTIPLIER: any;
    let SHADOW_ENRAGE_DEFENSE_BONUS: number;
    let SHADOW_ENRAGE_ATTACK_BONUS: number;
    let USE_PURIFIED_GEMS: boolean;
    let PURIFIED_GEM_COOLDOWN: number;
    let PURIFIED_GEM_LIMIT_PER_PLAYER: number;
    let PURIFIED_GEMS_TO_SUBDUE: number;
    let DODGE_SECONDS: any;
    let DODGED_DAMAGE_FRACTION: any;
    let SWITCH_SECONDS: any;
    let REJOIN_TIMES: any;
    let PLAYER_ENERGY_FROM_DAMAGE: any;
    let PLAYER_TEAMS: any;
    let PARTY_POWER_GROUPS: any;
    let BOOSTED_PARTY_POWER: any;
    let NORMAL_PARTY_POWER_THRESHOLDS: any;
    let BOOSTED_PARTY_POWER_THRESHOLDS: any;
    let FRIENDSHIP_MULTIPLIERS: any;
    let ZACIAN_ADVENTURE_EFFECT: any;
    let BEHEMOTH_BASH_ADVENTURE_EFFECT: any;
    let DYNAMIC_PUNCH_ADVENTURE_EFFECT: any;
    let WEATHER: any;
    let SAME_TYPE_MEGA_ALLY_MULTIPLIER: any;
    let OTHER_TYPE_MEGA_ALLY_MULTIPLIER: any;
    let ZACIAN_MULTIPLIER: any;
    let BEHEMOTH_BASH_DEFENSE_MULTIPLIER: any;
    let DYNAMIC_PUNCH_ATTACK_MULTIPLIER: any;
    let DYNAMIC_PUNCH_RAID_DIFFICULTIES: any;
    let WEATHER_MULTIPLIER: any;
    let BOSS_FORM_ID: any;
    let BOSS_MANUAL_PROFILE: any;
    let BOSS_FAST_MOVE_NAMES: any;
    let BOSS_CHARGED_MOVE_NAMES: any;
    let BOSS_MOVE_DISPLAY_NAMES: any;
    let DODGE_STRATEGY: any;
    let DODGE_STRATEGIES: any;
    let PLAYER_STRATEGY: any;
    let PLAYER_STRATEGIES: any;
    let BATTLE_LOG_MODE: any;
    let BATTLE_LOG_MODES: any;
    let HOT_SWAP_CHARGED_DAMAGE_RESERVES: any;
    let CATCH_TANK_TEAM_INDICES: any;
    let _team: any;
    let CALCULATOR_DATA_PATH: any;
    let STAB: any;
    let SUPER_EFFECTIVE: any;
    let NOT_VERY_EFFECTIVE: any;
    let IMMUNITY_AS_DOUBLE_RESISTANCE: any;
    let TYPES: any;
    let HIDDEN_POWER_TYPES: string[];
    let move_type: any;
    let WEATHER_BOOSTED_TYPES: any;
    let CPM_BY_HALF_LEVEL: any;
    let TYPE_RELATIONSHIPS: any;
    let CALCULATOR_DATA: any;
    let BOSS_DATA: any;
    let _boss_stats: any;
    let _manual: any;
    let BOSS_NAME: string;
    let BOSS_ATTACK_BASE: any;
    let BOSS_DEFENSE_BASE: any;
    let BOSS_TYPES: string[];
    let BOSS_ATTACK: any;
    let BOSS_DEFENSE: any;
    let MUD_SHOT: any;
    let PRECIPICE_BLADES: any;
    let SANDSEAR_STORM: any;
    let EARTH_POWER: any;
    let EARTHQUAKE: any;
    let DRAGON_TAIL: any;
    let DYNAMAX_CANNON: any;
    let ACID_SPRAY_PLUS: any;
    let LIQUIDATION_PLUS: any;
    let OUTRAGE_PLUS: any;
    let DRILL_PECK_PLUS: any;
    let SEED_BOMB_PLUS: any;
    let MYSTICAL_FIRE_PLUS: any;
    let SURF_PLUS: any;
    let PSYBEAM_PLUS: any;
    let BRICK_BREAK_PLUS: any;
    let VOLT_TACKLE_PLUS: any;
    let DYNAMIC_PUNCH_PLUS: any;
    let ZAP_CANNON_PLUS: any;
    let FUTURE_SIGHT_PLUS: any;
    let PLUS_MOVE_FORM_IDS: any;
    let MOVES: Record<string, Move>;
    let move: any;
    let SPECIES: Record<string, Species>;
    let BOSS_FAST_MOVES: Record<string, Move>;
    let BOSS_CHARGED_MOVES: Record<string, Move>;
    /** Each engine owns its configuration and catalogs. Simulation instances own
     * HP, energy, event queues and RNG state. Keep custom battle rules in a separate
     * ruleset when they diverge from this supplied vanilla reference.
     */
    TRIALS_PER_MOVESET = 1000;
    RANDOM_SEED = 20260716n;
    RAID_DIFFICULTIES = py.dict([["Tier 1", py.dict([["hp", 600], ["cpm", 0.5974], ["seconds", 180.0]])], ["Tier 3", py.dict([["hp", 3600], ["cpm", 0.73], ["seconds", 180.0]])], ["Tier 4", py.dict([["hp", 9000], ["cpm", 0.79], ["seconds", 300.0]])], ["Tier 5", py.dict([["hp", 15000], ["cpm", 0.79], ["seconds", 300.0]])], ["Mega", py.dict([["hp", 9000], ["cpm", 0.79], ["seconds", 300.0]])], ["Mega Legendary", py.dict([["hp", 22500], ["cpm", 0.79], ["seconds", 300.0]])], ["Super Mega", py.dict([["hp", 25000], ["cpm", 0.79], ["seconds", 300.0], ["super_mega_enrage", true]])], ["Elite", py.dict([["hp", 22500], ["cpm", 1.0], ["seconds", 300.0]])], ["Primal", py.dict([["hp", 22500], ["cpm", 0.79], ["seconds", 300.0]])], ["Tier 1 Shadow", py.dict([["hp", 600], ["cpm", 0.5974], ["seconds", 180.0], ["shadow", true]])], ["Tier 3 Shadow", py.dict([["hp", 3600], ["cpm", 0.76], ["seconds", 180.0], ["shadow", true]])], ["Tier 5 Shadow", py.dict([["hp", 15000], ["cpm", 0.82], ["seconds", 300.0], ["shadow", true]])]]);
    RAID_DIFFICULTY = "Tier 5";
    if (py.truth(((!py.has(RAID_DIFFICULTIES, RAID_DIFFICULTY))))) {
        throw new Error(`Unknown RAID_DIFFICULTY ${py.repr(RAID_DIFFICULTY)}; choose from ${py.str(py.iter(RAID_DIFFICULTIES))}`);
    }
    RAID_RULES = py.at(RAID_DIFFICULTIES, RAID_DIFFICULTY);
    RAID_SECONDS = py.at(RAID_RULES, "seconds");
    BOSS_HP = py.at(RAID_RULES, "hp");
    BOSS_CPM = py.at(RAID_RULES, "cpm");
    SUPER_MEGA_ENRAGE = py.get(RAID_RULES, "super_mega_enrage", false);
    SHADOW_RAID = py.get(RAID_RULES, "shadow", false);
    ENRAGE_HP = (py.truth(py.or(SHADOW_RAID, () => SUPER_MEGA_ENRAGE)) ? Math.floor(py.mul(BOSS_HP, (py.truth(SHADOW_RAID) ? 0.6 : 0.8))) : -1);
    SHADOW_UNENRAGE_HP = (py.truth(SHADOW_RAID) ? Math.floor(py.mul(BOSS_HP, 0.15)) : -1);
    FAST_MOVE_DELAY = 2.5;
    BOSS_CHARGED_CHANCE = 0.3;
    BOSS_MAX_ENERGY = 200.0;
    ENRAGE_ATTACK_MULTIPLIER = 1.8;
    // Change only this value when testing a different Shadow enrage defense bonus.
    SHADOW_ENRAGE_DEFENSE_BONUS = 2.2;
    SHADOW_ENRAGE_ATTACK_BONUS = 0.8;
    USE_PURIFIED_GEMS = false;
    PURIFIED_GEM_COOLDOWN = 5.0;
    PURIFIED_GEM_LIMIT_PER_PLAYER = 5;
    PURIFIED_GEMS_TO_SUBDUE = 8;
    DODGE_SECONDS = 1.0;
    DODGED_DAMAGE_FRACTION = 0.25;
    SWITCH_SECONDS = 1.0;
    REJOIN_TIMES = [7.0, 7.5, 8.0];
    PLAYER_ENERGY_FROM_DAMAGE = true;
    PLAYER_TEAMS = [[["Electivire", "Thunder Shock", "Wild Charge", 40.5, 15, 15, 15], ["Luxray", "Spark", "Wild Charge", 43.0, 15, 13, 14], ["Torterra", "Razor Leaf", "Frenzy Plant", 40.0, 14, 15, 14], ["Venusaur", "Vine Whip", "Frenzy Plant", 45.0, 13, 14, 15], ["Zekrom", "Charge Beam", "Fusion Bolt", 25.0, 14, 12, 12], ["Venusaur", "Vine Whip", "Frenzy Plant", 43.0, 15, 15, 15]]];
    PARTY_POWER_GROUPS = [];
    BOOSTED_PARTY_POWER = false;
    NORMAL_PARTY_POWER_THRESHOLDS = py.dict([[2, 18], [3, 8], [4, 6]]);
    BOOSTED_PARTY_POWER_THRESHOLDS = py.dict([[2, 9], [3, 5], [4, 3]]);
    FRIENDSHIP_MULTIPLIERS = [1.0];
    ZACIAN_ADVENTURE_EFFECT = [false];
    BEHEMOTH_BASH_ADVENTURE_EFFECT = [false];
    DYNAMIC_PUNCH_ADVENTURE_EFFECT = [false];
    WEATHER = null;
    SAME_TYPE_MEGA_ALLY_MULTIPLIER = 1.3;
    OTHER_TYPE_MEGA_ALLY_MULTIPLIER = 1.1;
    ZACIAN_MULTIPLIER = 1.1;
    BEHEMOTH_BASH_DEFENSE_MULTIPLIER = 1.1;
    DYNAMIC_PUNCH_ATTACK_MULTIPLIER = 1.15;
    DYNAMIC_PUNCH_RAID_DIFFICULTIES = py.set(new Set<any>(["Tier 4", "Mega", "Mega Legendary", "Super Mega"]));
    WEATHER_MULTIPLIER = 1.2;
    BOSS_FORM_ID = "KYOGRE";
    BOSS_MANUAL_PROFILE = null;
    BOSS_FAST_MOVE_NAMES = [];
    BOSS_CHARGED_MOVE_NAMES = ["Hydro Pump", "Blizzard", "Thunder", "Surf", "Avalanche"];
    BOSS_MOVE_DISPLAY_NAMES = py.dict([]);
    DODGE_STRATEGY = "downtime_saver";
    DODGE_STRATEGIES = ["none", "all_survivable", "super_effective", "non_resisted", "lethal_only", "downtime_saver"];
    PLAYER_STRATEGY = "no_strategy";
    PLAYER_STRATEGIES = ["no_strategy", "hot_swap_greedy", "hot_swap_cautious", "hot_swap_very_cautious", "catch_tank"];
    BATTLE_LOG_MODE = "full";
    BATTLE_LOG_MODES = ["none", "moves", "full"];
    HOT_SWAP_CHARGED_DAMAGE_RESERVES = py.dict([["hot_swap_greedy", 0.0], ["hot_swap_cautious", 0.1], ["hot_swap_very_cautious", 0.15]]);
    CATCH_TANK_TEAM_INDICES = py.iter(PLAYER_TEAMS).map((_team: any) => ([]));
    CALCULATOR_DATA_PATH = py.dict([["name", "calculator_data.json"]]);
    TRIALS_PER_MOVESET = py.int(py.get(config, "trials", TRIALS_PER_MOVESET));
    RANDOM_SEED = BigInt(py.parseSeed(py.get(config, "random_seed", RANDOM_SEED)));
    RAID_DIFFICULTY = py.str(py.get(config, "raid_difficulty", RAID_DIFFICULTY));
    if (py.truth(((!py.has(RAID_DIFFICULTIES, RAID_DIFFICULTY))))) {
        throw new Error(`Unknown raid difficulty ${py.repr(RAID_DIFFICULTY)}; choose from ${py.str(py.iter(RAID_DIFFICULTIES))}`);
    }
    RAID_RULES = py.at(RAID_DIFFICULTIES, RAID_DIFFICULTY);
    RAID_SECONDS = py.at(RAID_RULES, "seconds");
    BOSS_HP = py.at(RAID_RULES, "hp");
    BOSS_CPM = py.at(RAID_RULES, "cpm");
    SUPER_MEGA_ENRAGE = py.get(RAID_RULES, "super_mega_enrage", false);
    SHADOW_RAID = py.get(RAID_RULES, "shadow", false);
    ENRAGE_HP = (py.truth(py.or(SHADOW_RAID, () => SUPER_MEGA_ENRAGE)) ? Math.floor(py.mul(BOSS_HP, (py.truth(SHADOW_RAID) ? 0.6 : 0.8))) : -1);
    SHADOW_UNENRAGE_HP = (py.truth(SHADOW_RAID) ? Math.floor(py.mul(BOSS_HP, 0.15)) : -1);
    USE_PURIFIED_GEMS = py.truth(py.get(config, "use_purified_gems", USE_PURIFIED_GEMS));
    PLAYER_TEAMS = py.get(config, "player_teams", PLAYER_TEAMS);
    CATCH_TANK_TEAM_INDICES = py.get(config, "catch_tank_team_indices", CATCH_TANK_TEAM_INDICES);
    PARTY_POWER_GROUPS = py.get(config, "party_power_groups", PARTY_POWER_GROUPS);
    BOOSTED_PARTY_POWER = py.truth(py.get(config, "boosted_party_power", BOOSTED_PARTY_POWER));
    FRIENDSHIP_MULTIPLIERS = py.get(config, "friendship_multipliers", FRIENDSHIP_MULTIPLIERS);
    ZACIAN_ADVENTURE_EFFECT = py.get(config, "zacian_adventure_effect", ZACIAN_ADVENTURE_EFFECT);
    BEHEMOTH_BASH_ADVENTURE_EFFECT = py.get(config, "behemoth_bash_adventure_effect", py.mul([false], py.len(PLAYER_TEAMS)));
    DYNAMIC_PUNCH_ADVENTURE_EFFECT = py.get(config, "dynamic_punch_adventure_effect", py.mul([false], py.len(PLAYER_TEAMS)));
    WEATHER = py.get(config, "weather", WEATHER);
    BOSS_FORM_ID = py.str(py.get(config, "boss_form_id", BOSS_FORM_ID));
    BOSS_MANUAL_PROFILE = py.get(config, "boss_manual_profile", BOSS_MANUAL_PROFILE);
    BOSS_FAST_MOVE_NAMES = py.iter(py.get(config, "boss_fast_move_names", BOSS_FAST_MOVE_NAMES));
    BOSS_CHARGED_MOVE_NAMES = py.iter(py.get(config, "boss_charged_move_names", BOSS_CHARGED_MOVE_NAMES));
    BOSS_MOVE_DISPLAY_NAMES = py.dict(py.get(config, "boss_move_display_names", BOSS_MOVE_DISPLAY_NAMES));
    DODGE_STRATEGY = py.str(py.get(config, "dodge_strategy", DODGE_STRATEGY));
    PLAYER_STRATEGY = py.str(py.get(config, "player_strategy", PLAYER_STRATEGY));
    BATTLE_LOG_MODE = py.str(py.get(config, "battle_log_mode", BATTLE_LOG_MODE));
    RAID_SECONDS = py.get(config, "raid_seconds", RAID_SECONDS);
    BOSS_HP = py.get(config, "boss_hp", BOSS_HP);
    BOSS_CPM = py.get(config, "boss_cpm", BOSS_CPM);
    ENRAGE_HP = (py.truth(py.or(SHADOW_RAID, () => SUPER_MEGA_ENRAGE)) ? Math.floor(py.mul(BOSS_HP, (py.truth(SHADOW_RAID) ? 0.6 : 0.8))) : -1);
    SHADOW_UNENRAGE_HP = (py.truth(SHADOW_RAID) ? Math.floor(py.mul(BOSS_HP, 0.15)) : -1);
    STAB = 1.2;
    SUPER_EFFECTIVE = 1.6;
    NOT_VERY_EFFECTIVE = 0.625;
    IMMUNITY_AS_DOUBLE_RESISTANCE = 0.390625;
    TYPES = ["Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy"];
    HIDDEN_POWER_TYPES = py.iter(py.iter(TYPES).filter((move_type: any) => py.truth(((!py.has(new Set<any>(["Normal", "Fairy"]), move_type))))).map((move_type: any) => (move_type)));
    WEATHER_BOOSTED_TYPES = py.dict([[null, py.set()], ["Sunny/Clear", py.set(new Set<any>(["Grass", "Fire", "Ground"]))], ["Rainy", py.set(new Set<any>(["Water", "Electric", "Bug"]))], ["Partly Cloudy", py.set(new Set<any>(["Normal", "Rock"]))], ["Cloudy", py.set(new Set<any>(["Fairy", "Fighting", "Poison"]))], ["Windy", py.set(new Set<any>(["Flying", "Dragon", "Psychic"]))], ["Snow", py.set(new Set<any>(["Ice", "Steel"]))], ["Fog", py.set(new Set<any>(["Dark", "Ghost"]))]]);
    CPM_BY_HALF_LEVEL = py.dict(py.zip(py.range(2, 111), [0.094, 0.135137432, 0.16639787, 0.192650919, 0.21573247, 0.236572661, 0.25572005, 0.273530381, 0.29024988, 0.306057377, 0.3210876, 0.335445036, 0.34921268, 0.362457751, 0.37523559, 0.387592406, 0.39956728, 0.411193551, 0.42250001, 0.432926419, 0.44310755, 0.453059958, 0.46279839, 0.472336083, 0.48168495, 0.4908558, 0.49985844, 0.508701765, 0.51739395, 0.525942511, 0.53435433, 0.542635767, 0.55079269, 0.558830576, 0.56675452, 0.574569153, 0.58227891, 0.589887917, 0.59740001, 0.604818814, 0.61215729, 0.619399365, 0.62656713, 0.633644533, 0.64065295, 0.647576426, 0.65443563, 0.661214806, 0.667934, 0.674577537, 0.68116492, 0.687680648, 0.69414365, 0.700538673, 0.70688421, 0.713164996, 0.71939909, 0.725571552, 0.7317, 0.734741009, 0.73776948, 0.740785574, 0.74378943, 0.746781211, 0.74976104, 0.752729087, 0.75568551, 0.758630378, 0.76156384, 0.764486065, 0.76739717, 0.770297266, 0.7731865, 0.776064962, 0.77893275, 0.781790055, 0.78463697, 0.787473578, 0.79030001, 0.792803968, 0.79530001, 0.797803921, 0.8003, 0.802803892, 0.8053, 0.807803863, 0.81029999, 0.812803834, 0.81529999, 0.817803806, 0.82029999, 0.822803778, 0.82529999, 0.82780375, 0.83029999, 0.832803753, 0.83529999, 0.837803755, 0.84029999, 0.842803697870388, 0.84529999, 0.847803676002882, 0.85029999, 0.852803654391795, 0.85529999, 0.857803633032642, 0.86029999, 0.862803611921044, 0.86529999]));
    TYPE_RELATIONSHIPS = py.dict([["Normal", [py.dict([]), new Set<any>(["Rock", "Steel"]), new Set<any>(["Ghost"])]], ["Fire", [new Set<any>(["Grass", "Ice", "Bug", "Steel"]), new Set<any>(["Fire", "Water", "Rock", "Dragon"]), py.dict([])]], ["Water", [new Set<any>(["Fire", "Ground", "Rock"]), new Set<any>(["Water", "Grass", "Dragon"]), py.dict([])]], ["Electric", [new Set<any>(["Water", "Flying"]), new Set<any>(["Electric", "Grass", "Dragon"]), new Set<any>(["Ground"])]], ["Grass", [new Set<any>(["Water", "Ground", "Rock"]), new Set<any>(["Fire", "Grass", "Poison", "Flying", "Bug", "Dragon", "Steel"]), py.dict([])]], ["Ice", [new Set<any>(["Grass", "Ground", "Flying", "Dragon"]), new Set<any>(["Fire", "Water", "Ice", "Steel"]), py.dict([])]], ["Fighting", [new Set<any>(["Normal", "Ice", "Rock", "Dark", "Steel"]), new Set<any>(["Poison", "Flying", "Psychic", "Bug", "Fairy"]), new Set<any>(["Ghost"])]], ["Poison", [new Set<any>(["Grass", "Fairy"]), new Set<any>(["Poison", "Ground", "Rock", "Ghost"]), new Set<any>(["Steel"])]], ["Ground", [new Set<any>(["Fire", "Electric", "Poison", "Rock", "Steel"]), new Set<any>(["Grass", "Bug"]), new Set<any>(["Flying"])]], ["Flying", [new Set<any>(["Grass", "Fighting", "Bug"]), new Set<any>(["Electric", "Rock", "Steel"]), py.dict([])]], ["Psychic", [new Set<any>(["Fighting", "Poison"]), new Set<any>(["Psychic", "Steel"]), new Set<any>(["Dark"])]], ["Bug", [new Set<any>(["Grass", "Psychic", "Dark"]), new Set<any>(["Fire", "Fighting", "Poison", "Flying", "Ghost", "Steel", "Fairy"]), py.dict([])]], ["Rock", [new Set<any>(["Fire", "Ice", "Flying", "Bug"]), new Set<any>(["Fighting", "Ground", "Steel"]), py.dict([])]], ["Ghost", [new Set<any>(["Psychic", "Ghost"]), new Set<any>(["Dark"]), new Set<any>(["Normal"])]], ["Dragon", [new Set<any>(["Dragon"]), new Set<any>(["Steel"]), new Set<any>(["Fairy"])]], ["Dark", [new Set<any>(["Psychic", "Ghost"]), new Set<any>(["Fighting", "Dark", "Fairy"]), py.dict([])]], ["Steel", [new Set<any>(["Ice", "Rock", "Fairy"]), new Set<any>(["Fire", "Water", "Electric", "Steel"]), py.dict([])]], ["Fairy", [new Set<any>(["Fighting", "Dragon", "Dark"]), new Set<any>(["Fire", "Poison", "Steel"]), py.dict([])]]]);
    function type_effectiveness(move_type: string, defender_types: (string)[]): number {
        let super_types: any;
        let resisted_types: any;
        let immune_types: any;
        let result: any;
        let defender_type: any;
        /** Multiply the move's effectiveness against each defending type. */
        [super_types, resisted_types, immune_types] = py.at(TYPE_RELATIONSHIPS, move_type);
        result = 1.0;
        for (const __item of py.iter(defender_types)) {
            defender_type = __item;
            if (py.truth(((py.has(immune_types, defender_type))))) {
                result = py.mul(result, IMMUNITY_AS_DOUBLE_RESISTANCE);
            }
            else {
                if (py.truth(((py.has(super_types, defender_type))))) {
                    result = py.mul(result, SUPER_EFFECTIVE);
                }
                else {
                    if (py.truth(((py.has(resisted_types, defender_type))))) {
                        result = py.mul(result, NOT_VERY_EFFECTIVE);
                    }
                }
            }
        }
        return result;
    }
    class Move {
        constructor(public name: string, public power: number, public duration: number, public energy: number, public move_type: string, public dodge: boolean = false, public plus_powers: [
            number,
            number,
            number,
            number
        ] | null = null) { }
    }
    class Species {
        constructor(public name: string, public attack: number, public defense: number, public stamina: number, public types: (string)[], public shadow: boolean = false, public mega_boost_types: (string)[] = [], public persistent_mega_boost: boolean = false, public form_id: string | null = null) { }
    }
    function find_calculator_species(data: (Record<string, any>)[], form_id: string): Record<string, any> {
        let matches: any;
        let entry: any;
        matches = py.iter(data).filter((entry: any) => py.truth(((py.equal(py.get(entry, "form_id"), form_id))))).map((entry: any) => (entry));
        if (py.truth(((!py.equal(py.len(matches), 1))))) {
            throw new Error(`BOSS_FORM_ID ${py.repr(form_id)} matched ${py.str(py.len(matches))} records in ${py.str(CALCULATOR_DATA_PATH.name)}; expected exactly one`);
        }
        return py.at(matches, 0);
    }
    function move_from_calculator(entry: Record<string, any>, dodge: boolean = false): Move {
        let name: any;
        let display_name: any;
        /** Convert one calculator-data move, normalizing charged energy to positive. */
        name = py.at(entry, "name");
        display_name = py.get(BOSS_MOVE_DISPLAY_NAMES, name, name);
        return new Move(display_name, py.int(py.at(entry, "power")), (py.int(py.at(entry, "duration_ms")) / 1000), Math.abs(py.int(py.at(entry, "energy"))), py.title(py.str(py.at(entry, "type"))), dodge);
    }
    CALCULATOR_DATA = catalog;
    BOSS_DATA = find_calculator_species(CALCULATOR_DATA, BOSS_FORM_ID);
    _boss_stats = py.at(BOSS_DATA, "stats");
    _manual = py.or(BOSS_MANUAL_PROFILE, () => py.dict([]));
    BOSS_NAME = py.str(py.get(_manual, "name", py.at(BOSS_DATA, "name")));
    BOSS_ATTACK_BASE = py.int(py.get(_manual, "attack", py.at(_boss_stats, "attack")));
    BOSS_DEFENSE_BASE = py.int(py.get(_manual, "defense", py.at(_boss_stats, "defense")));
    BOSS_TYPES = py.iter(py.iter(py.get(_manual, "types", py.at(BOSS_DATA, "types"))).map((move_type: any) => (py.title(py.str(move_type)))));
    BOSS_ATTACK = py.add(BOSS_ATTACK_BASE, 15);
    BOSS_DEFENSE = py.add(BOSS_DEFENSE_BASE, 15);
    MUD_SHOT = new Move("Mud Shot", 4, 0.5, 6, "Ground");
    PRECIPICE_BLADES = new Move("Precipice Blades", 120, 1.5, 100, "Ground");
    SANDSEAR_STORM = new Move("Sandsear Storm", 150, 2.5, 100, "Ground");
    EARTH_POWER = new Move("Earth Power", 100, 3.5, 50, "Ground");
    EARTHQUAKE = new Move("Earthquake", 140, 3.5, 100, "Ground");
    DRAGON_TAIL = new Move("Dragon Tail", 14, 1.0, 8, "Dragon");
    DYNAMAX_CANNON = new Move("Dynamax Cannon", 215, 1.5, 100, "Dragon");
    ACID_SPRAY_PLUS = new Move("Acid Spray+", 160, 3.0, 100, "Poison", undefined, [160, 176, 192, 208]);
    LIQUIDATION_PLUS = new Move("Liquidation+", 180, 3.0, 100, "Water", undefined, [180, 198, 216, 234]);
    OUTRAGE_PLUS = new Move("Outrage+", 185, 4.0, 100, "Dragon", undefined, [185, 204, 222, 240]);
    DRILL_PECK_PLUS = new Move("Drill Peck+", 170, 2.5, 100, "Flying", undefined, [170, 187, 204, 221]);
    SEED_BOMB_PLUS = new Move("Seed Bomb+", 150, 2.0, 100, "Grass", undefined, [150, 165, 180, 195]);
    MYSTICAL_FIRE_PLUS = new Move("Mystical Fire+", 140, 2.0, 100, "Fire", undefined, [140, 154, 168, 182]);
    SURF_PLUS = new Move("Surf+", 130, 1.5, 100, "Water", undefined, [130, 143, 156, 169]);
    PSYBEAM_PLUS = new Move("Psybeam+", 170, 3.0, 100, "Psychic", undefined, [170, 187, 203, 221]);
    BRICK_BREAK_PLUS = new Move("Brick Break+", 150, 1.5, 100, "Fighting", undefined, [150, 165, 180, 195]);
    VOLT_TACKLE_PLUS = new Move("Volt Tackle+", 170, 3.5, 100, "Electric", undefined, [170, 187, 204, 221]);
    DYNAMIC_PUNCH_PLUS = new Move("Dynamic Punch+", 130, 2.5, 100, "Fighting", undefined, [130, 143, 156, 169]);
    ZAP_CANNON_PLUS = new Move("Zap Cannon+", 160, 3.5, 100, "Electric", undefined, [160, 176, 192, 208]);
    FUTURE_SIGHT_PLUS = new Move("Future Sight+", 140, 2.5, 100, "Psychic", undefined, [140, 154, 168, 182]);
    PLUS_MOVE_FORM_IDS = py.dict([["Acid Spray+", "VICTREEBEL_MEGA"], ["Liquidation+", "STARMIE_MEGA"], ["Outrage+", "DRAGONITE_MEGA"], ["Drill Peck+", "SKARMORY_MEGA"], ["Seed Bomb+", "CHESNAUGHT_MEGA"], ["Mystical Fire+", "DELPHOX_MEGA"], ["Surf+", "GRENINJA_MEGA"], ["Psybeam+", "MALAMAR_MEGA"], ["Brick Break+", "FALINKS_MEGA"], ["Volt Tackle+", "RAICHU_MEGA_X"], ["Dynamic Punch+", "MEWTWO_MEGA_X"], ["Zap Cannon+", "RAICHU_MEGA_Y"], ["Future Sight+", "MEWTWO_MEGA_Y"]]);
    MOVES = py.dict(py.iter([MUD_SHOT, PRECIPICE_BLADES, SANDSEAR_STORM, EARTH_POWER, EARTHQUAKE, DRAGON_TAIL, DYNAMAX_CANNON, ACID_SPRAY_PLUS, LIQUIDATION_PLUS, OUTRAGE_PLUS, DRILL_PECK_PLUS, SEED_BOMB_PLUS, MYSTICAL_FIRE_PLUS, SURF_PLUS, PSYBEAM_PLUS, BRICK_BREAK_PLUS, VOLT_TACKLE_PLUS, DYNAMIC_PUNCH_PLUS, ZAP_CANNON_PLUS, FUTURE_SIGHT_PLUS]).map((move: any) => ([move.name, move])));
    SPECIES = py.dict([["Groudon", new Species("Groudon", 270, 228, 205, ["Ground"])], ["Shadow Groudon", new Species("Shadow Groudon", 270, 228, 205, ["Ground"], true)], ["Primal Groudon", new Species("Primal Groudon", 353, 268, 218, ["Ground", "Fire"], undefined, ["Fire", "Ground", "Grass"], true)], ["Landorus Therian", new Species("Landorus Therian", 289, 179, 205, ["Ground", "Flying"])], ["Mega Garchomp", new Species("Mega Garchomp", 339, 222, 239, ["Dragon", "Ground"], undefined, ["Dragon", "Ground"])], ["Eternatus", new Species("Eternatus", 278, 192, 268, ["Poison", "Dragon"])]]);
    function register_player_form(form_id: string, mega_boost: boolean = false, shadow: boolean = false, mega_boost_types: (string)[] | null = null, persistent_mega_boost: boolean = false): void {
        let entry: any;
        let name: any;
        let stats: any;
        let types: any;
        let move_type: any;
        /** Add one calculator-data form and all of its moves to player catalogs. */
        entry = find_calculator_species(CALCULATOR_DATA, form_id);
        name = py.at(entry, "name");
        stats = py.at(entry, "stats");
        types = py.iter(py.iter(py.at(entry, "types")).map((move_type: any) => (py.title(py.str(move_type)))));
        SPECIES[py.key(name)] = new Species(name, py.int(py.at(stats, "attack")), py.int(py.at(stats, "defense")), py.int(py.at(stats, "stamina")), types, shadow, (py.truth(((mega_boost_types !== null))) ? mega_boost_types : (py.truth(mega_boost) ? types : [])), persistent_mega_boost, form_id);
        register_player_moves(entry);
    }
    function register_player_moves(entry: Record<string, any>, preserve_existing: boolean = false): void {
        let move_data_pool: any;
        let move_data: any;
        let move: any;
        let existing: any;
        /** Register ordinary, Elite/legacy, and true-exclusive player moves. */
        move_data_pool = [...py.iter(py.get(entry, "fast_moves", [])), ...py.iter(py.get(entry, "charged_moves", [])), ...py.iter(py.get(entry, "exclusive_fast_moves", [])), ...py.iter(py.get(entry, "exclusive_charged_moves", []))];
        for (const __item of py.iter(move_data_pool)) {
            move_data = __item;
            move = move_from_calculator(move_data);
            existing = py.get(MOVES, move.name);
            if (py.truth(py.and(((existing !== null)), () => ((!py.equal(existing, move)))))) {
                if (py.truth(preserve_existing)) {
                    continue;
                }
                throw new Error(`Conflicting calculator data for player move ${py.repr(move.name)}: ${py.str(existing)} versus ${py.str(move)}`);
            }
            MOVES[py.key(move.name)] = move;
        }
    }
    register_player_form("ELECTIVIRE");
    register_player_form("LUXRAY");
    register_player_form("TORTERRA");
    register_player_form("VENUSAUR");
    register_player_form("ZEKROM");
    register_player_form("GARDEVOIR_MEGA", true);
    register_player_form("ZACIAN_CROWNED_SWORD");
    function register_new_mega_form(form_id: string, name: string, base_form_id: string, stats: [
        number,
        number,
        number
    ], types: (string)[]): void {
        let matches: any;
        let entry: any;
        let base_entry: any;
        let attack: any;
        let defense: any;
        let stamina: any;
        let species: any;
        /** Register a new Mega that is absent from the older calculator export.
         *
         *     Its ordinary moves come from the base species. Once calculator_data.json
         *     contains the Mega form itself, that authoritative record is used instead.
         *      */
        matches = py.iter(CALCULATOR_DATA).filter((entry: any) => py.truth(((py.equal(py.get(entry, "form_id"), form_id))))).map((entry: any) => (entry));
        if (py.truth(((py.equal(py.len(matches), 1))))) {
            register_player_form(form_id, true);
            SPECIES[py.key(form_id)] = py.at(SPECIES, py.at(py.at(matches, 0), "name"));
            return;
        }
        if (py.truth(matches)) {
            throw new Error(`Duplicate calculator records for ${py.repr(form_id)}`);
        }
        base_entry = find_calculator_species(CALCULATOR_DATA, base_form_id);
        [attack, defense, stamina] = stats;
        species = new Species(name, attack, defense, stamina, types, undefined, types, undefined, form_id);
        SPECIES[py.key(name)] = species;
        SPECIES[py.key(form_id)] = species;
        register_player_moves(base_entry);
    }
    register_new_mega_form("STARMIE_MEGA", "Mega Starmie", "STARMIE", [276, 229, 155], ["Water", "Psychic"]);
    register_new_mega_form("CHESNAUGHT_MEGA", "Mega Chesnaught", "CHESNAUGHT", [242, 282, 204], ["Grass", "Fighting"]);
    register_new_mega_form("DELPHOX_MEGA", "Mega Delphox", "DELPHOX", [331, 235, 181], ["Fire", "Psychic"]);
    register_new_mega_form("GRENINJA_MEGA", "Mega Greninja", "GRENINJA", [299, 180, 176], ["Water", "Dark"]);
    function register_configured_player_forms(): void {
        let weather_trio_boosts: any;
        let team: any;
        let setup: any;
        let configured_name: any;
        let wanted: any;
        let matches: any;
        let entry: any;
        let form_id: any;
        let persistent_types: any;
        let is_ordinary_mega: any;
        let is_shadow: any;
        /** Load any configured attacker that is not already in the catalog.
         *
         *     This lets PLAYER_TEAMS use calculator-data display names directly instead
         *     of requiring a new hard-coded register_player_form call for every species.
         *      */
        weather_trio_boosts = py.dict([["GROUDON_PRIMAL", ["Fire", "Ground", "Grass"]], ["KYOGRE_PRIMAL", ["Water", "Electric", "Bug"]], ["RAYQUAZA_MEGA", ["Dragon", "Flying", "Psychic"]]]);
        for (const __item of py.iter(PLAYER_TEAMS)) {
            team = __item;
            for (const __item of py.iter(team)) {
                setup = __item;
                if (py.truth(py.or(!py.truth(py.isinstance(setup, "(tuple, list)")), () => !py.truth(setup)))) {
                    continue;
                }
                configured_name = py.at(setup, 0);
                function normalized(value: any): string {
                    let character: any;
                    return py.join("", py.iter(py.lower(py.str(value))).filter((character: any) => py.truth(py.isalnum(character))).map((character: any) => (character)));
                }
                wanted = normalized(configured_name);
                matches = py.iter(CALCULATOR_DATA).filter((entry: any) => py.truth(((py.has(new Set<any>([normalized(py.get(entry, "name", "")), normalized(py.get(entry, "form_id", ""))]), wanted))))).map((entry: any) => (entry));
                if (py.truth(((!py.equal(py.len(matches), 1))))) {
                    continue;
                }
                entry = py.at(matches, 0);
                form_id = py.str(py.at(entry, "form_id"));
                if (py.truth(((py.has(SPECIES, configured_name))))) {
                    register_player_moves(entry, true);
                    continue;
                }
                persistent_types = py.get(weather_trio_boosts, form_id);
                is_ordinary_mega = py.and(((py.has(py.split(form_id, "_"), "MEGA"))), () => ((persistent_types === null)));
                is_shadow = ((py.has(py.split(form_id, "_"), "SHADOW")));
                register_player_form(form_id, is_ordinary_mega, is_shadow, persistent_types, ((persistent_types !== null)));
                if (py.truth(((!py.equal(configured_name, py.at(entry, "name")))))) {
                    SPECIES[py.key(configured_name)] = py.at(SPECIES, py.at(entry, "name"));
                }
            }
        }
    }
    register_configured_player_forms();
    class BattlePokemon {
        constructor(public species: Species, public fast_move: Move, public charged_move: Move, public level: number, public attack_iv: number = 15, public defense_iv: number = 15, public stamina_iv: number = 15, public shadow: boolean = false, public mega_level: number = 1, public hp: number = 0, public energy: number = 0) { this.__post_init__(); }
        __post_init__(): void {
            this.reset();
        }
        reset(): void {
            this.hp = this.max_hp;
            this.energy = 0;
        }
        get cpm(): number {
            return py.at(CPM_BY_HALF_LEVEL, py.round(py.mul(this.level, 2)));
        }
        get effective_attack(): number {
            return py.mul(py.add(this.species.attack, this.attack_iv), this.cpm);
        }
        get effective_defense(): number {
            return py.mul(py.add(this.species.defense, this.defense_iv), this.cpm);
        }
        get max_hp(): number {
            return Math.floor(py.mul(py.add(this.species.stamina, this.stamina_iv), this.cpm));
        }
        get is_shadow(): boolean {
            /** Whether this individual or its catalog species is Shadow. */
            return py.or(this.shadow, () => this.species.shadow);
        }
    }
    function unpack_player_setup(setup: any[] | any[]): [
        string,
        string,
        string,
        number,
        number,
        number,
        number,
        boolean,
        number
    ] {
        let species: any;
        let fast: any;
        let charged: any;
        let level: any;
        let attack_iv: any;
        let defense_iv: any;
        let stamina_iv: any;
        let shadow: any;
        let mega_level: any;
        /** Normalize legacy setups and the IV/Shadow/Mega-Level format. */
        if (py.truth(((py.equal(py.len(setup), 4))))) {
            [species, fast, charged, level] = setup;
            return [species, fast, charged, level, 15, 15, 15, false, 1];
        }
        if (py.truth(((py.equal(py.len(setup), 7))))) {
            [species, fast, charged, level, attack_iv, defense_iv, stamina_iv] = setup;
            return [species, fast, charged, level, attack_iv, defense_iv, stamina_iv, false, 1];
        }
        if (py.truth(((py.equal(py.len(setup), 8))))) {
            [species, fast, charged, level, attack_iv, defense_iv, stamina_iv, shadow] = setup;
            mega_level = 1;
        }
        else {
            [species, fast, charged, level, attack_iv, defense_iv, stamina_iv, shadow, mega_level] = setup;
        }
        return [species, fast, charged, level, attack_iv, defense_iv, stamina_iv, shadow, mega_level];
    }
    function effective_player_move_power(move: Move, pokemon: BattlePokemon): number {
        /** Return the move's exact integer power at this Pokémon's Mega Level. */
        if (py.truth(((move.plus_powers === null)))) {
            return move.power;
        }
        return py.at(move.plus_powers, py.sub(pokemon.mega_level, 1));
    }
    function displayed_player_move_name(move: Move, pokemon: BattlePokemon): string {
        /** Render + through ++++ without creating four separate move objects. */
        if (py.truth(((move.plus_powers === null)))) {
            return move.name;
        }
        return py.add(py.rstrip(move.name, "+"), py.mul("+", pokemon.mega_level));
    }
    function select_boss_moves(pool_key: string, selected_names: (string)[]): Record<string, Move> {
        let pool: any;
        let move: any;
        let available: any;
        let entry: any;
        let wanted: any;
        let unknown: any;
        let result: any;
        /** Select only ordinary boss moves, retaining calculator-data order.
         *
         *     Elite/legacy moves and true-exclusive player moves are intentionally not
         *     boss moves. The latter are stored outside this base pool entirely.
         *      */
        pool = py.iter(py.at(BOSS_DATA, pool_key)).filter((move: any) => py.truth(!py.truth(py.get(move, "elite", false)))).map((move: any) => (move));
        available = new Set(py.iter(pool).map((entry: any) => (py.at(entry, "name"))));
        wanted = (py.truth(selected_names) ? py.set(selected_names) : available);
        unknown = py.sub(wanted, available);
        if (py.truth(unknown)) {
            throw new Error(`Unknown ${py.str(BOSS_NAME)} moves in ${py.str(pool_key)}: ${py.str(py.sorted(unknown))}; available: ${py.str(py.sorted(available))}`);
        }
        result = py.dict([]);
        for (const __item of py.iter(pool)) {
            entry = __item;
            if (py.truth(((!py.has(wanted, py.at(entry, "name")))))) {
                continue;
            }
            move = move_from_calculator(entry);
            if (py.truth(((py.has(result, move.name))))) {
                throw new Error(`Boss move display name ${py.repr(move.name)} is duplicated; adjust BOSS_MOVE_DISPLAY_NAMES or BOSS_*_MOVE_NAMES`);
            }
            result[py.key(move.name)] = move;
        }
        return result;
    }
    BOSS_FAST_MOVES = select_boss_moves("fast_moves", BOSS_FAST_MOVE_NAMES);
    BOSS_CHARGED_MOVES = select_boss_moves("charged_moves", BOSS_CHARGED_MOVE_NAMES);
    function pokemon_go_damage(power: number, attack: number, defense: number, modifier: number): number {
        return py.add(Math.floor(py.mul((py.mul(py.mul(0.5, power), attack) / defense), modifier)), 1);
    }
    function boss_type_modifier(move: Move, species: Species): number {
        let stab: any;
        stab = (py.truth(((py.has(BOSS_TYPES, move.move_type)))) ? STAB : 1.0);
        return py.mul(stab, type_effectiveness(move.move_type, species.types));
    }
    function weather_move_multiplier(move_type: string): number {
        return (py.truth(((py.has(py.at(WEATHER_BOOSTED_TYPES, WEATHER), move_type)))) ? WEATHER_MULTIPLIER : 1.0);
    }
    class DodgeProfile {
        constructor(public full_damage: number, public dodged_damage: number, public is_super_effective: boolean, public is_resisted: boolean, public downtime_saver_is_worthwhile: boolean) { }
    }
    function incoming_damage_for_pokemon(move: Move, pokemon: BattlePokemon, enraged: boolean, dodged: boolean, defense_multiplier: number = 1.0): number {
        let species: any;
        let modifier: any;
        let attack: any;
        let damage: any;
        /** Calculate boss damage without requiring mutable Simulation state. */
        species = pokemon.species;
        modifier = py.mul(boss_type_modifier(move, species), weather_move_multiplier(move.move_type));
        attack = py.mul(BOSS_ATTACK, BOSS_CPM);
        if (py.truth(py.and(enraged, () => SHADOW_RAID)))
            attack = py.add(attack, Math.floor(py.mul(attack, SHADOW_ENRAGE_ATTACK_BONUS)));
        else if (py.truth(enraged))
            attack = py.mul(attack, ENRAGE_ATTACK_MULTIPLIER);
        if (py.truth(pokemon.is_shadow)) {
            modifier = py.mul(modifier, 1.2);
        }
        damage = pokemon_go_damage(move.power, attack, py.mul(pokemon.effective_defense, defense_multiplier), modifier);
        return (py.truth(dodged) ? py.max(1, Math.floor(py.mul(damage, DODGED_DAMAGE_FRACTION))) : damage);
    }
    function precompute_dodge_profiles(boss_charged: Move): Record<string, DodgeProfile> {
        let profiles: any;
        let enrage_states: any;
        let player_id: any;
        let team: any;
        let pokemon_index: any;
        let setup: any;
        let species: any;
        let fast: any;
        let charged: any;
        let level: any;
        let attack_iv: any;
        let defense_iv: any;
        let stamina_iv: any;
        let shadow: any;
        let mega_level: any;
        let pokemon: any;
        let has_next: any;
        let forced_transition_time: any;
        let enraged: any;
        let full_damage: any;
        let dodged_damage: any;
        let energy_recovery_time: any;
        let energy_not_received: any;
        /** Build the shared lookup table once for an aggregate moveset run. */
        profiles = py.dict([]);
        enrage_states = (py.truth(py.or(SUPER_MEGA_ENRAGE, () => SHADOW_RAID)) ? [false, true] : [false]);
        for (const __item of py.iter(py.enumerate(PLAYER_TEAMS))) {
            [player_id, team] = __item;
            for (const __item of py.iter(py.enumerate(team))) {
                [pokemon_index, setup] = __item;
                [species, fast, charged, level, attack_iv, defense_iv, stamina_iv, shadow, mega_level] = unpack_player_setup(setup);
                pokemon = new BattlePokemon(py.at(SPECIES, species), py.at(MOVES, fast), py.at(MOVES, charged), level, attack_iv, defense_iv, stamina_iv, shadow, mega_level);
                has_next = ((py.add(pokemon_index, 1) < py.len(team)));
                forced_transition_time = (py.truth(has_next) ? SWITCH_SECONDS : py.mean(REJOIN_TIMES));
                for (const __item of py.iter(enrage_states)) {
                    enraged = __item;
                    full_damage = incoming_damage_for_pokemon(boss_charged, pokemon, enraged, false, (py.truth(py.at(BEHEMOTH_BASH_ADVENTURE_EFFECT, player_id)) ? BEHEMOTH_BASH_DEFENSE_MULTIPLIER : 1.0));
                    dodged_damage = incoming_damage_for_pokemon(boss_charged, pokemon, enraged, true, (py.truth(py.at(BEHEMOTH_BASH_ADVENTURE_EFFECT, player_id)) ? BEHEMOTH_BASH_DEFENSE_MULTIPLIER : 1.0));
                    energy_recovery_time = 0.0;
                    if (py.truth(PLAYER_ENERGY_FROM_DAMAGE)) {
                        energy_not_received = py.max(0, py.sub(Math.floor((full_damage / 2)), Math.floor((dodged_damage / 2))));
                        energy_recovery_time = (py.mul(energy_not_received, pokemon.fast_move.duration) / py.max(1, pokemon.fast_move.energy));
                    }
                    profiles[py.key([player_id, pokemon_index, enraged])] = new DodgeProfile(full_damage, dodged_damage, ((type_effectiveness(boss_charged.move_type, pokemon.species.types) > 1.0)), ((type_effectiveness(boss_charged.move_type, pokemon.species.types) < 1.0)), ((forced_transition_time > py.add(DODGE_SECONDS, energy_recovery_time))));
                }
            }
        }
        return profiles;
    }
    class Player {
        constructor(public team: (BattlePokemon)[], public pokemon_index: number = 0, public on_field: boolean = true, public token: number = 0, public generation: number = 0, public next_action_time: number = 0.0, public action_start: number = 0.0, public action_end: number = 0.0, public action_is_charged: boolean = false, public switches: number = 0, public faints: number = 0, public tactical_switches: number = 0, public rejoins: number = 0, public party_power_threshold: number = 0, public party_power_progress: number = 0, public party_power_active: boolean = false, public damage_dealt: number = 0, public damage_taken: number = 0, public fast_moves_used: number = 0, public charged_moves_used: number = 0, public powered_charged_moves: number = 0, public successful_dodges: number = 0, public catch_tank_indices: (number)[] = [], public used_catch_tanks: Set<number> = new Set(), public catch_tank_active: boolean = false, public catch_return_index: number | null = null, public catch_tanks_used: number = 0, public saved_energy_indices: Set<number> = new Set(), public saved_energy_return_after: Record<string, number> = py.dict(), public committed_saved_energy_index: number | null = null, public energy_save_guard_until: number = 0.0, public purified_gems_used: number = 0, public last_purified_gem_time: number | null = null) { }
        get pokemon(): BattlePokemon {
            return py.at(this.team, this.pokemon_index);
        }
        get species(): Species {
            return this.pokemon.species;
        }
        get hp(): number {
            return this.pokemon.hp;
        }
        set hp(value: number) {
            this.pokemon.hp = value;
        }
        get energy(): number {
            return this.pokemon.energy;
        }
        set energy(value: number) {
            this.pokemon.energy = value;
        }
        get has_next(): boolean {
            return ((py.add(this.pokemon_index, 1) < py.len(this.team)));
        }
    }
    class TrialResult {
        constructor(public won: boolean, public finish_time: number, public boss_hp: number, public switches: number, public faints: number, public tactical_switches: number, public rejoins: number, public catch_tanks_used: number, public purified_gems_used: number = 0) { }
    }
    class Simulation {
        constructor(public boss_fast: Move, public boss_charged: Move, public rng: PythonRandom, public dodge_profiles: Record<string, DodgeProfile> | null = null, public boss_hp: number = BOSS_HP, public boss_energy: number = 0.0, public enraged: boolean = false, public players: (Player)[] = [], public events: (any[])[] = [], public sequence: number = 0, public detailed: boolean = false, public event_log: (string)[] = [], public replay_actions: ([
            number,
            number,
            string,
            number | null,
            string,
            any
        ])[] = [], public replay_sequence: number = 0, public current_time: number = 0.0, public shadow_subdued: boolean = false, public purified_gems_used: number = 0) { this.__post_init__(); }
        __post_init__(): void {
            let species: any;
            let fast: any;
            let charged: any;
            let level: any;
            let attack_iv: any;
            let defense_iv: any;
            let stamina_iv: any;
            let shadow: any;
            let mega_level: any;
            let team: any;
            let player_id: any;
            let player: any;
            let thresholds: any;
            let group: any;
            let threshold: any;
            if (py.truth(((py.equal(this.boss_fast.name, "Hidden Power"))))) {
                this.boss_fast = Object.assign(Object.create(Object.getPrototypeOf(this.boss_fast)), this.boss_fast, { move_type: this.rng.choice(HIDDEN_POWER_TYPES) });
            }
            if (py.truth(((this.dodge_profiles === null)))) {
                this.dodge_profiles = precompute_dodge_profiles(this.boss_charged);
            }
            this.players = py.iter(PLAYER_TEAMS).map((team: any) => (new Player(py.iter(py.iter(team).map(unpack_player_setup)).map(([species, fast, charged, level, attack_iv, defense_iv, stamina_iv, shadow, mega_level]: any) => (new BattlePokemon(py.at(SPECIES, species), py.at(MOVES, fast), py.at(MOVES, charged), level, attack_iv, defense_iv, stamina_iv, shadow, mega_level))))));
            for (const __item of py.iter(py.enumerate(this.players))) {
                [player_id, player] = __item;
                player.catch_tank_indices = (py.truth(((py.equal(PLAYER_STRATEGY, "catch_tank")))) ? py.iter(py.at(CATCH_TANK_TEAM_INDICES, player_id)) : []);
                player.pokemon_index = this.first_normal_index(player);
            }
            thresholds = (py.truth(BOOSTED_PARTY_POWER) ? BOOSTED_PARTY_POWER_THRESHOLDS : NORMAL_PARTY_POWER_THRESHOLDS);
            for (const __item of py.iter(PARTY_POWER_GROUPS)) {
                group = __item;
                threshold = py.at(thresholds, py.len(group));
                for (const __item of py.iter(group)) {
                    player_id = __item;
                    py.at(this.players, player_id).party_power_threshold = threshold;
                }
            }
        }
        push(time: number, kind: string, data: any[] = []): void {
            this.sequence = py.add(this.sequence, 1);
            py.heappush(this.events, [time, this.sequence, kind, data]);
        }
        log(time: number, message: string, category: string = "event"): void {
            if (py.truth(py.and(this.detailed, () => py.or(((py.equal(BATTLE_LOG_MODE, "full"))), () => py.and(((py.equal(BATTLE_LOG_MODE, "moves"))), () => ((py.equal(category, "move_start")))))))) {
                py.append(this.event_log, `${py.format(time, `7.2f`)}s  ${py.str(message)}`);
            }
        }
        record_replay_action(time: number, actor_kind: string, actor_id: number | null, action_kind: string, value: any = null): void {
            let tick: any;
            /** Record one observable action using exact half-second game ticks. */
            if (py.truth(!py.truth(this.detailed))) {
                return;
            }
            tick = py.round(py.mul(time, 2));
            if (py.truth(((Math.abs(py.sub(time, (tick / 2))) > 1e-09)))) {
                throw new Error(`Replay action at ${py.str(time)}s does not land on a 0.5-second tick`);
            }
            this.replay_sequence = py.add(this.replay_sequence, 1);
            py.append(this.replay_actions, [tick, this.replay_sequence, actor_kind, actor_id, action_kind, value]);
        }
        schedule_player(player_id: number, time: number): void {
            let player: any;
            player = py.at(this.players, player_id);
            player.token = py.add(player.token, 1);
            player.next_action_time = time;
            this.push(time, "player_ready", [player_id, player.token]);
        }
        outgoing_damage(move: Move, player_id: number, party_power: boolean = false): number {
            let player: any;
            let pokemon: any;
            let species: any;
            let defense: any;
            let modifier: any;
            player = py.at(this.players, player_id);
            pokemon = player.pokemon;
            species = player.species;
            defense = py.mul(BOSS_DEFENSE, BOSS_CPM);
            if (py.truth(py.and(this.enraged, () => SHADOW_RAID)))
                defense = py.add(defense, Math.floor(py.mul(defense, SHADOW_ENRAGE_DEFENSE_BONUS)));
            else if (py.truth(this.enraged))
                defense = py.mul(defense, 4);
            modifier = type_effectiveness(move.move_type, BOSS_TYPES);
            if (py.truth(((py.has(species.types, move.move_type))))) {
                modifier = py.mul(modifier, STAB);
            }
            modifier = py.mul(modifier, py.at(FRIENDSHIP_MULTIPLIERS, player_id));
            if (py.truth(pokemon.is_shadow)) {
                modifier = py.mul(modifier, 1.2);
            }
            modifier = py.mul(modifier, this.mega_ally_multiplier(move.move_type, player_id));
            if (py.truth(py.at(ZACIAN_ADVENTURE_EFFECT, player_id))) {
                modifier = py.mul(modifier, ZACIAN_MULTIPLIER);
            }
            if (py.truth(py.and(py.at(DYNAMIC_PUNCH_ADVENTURE_EFFECT, player_id), () => py.and(((py.has(DYNAMIC_PUNCH_RAID_DIFFICULTIES, RAID_DIFFICULTY))), () => py.and(((py.has(py.upper(BOSS_FORM_ID), "_MEGA"))), () => ((!py.has(py.upper(BOSS_FORM_ID), "_PRIMAL")))))))) {
                modifier = py.mul(modifier, DYNAMIC_PUNCH_ATTACK_MULTIPLIER);
            }
            modifier = py.mul(modifier, weather_move_multiplier(move.move_type));
            if (py.truth(party_power)) {
                modifier = py.mul(modifier, 2.0);
            }
            return pokemon_go_damage(effective_player_move_power(move, pokemon), pokemon.effective_attack, defense, modifier);
        }
        mega_ally_multiplier(move_type: string, player_id: number): number {
            let boost_types: any;
            let other_id: any;
            let other: any;
            let member: any;
            let types: any;
            /** Return the strongest automatic Mega/Primal boost from an ally. */
            boost_types = [];
            for (const __item of py.iter(py.enumerate(this.players))) {
                [other_id, other] = __item;
                if (py.truth(((py.equal(other_id, player_id))))) {
                    continue;
                }
                py.extend(boost_types, py.iter(other.team).filter((member: any) => py.truth(member.species.persistent_mega_boost)).map((member: any) => (member.species.mega_boost_types)));
                if (py.truth(py.and(other.on_field, () => py.and(((other.hp > 0)), () => py.and(other.species.mega_boost_types, () => !py.truth(other.species.persistent_mega_boost)))))) {
                    py.append(boost_types, other.species.mega_boost_types);
                }
            }
            if (py.truth(py.iter(py.iter(boost_types).map((types: any) => (((py.has(types, move_type)))))).some(py.truth))) {
                return SAME_TYPE_MEGA_ALLY_MULTIPLIER;
            }
            if (py.truth(boost_types)) {
                return OTHER_TYPE_MEGA_ALLY_MULTIPLIER;
            }
            return 1.0;
        }
        player_defense_multiplier(player_id: number): number {
            return (py.truth(py.at(BEHEMOTH_BASH_ADVENTURE_EFFECT, player_id)) ? BEHEMOTH_BASH_DEFENSE_MULTIPLIER : 1.0);
        }
        incoming_damage(move: Move, player_id: number, player: Player, dodged: boolean): number {
            return incoming_damage_for_pokemon(move, player.pokemon, this.enraged, dodged, this.player_defense_multiplier(player_id));
        }
        should_dodge_charged(player_id: number, player: Player): boolean {
            let profile: any;
            /** Apply the configured dodge policy to one player and charged move. */
            if (py.truth(((py.equal(DODGE_STRATEGY, "none"))))) {
                return false;
            }
            if (!py.truth(((this.dodge_profiles !== null))))
                throw new Error("Internal assertion failed");
            profile = py.at(this.dodge_profiles, [player_id, player.pokemon_index, this.enraged]);
            if (py.truth(((py.equal(DODGE_STRATEGY, "non_resisted"))))) {
                return !py.truth(profile.is_resisted);
            }
            if (py.truth(((profile.dodged_damage >= player.hp)))) {
                return false;
            }
            if (py.truth(((py.equal(DODGE_STRATEGY, "all_survivable"))))) {
                return true;
            }
            if (py.truth(((py.equal(DODGE_STRATEGY, "super_effective"))))) {
                return profile.is_super_effective;
            }
            if (py.truth(((py.equal(DODGE_STRATEGY, "lethal_only"))))) {
                return ((profile.full_damage >= player.hp));
            }
            if (py.truth(((profile.full_damage < player.hp)))) {
                return false;
            }
            return profile.downtime_saver_is_worthwhile;
        }
        predicted_fast_hits_before_charge(pokemon: BattlePokemon, energy: number): number {
            let fasts: any;
            let time_to_charge: any;
            let first_hit: any;
            let interval: any;
            fasts = py.max(0, Math.ceil((py.sub(pokemon.charged_move.energy, energy) / pokemon.fast_move.energy)));
            time_to_charge = py.add(py.mul(fasts, pokemon.fast_move.duration), pokemon.charged_move.duration);
            first_hit = this.boss_fast.duration;
            interval = py.add(this.boss_fast.duration, FAST_MOVE_DELAY);
            if (py.truth(((time_to_charge < first_hit)))) {
                return 0;
            }
            return py.add(1, Math.floor((py.sub(time_to_charge, first_hit) / interval)));
        }
        should_retreat(player_id: number, player: Player): boolean {
            let hits: any;
            let predicted: any;
            let reserve_fraction: any;
            let profile: any;
            let charged_damage_reserve: any;
            hits = this.predicted_fast_hits_before_charge(player.pokemon, player.energy);
            predicted = py.mul(hits, this.incoming_damage(this.boss_fast, player_id, player, false));
            reserve_fraction = py.at(HOT_SWAP_CHARGED_DAMAGE_RESERVES, PLAYER_STRATEGY);
            profile = py.at(this.dodge_profiles, [player_id, player.pokemon_index, this.enraged]);
            charged_damage_reserve = Math.ceil(py.mul(profile.full_damage, reserve_fraction));
            return ((py.add(predicted, charged_damage_reserve) >= player.hp));
        }
        first_normal_index(player: Player): number {
            let index: any;
            return py.next(py.iter(py.range(py.len(player.team))).filter((index: any) => py.truth(((!py.has(player.catch_tank_indices, index))))).map((index: any) => (index)));
        }
        normal_indices_after(player: Player): (number)[] {
            let index: any;
            /** Return later normal-team slots in ordinary party order. */
            return py.iter(py.iter(py.range(py.add(player.pokemon_index, 1), py.len(player.team))).filter((index: any) => py.truth(((!py.has(player.catch_tank_indices, index))))).map((index: any) => (index)));
        }
        normal_indices_in_rotation(player: Player): (number)[] {
            let index: any;
            /** Return every other normal slot, wrapping once from the active slot. */
            return py.iter(py.iter([...py.iter(py.range(py.add(player.pokemon_index, 1), py.len(player.team))), ...py.iter(py.range(0, player.pokemon_index))]).filter((index: any) => py.truth(((!py.has(player.catch_tank_indices, index))))).map((index: any) => (index)));
        }
        next_normal_index(player: Player, include_saved: boolean = false): number | null {
            let index: any;
            return py.next(py.iter(this.normal_indices_after(player)).filter((index: any) => py.truth(py.and(((py.at(player.team, index).hp > 0)), () => py.or(include_saved, () => ((!py.has(player.saved_energy_indices, index))))))).map((index: any) => (index)), null);
        }
        best_saved_energy_index(player_id: number, player: Player, time: number): number | null {
            let candidates: any;
            let index: any;
            let pokemon: any;
            let hits: any;
            let fast_damage: any;
            /** Choose a saved attacker that can now reach and land its charge. */
            candidates = [];
            for (const __item of py.iter(player.saved_energy_indices)) {
                index = __item;
                pokemon = py.at(player.team, index);
                if (py.truth(py.or(((py.equal(index, player.pokemon_index))), () => py.or(((pokemon.hp <= 0)), () => ((py.get(player.saved_energy_return_after, index, 0.0) > time)))))) {
                    continue;
                }
                hits = this.predicted_fast_hits_before_charge(pokemon, pokemon.energy);
                fast_damage = incoming_damage_for_pokemon(this.boss_fast, pokemon, this.enraged, false, this.player_defense_multiplier(player_id));
                if (py.truth(((py.mul(hits, fast_damage) >= pokemon.hp)))) {
                    continue;
                }
                py.append(candidates, [((pokemon.energy >= pokemon.charged_move.energy)), (pokemon.energy / pokemon.charged_move.energy), -hits, -index, index]);
            }
            return (py.truth(candidates) ? py.at(py.max(candidates), -1) : null);
        }
        replacement_for_announced_charge(player_id: number, player: Player, boss_move: Move): number | null {
            let candidates: any;
            let index: any;
            /** Prefer the next unused attacker that survives the announced hit. */
            candidates = py.iter(this.normal_indices_in_rotation(player)).filter((index: any) => py.truth(py.and(((py.at(player.team, index).hp > 0)), () => ((!py.has(player.saved_energy_indices, index)))))).map((index: any) => (index));
            if (py.truth(!py.truth(candidates))) {
                return null;
            }
            return py.next(py.iter(candidates).filter((index: any) => py.truth(((incoming_damage_for_pokemon(boss_move, py.at(player.team, index), this.enraged, false, this.player_defense_multiplier(player_id)) < py.at(player.team, index).hp)))).map((index: any) => (index)), py.at(candidates, 0));
        }
        announced_charge_prevents_next_charge(player_id: number, player: Player, hit_time: number, damage: number, boss_move: Move): boolean {
            let hp_after_hit: any;
            let energy_after_hit: any;
            let hits: any;
            let predicted_fast_damage: any;
            /** Whether taking an announced hit stops this attacker spending its meter. */
            if (py.truth(((!py.has(HOT_SWAP_CHARGED_DAMAGE_RESERVES, PLAYER_STRATEGY))))) {
                return false;
            }
            if (py.truth(((player.energy <= 0)))) {
                return false;
            }
            if (py.truth(py.and(player.action_is_charged, () => py.and(((player.action_start <= this.current_time)), () => ((player.action_end <= hit_time)))))) {
                return false;
            }
            if (py.truth(((this.replacement_for_announced_charge(player_id, player, boss_move) === null)))) {
                return false;
            }
            hp_after_hit = py.sub(player.hp, damage);
            if (py.truth(((hp_after_hit <= 0)))) {
                return true;
            }
            energy_after_hit = player.energy;
            if (py.truth(PLAYER_ENERGY_FROM_DAMAGE)) {
                energy_after_hit = py.min(100, py.add(energy_after_hit, Math.floor((damage / 2))));
            }
            hits = this.predicted_fast_hits_before_charge(player.pokemon, energy_after_hit);
            predicted_fast_damage = py.mul(hits, this.incoming_damage(this.boss_fast, player_id, player, false));
            return ((predicted_fast_damage >= hp_after_hit));
        }
        next_unused_catch_tank_index(player: Player): number | null {
            let index: any;
            return py.next(py.iter(player.catch_tank_indices).filter((index: any) => py.truth(((!py.has(player.used_catch_tanks, index))))).map((index: any) => (index)), null);
        }
        save_energy_for_announced_charge(time: number, hit_time: number, player_id: number, boss_move: Move): boolean {
            let player: any;
            let replacement_index: any;
            let departing_index: any;
            let departing: any;
            let saved_energy: any;
            /** Move a threatened attacker off field while preserving its meter. */
            player = py.at(this.players, player_id);
            replacement_index = this.replacement_for_announced_charge(player_id, player, boss_move);
            if (py.truth(((replacement_index === null)))) {
                return false;
            }
            departing_index = player.pokemon_index;
            departing = player.species.name;
            saved_energy = player.energy;
            player.saved_energy_indices.add(departing_index);
            player.saved_energy_return_after[py.key(departing_index)] = hit_time;
            player.committed_saved_energy_index = null;
            player.energy_save_guard_until = py.max(player.energy_save_guard_until, hit_time);
            player.token = py.add(player.token, 1);
            player.generation = py.add(player.generation, 1);
            player.action_is_charged = false;
            player.action_start = time;
            player.action_end = time;
            player.pokemon_index = replacement_index;
            player.switches = py.add(player.switches, 1);
            player.tactical_switches = py.add(player.tactical_switches, 1);
            this.record_replay_action(time, "player", player_id, "switch", py.add(replacement_index, 1));
            this.log(time, `P${py.str(py.add(player_id, 1))} ${py.str(departing)}: incoming ${py.str(boss_move.name)} would prevent its next charged move; marked has energy left (${py.str(saved_energy)}) and switched -> ${py.str(player.species.name)}`);
            this.schedule_player(player_id, py.add(time, SWITCH_SECONDS));
            return true;
        }
        return_to_saved_energy(time: number, player_id: number): boolean {
            let player: any;
            let return_index: any;
            let departing: any;
            /** Bring back a protected attacker once it can safely spend its meter. */
            player = py.at(this.players, player_id);
            if (py.truth(py.or(!py.truth(player.on_field), () => player.catch_tank_active))) {
                return false;
            }
            return_index = this.best_saved_energy_index(player_id, player, time);
            if (py.truth(((return_index === null)))) {
                return false;
            }
            departing = player.species.name;
            player.token = py.add(player.token, 1);
            player.generation = py.add(player.generation, 1);
            player.action_is_charged = false;
            player.action_start = time;
            player.action_end = time;
            player.pokemon_index = return_index;
            py.discard(player.saved_energy_indices, return_index);
            py.pop(player.saved_energy_return_after, return_index, null);
            player.committed_saved_energy_index = return_index;
            player.switches = py.add(player.switches, 1);
            player.tactical_switches = py.add(player.tactical_switches, 1);
            this.record_replay_action(time, "player", player_id, "switch", py.add(return_index, 1));
            this.log(time, `P${py.str(py.add(player_id, 1))} ${py.str(departing)}: saved-energy return -> ${py.str(player.species.name)} (${py.str(player.energy)} energy)`);
            this.schedule_player(player_id, py.add(time, SWITCH_SECONDS));
            return true;
        }
        schedule_catch_tank(time: number, hit_time: number, player_id: number, boss_move: Move): boolean {
            let player: any;
            let tank_index: any;
            let tank: any;
            let incoming_damage: any;
            let incoming_energy: any;
            let energy_after_hit: any;
            let missing_energy: any;
            let fast_moves_needed: any;
            let preparation_time: any;
            let swap_time: any;
            let available_preparation_time: any;
            let immediate: any;
            let timing_text: any;
            /** Schedule the latest useful catch-tank swap for an announced hit. */
            if (py.truth(((!py.equal(PLAYER_STRATEGY, "catch_tank"))))) {
                return false;
            }
            player = py.at(this.players, player_id);
            if (py.truth(py.or(!py.truth(player.on_field), () => player.catch_tank_active))) {
                return false;
            }
            tank_index = this.next_unused_catch_tank_index(player);
            if (py.truth(((tank_index === null)))) {
                return false;
            }
            tank = py.at(player.team, tank_index);
            incoming_damage = incoming_damage_for_pokemon(boss_move, tank, this.enraged, false, this.player_defense_multiplier(player_id));
            incoming_energy = (py.truth(PLAYER_ENERGY_FROM_DAMAGE) ? Math.floor((incoming_damage / 2)) : 0);
            energy_after_hit = py.min(100, py.add(tank.energy, incoming_energy));
            missing_energy = py.max(0, py.sub(tank.charged_move.energy, energy_after_hit));
            fast_moves_needed = (py.truth(py.and(missing_energy, () => ((tank.fast_move.energy > 0)))) ? Math.ceil((missing_energy / tank.fast_move.energy)) : 0);
            preparation_time = py.add(SWITCH_SECONDS, py.mul(fast_moves_needed, tank.fast_move.duration));
            swap_time = py.max(time, py.sub(hit_time, preparation_time));
            available_preparation_time = py.sub(hit_time, swap_time);
            immediate = ((py.equal(swap_time, time)));
            timing_text = (py.truth(immediate) ? "immediately" : `at ${py.format(swap_time, `.2f`)}s`);
            this.log(time, `P${py.str(py.add(player_id, 1))} plans ${py.str(tank.species.name)} catch-tank swap ${py.str(timing_text)}: expected +${py.str(incoming_energy)} energy from ${py.str(boss_move.name)}, ${py.str(fast_moves_needed)} fast move(s) needed, ${py.format(preparation_time, `.2f`)}s required / ${py.format(available_preparation_time, `.2f`)}s available`);
            this.push(swap_time, "catch_tank_swap", [player_id, tank_index]);
            return true;
        }
        start_catch_tank(time: number, player_id: number, tank_index: number): void {
            let player: any;
            let departing: any;
            /** Start a previously scheduled catch-tank switch. */
            player = py.at(this.players, player_id);
            if (py.truth(py.or(!py.truth(player.on_field), () => py.or(player.catch_tank_active, () => py.or(((py.has(player.used_catch_tanks, tank_index))), () => ((!py.has(player.catch_tank_indices, tank_index)))))))) {
                return;
            }
            departing = player.species.name;
            player.catch_return_index = player.pokemon_index;
            player.catch_tank_active = true;
            player.used_catch_tanks.add(tank_index);
            player.catch_tanks_used = py.add(player.catch_tanks_used, 1);
            player.token = py.add(player.token, 1);
            player.generation = py.add(player.generation, 1);
            player.action_is_charged = false;
            player.action_start = time;
            player.action_end = time;
            player.pokemon_index = tank_index;
            player.switches = py.add(player.switches, 1);
            player.tactical_switches = py.add(player.tactical_switches, 1);
            this.record_replay_action(time, "player", player_id, "switch", py.add(tank_index, 1));
            this.log(time, `P${py.str(py.add(player_id, 1))} ${py.str(departing)}: catch-tank switch -> ${py.str(player.species.name)}`);
            this.schedule_player(player_id, py.add(time, SWITCH_SECONDS));
        }
        finish_catch_tank(time: number, player_id: number, reason: string): void {
            let player: any;
            let departing: any;
            let return_index: any;
            /** Retire the current tank and return to the attacker it replaced. */
            player = py.at(this.players, player_id);
            departing = player.species.name;
            return_index = player.catch_return_index;
            player.token = py.add(player.token, 1);
            player.generation = py.add(player.generation, 1);
            player.action_is_charged = false;
            player.action_start = time;
            player.action_end = time;
            player.catch_tank_active = false;
            player.catch_return_index = null;
            if (py.truth(py.or(((return_index === null)), () => ((py.at(player.team, return_index).hp <= 0))))) {
                return_index = this.first_normal_index(player);
            }
            player.pokemon_index = return_index;
            player.on_field = true;
            player.switches = py.add(player.switches, 1);
            player.tactical_switches = py.add(player.tactical_switches, 1);
            this.record_replay_action(time, "player", player_id, "switch", py.add(return_index, 1));
            this.log(time, `P${py.str(py.add(player_id, 1))} ${py.str(departing)}: catch tank ${py.str(reason)}; retired -> ${py.str(player.species.name)}`);
            this.schedule_player(player_id, py.add(time, SWITCH_SECONDS));
        }
        switch(time: number, player_id: number, tactical: boolean): void {
            let player: any;
            let departing: any;
            let departing_index: any;
            let next_index: any;
            let returning_to_saved_energy: any;
            let rejoin_seconds: any;
            let reason: any;
            player = py.at(this.players, player_id);
            departing = player.species.name;
            departing_index = player.pokemon_index;
            if (py.truth(player.catch_tank_active)) {
                this.finish_catch_tank(time, player_id, "fainted");
                return;
            }
            player.token = py.add(player.token, 1);
            player.generation = py.add(player.generation, 1);
            player.action_is_charged = false;
            player.action_start = time;
            player.action_end = time;
            player.committed_saved_energy_index = null;
            if (py.truth(tactical)) {
                player.tactical_switches = py.add(player.tactical_switches, 1);
            }
            else {
                py.discard(player.saved_energy_indices, departing_index);
                py.pop(player.saved_energy_return_after, departing_index, null);
            }
            next_index = this.next_normal_index(player);
            returning_to_saved_energy = false;
            if (py.truth(((next_index === null)))) {
                next_index = this.best_saved_energy_index(player_id, player, time);
                returning_to_saved_energy = ((next_index !== null));
            }
            if (py.truth(((next_index === null)))) {
                player.on_field = false;
                player.rejoins = py.add(player.rejoins, 1);
                rejoin_seconds = this.rng.choice(REJOIN_TIMES);
                reason = (py.truth(tactical) ? "predictive retreat" : "fainted");
                this.log(time, `P${py.str(py.add(player_id, 1))} ${py.str(departing)}: ${py.str(reason)}; relobby ${py.format(rejoin_seconds, `.1f`)}s until ${py.format(py.add(time, rejoin_seconds), `.2f`)}s`);
                this.record_replay_action(time, "player", player_id, "quit");
                this.push(py.add(time, rejoin_seconds), "rejoin", [player_id]);
                return;
            }
            player.pokemon_index = next_index;
            if (py.truth(returning_to_saved_energy)) {
                py.discard(player.saved_energy_indices, next_index);
                py.pop(player.saved_energy_return_after, next_index, null);
                player.committed_saved_energy_index = next_index;
            }
            player.on_field = true;
            player.switches = py.add(player.switches, 1);
            this.record_replay_action(time, "player", player_id, "switch", py.add(next_index, 1));
            if (py.truth(returning_to_saved_energy)) {
                reason = "saved-energy return";
            }
            else {
                reason = (py.truth(tactical) ? "predictive switch" : "fainted");
            }
            this.log(time, `P${py.str(py.add(player_id, 1))} ${py.str(departing)}: ${py.str(reason)} -> ${py.str(player.species.name)}`);
            this.schedule_player(player_id, py.add(time, SWITCH_SECONDS));
        }
        rejoin(time: number, player_id: number): void {
            let player: any;
            let pokemon: any;
            player = py.at(this.players, player_id);
            this.record_replay_action(time, "player", player_id, "rejoin");
            player.generation = py.add(player.generation, 1);
            player.action_is_charged = false;
            player.action_start = time;
            player.action_end = time;
            player.pokemon_index = this.first_normal_index(player);
            for (const __item of py.iter(player.team)) {
                pokemon = __item;
                pokemon.reset();
            }
            py.clear(player.saved_energy_indices);
            py.clear(player.saved_energy_return_after);
            player.committed_saved_energy_index = null;
            player.energy_save_guard_until = 0.0;
            player.on_field = true;
            this.log(time, `P${py.str(py.add(player_id, 1))} rejoined with ${py.str(player.species.name)} at ${py.str(player.hp)} HP`);
            this.schedule_player(player_id, time);
        }
        start_player_action(time: number, player_id: number, token: number): void {
            let player: any;
            let pokemon: any;
            let move: any;
            let generation: any;
            player = py.at(this.players, player_id);
            if (py.truth(py.or(((!py.equal(token, player.token))), () => !py.truth(player.on_field)))) {
                return;
            }
            if (py.truth(py.and(((py.has(HOT_SWAP_CHARGED_DAMAGE_RESERVES, PLAYER_STRATEGY))), () => py.and(((time >= player.energy_save_guard_until)), () => py.and(((!py.equal(player.committed_saved_energy_index, player.pokemon_index))), () => this.return_to_saved_energy(time, player_id)))))) {
                return;
            }
            if (py.truth(py.and(((py.has(HOT_SWAP_CHARGED_DAMAGE_RESERVES, PLAYER_STRATEGY))), () => py.and(((time >= player.energy_save_guard_until)), () => py.and(((!py.equal(player.committed_saved_energy_index, player.pokemon_index))), () => this.should_retreat(player_id, player)))))) {
                this.switch(time, player_id, true);
                return;
            }
            pokemon = player.pokemon;
            move = (py.truth(((player.energy >= pokemon.charged_move.energy))) ? pokemon.charged_move : pokemon.fast_move);
            if (py.truth(((move === pokemon.charged_move)))) {
                player.energy = py.sub(player.energy, move.energy);
            }
            player.action_start = time;
            player.action_end = py.add(time, move.duration);
            player.action_is_charged = ((move === pokemon.charged_move));
            this.record_replay_action(time, "player", player_id, "move", displayed_player_move_name(move, pokemon));
            this.log(time, `P${py.str(py.add(player_id, 1))} starts ${py.str(displayed_player_move_name(move, pokemon))} (HP ${py.str(player.hp)}, energy ${py.str(player.energy)}, PP ${py.str((py.truth(player.party_power_active) ? "active" : `${py.str(player.party_power_progress)}/${py.str(player.party_power_threshold)}`))})`, "move_start");
            generation = player.generation;
            this.push(player.action_end, "player_hit", [player_id, generation, move]);
            this.schedule_player(player_id, player.action_end);
        }
        apply_player_hit(player_id: number, generation: number, move: Move): void {
            let player: any;
            let powered: any;
            let damage: any;
            let pp_text: any;
            player = py.at(this.players, player_id);
            if (py.truth(py.or(!py.truth(player.on_field), () => ((!py.equal(generation, player.generation)))))) {
                return;
            }
            if (py.truth(((move === player.pokemon.fast_move)))) {
                player.energy = py.min(100, py.add(player.energy, move.energy));
                this.charge_party_power(player);
            }
            powered = py.and(((move === player.pokemon.charged_move)), () => player.party_power_active);
            damage = this.outgoing_damage(move, player_id, powered);
            player.damage_dealt = py.add(player.damage_dealt, damage);
            if (py.truth(((move === player.pokemon.fast_move)))) {
                player.fast_moves_used = py.add(player.fast_moves_used, 1);
            }
            else {
                player.charged_moves_used = py.add(player.charged_moves_used, 1);
                if (py.truth(((py.equal(player.committed_saved_energy_index, player.pokemon_index))))) {
                    player.committed_saved_energy_index = null;
                }
                if (py.truth(powered)) {
                    player.powered_charged_moves = py.add(player.powered_charged_moves, 1);
                }
            }
            if (py.truth(powered)) {
                this.consume_party_power(player);
            }
            this.boss_hp = py.sub(this.boss_hp, damage);
            pp_text = (py.truth(powered) ? " with PP" : "");
            this.log(this.current_time, `P${py.str(py.add(player_id, 1))} lands ${py.str(displayed_player_move_name(move, player.pokemon))}${py.str(pp_text)} for ${py.str(damage)}; boss HP ${py.str(py.max(0, this.boss_hp))}`);
            this.boss_energy = py.min(BOSS_MAX_ENERGY, py.add(this.boss_energy, Math.floor(damage / 2)));
            this.update_enrage_state();
            if (py.truth(py.and(player.catch_tank_active, () => ((move === player.pokemon.charged_move))))) {
                this.finish_catch_tank(this.current_time, player_id, "used its charged move");
            }
        }
        update_enrage_state(): void {
            if (SHADOW_RAID) {
                if (this.enraged && this.boss_hp <= SHADOW_UNENRAGE_HP) {
                    this.subdue_shadow("HP reached 15%");
                }
                else if (!this.enraged && !this.shadow_subdued && this.boss_hp > SHADOW_UNENRAGE_HP && this.boss_hp <= ENRAGE_HP) {
                    this.enraged = true;
                    this.log(this.current_time, "BOSS ENRAGED (Shadow attack/defense bonuses active)");
                    if (USE_PURIFIED_GEMS) {
                        for (let player_id = 0; player_id < this.players.length; player_id++)
                            this.push(this.current_time, "gem_use", [player_id]);
                    }
                }
                else if (!this.enraged && this.boss_hp <= SHADOW_UNENRAGE_HP) {
                    this.shadow_subdued = true;
                }
            }
            else if (SUPER_MEGA_ENRAGE && !this.enraged && this.boss_hp <= ENRAGE_HP) {
                this.enraged = true;
                this.log(this.current_time, "BOSS ENRAGED (defense x4, attack x1.8)");
            }
        }
        subdue_shadow(reason: string): void {
            if (!SHADOW_RAID || !this.enraged)
                return;
            this.enraged = false;
            this.shadow_subdued = true;
            this.log(this.current_time, `BOSS SUBDUED (${reason})`);
        }
        use_purified_gem(time: number, player_id: number, strict: boolean = false): boolean {
            const reject = (message: string): boolean => {
                if (strict)
                    throw new Error(message);
                return false;
            };
            if (!SHADOW_RAID)
                return reject("Purified Gems can only be used in Shadow raids.");
            if (!this.enraged)
                return reject("Purified Gems can only be used while the boss is enraged.");
            if (!Number.isInteger(player_id) || player_id < 0 || player_id >= this.players.length)
                return reject("Purified Gem player does not exist in this raid.");
            const player = this.players[player_id];
            if (!player.on_field) {
                if (!strict)
                    this.push(time + 0.5, "gem_use", [player_id]);
                return reject("A player in the lobby cannot use a Purified Gem.");
            }
            if (player.purified_gems_used >= PURIFIED_GEM_LIMIT_PER_PLAYER)
                return reject("A player can use at most 5 Purified Gems per raid.");
            if (player.last_purified_gem_time !== null && time < player.last_purified_gem_time + PURIFIED_GEM_COOLDOWN - 1e-9)
                return reject("Purified Gems have a 5-second cooldown per player.");
            player.purified_gems_used += 1;
            player.last_purified_gem_time = time;
            this.purified_gems_used += 1;
            this.record_replay_action(time, "player", player_id, "gem");
            this.log(time, `P${player_id + 1} uses Purified Gem ${player.purified_gems_used}/5; raid total ${this.purified_gems_used}/8`);
            if (this.purified_gems_used >= PURIFIED_GEMS_TO_SUBDUE)
                this.subdue_shadow("8 Purified Gems used");
            else if (player.purified_gems_used < PURIFIED_GEM_LIMIT_PER_PLAYER)
                this.push(time + PURIFIED_GEM_COOLDOWN, "gem_use", [player_id]);
            return true;
        }
        charge_party_power(player: Player): void {
            let threshold: any;
            /** Add one completed fast move to the trainer's Party Power meter. */
            threshold = player.party_power_threshold;
            if (py.truth(((threshold <= 0)))) {
                return;
            }
            player.party_power_progress = py.min(threshold, py.add(player.party_power_progress, 1));
            if (py.truth(py.and(!py.truth(player.party_power_active), () => ((player.party_power_progress >= threshold))))) {
                player.party_power_active = true;
                player.party_power_progress = 0;
            }
        }
        consume_party_power(player: Player): void {
            /** Consume PP and immediately activate a fully charged queued meter. */
            player.party_power_active = false;
            if (py.truth(((player.party_power_progress >= player.party_power_threshold) && (player.party_power_threshold > 0)))) {
                player.party_power_active = true;
                player.party_power_progress = 0;
            }
        }
        boss_decision(time: number): void {
            let can_charge: any;
            let move: any;
            let hit_time: any;
            let dodgers: any;
            let player_id: any;
            let player: any;
            let will_dodge: any;
            let collision: any;
            let profile: any;
            let expected_damage: any;
            can_charge = ((this.boss_energy >= this.boss_charged.energy));
            if (py.truth(py.and(can_charge, () => ((this.rng.random() < BOSS_CHARGED_CHANCE))))) {
                move = this.boss_charged;
                this.boss_energy = py.sub(this.boss_energy, move.energy);
                hit_time = py.add(time, move.duration);
                this.record_replay_action(time, "boss", null, "charged");
                this.log(time, `Boss starts ${py.str(move.name)}; hits at ${py.format(hit_time, `.2f`)}s`, "move_start");
                dodgers = py.set();
                for (const __item of py.iter(py.enumerate(this.players))) {
                    [player_id, player] = __item;
                    if (py.truth(!py.truth(player.on_field))) {
                        continue;
                    }
                    if (py.truth(this.schedule_catch_tank(time, hit_time, player_id, move))) {
                        continue;
                    }
                    will_dodge = this.should_dodge_charged(player_id, player);
                    collision = py.and(will_dodge, () => py.and(player.action_is_charged, () => ((player.action_start < hit_time) && (hit_time < player.action_end))));
                    if (!py.truth(((this.dodge_profiles !== null))))
                        throw new Error("Internal assertion failed");
                    profile = py.at(this.dodge_profiles, [player_id, player.pokemon_index, this.enraged]);
                    expected_damage = (py.truth(py.and(will_dodge, () => !py.truth(collision))) ? profile.dodged_damage : profile.full_damage);
                    if (py.truth(py.and(this.announced_charge_prevents_next_charge(player_id, player, hit_time, expected_damage, move), () => this.save_energy_for_announced_charge(time, hit_time, player_id, move)))) {
                        continue;
                    }
                    if (py.truth(!py.truth(will_dodge))) {
                        continue;
                    }
                    if (py.truth(collision)) {
                        this.log(time, `P${py.str(py.add(player_id, 1))} tries to dodge ${py.str(move.name)}, but its charged-move animation overlaps the hit`);
                        continue;
                    }
                    dodgers.add(player_id);
                    this.record_replay_action(time, "player", player_id, "dodge");
                    this.log(time, `P${py.str(py.add(player_id, 1))} chooses to dodge ${py.str(move.name)}`);
                    this.schedule_player(player_id, py.add(py.max(time, player.next_action_time), DODGE_SECONDS));
                }
                this.push(hit_time, "boss_hit", [move, py.set(dodgers)]);
                this.push(hit_time, "boss_decision");
            }
            else {
                move = this.boss_fast;
                this.boss_energy = py.min(BOSS_MAX_ENERGY, py.add(this.boss_energy, move.energy));
                hit_time = py.add(time, move.duration);
                this.record_replay_action(time, "boss", null, "fast");
                this.log(time, `Boss starts ${py.str(move.name)}; hits at ${py.format(hit_time, `.2f`)}s`, "move_start");
                this.push(hit_time, "boss_hit", [move, py.set()]);
                this.push(py.add(hit_time, FAST_MOVE_DELAY), "boss_decision");
            }
        }
        apply_boss_hit(move: Move, dodgers: Set<number>): void {
            let player_id: any;
            let player: any;
            let damage: any;
            let dodge_text: any;
            for (const __item of py.iter(py.enumerate(this.players))) {
                [player_id, player] = __item;
                if (py.truth(!py.truth(player.on_field))) {
                    continue;
                }
                damage = this.incoming_damage(move, player_id, player, ((py.has(dodgers, player_id))));
                player.hp = py.sub(player.hp, damage);
                player.damage_taken = py.add(player.damage_taken, damage);
                if (py.truth(((py.has(dodgers, player_id))))) {
                    player.successful_dodges = py.add(player.successful_dodges, 1);
                }
                dodge_text = (py.truth(((py.has(dodgers, player_id)))) ? " (dodged)" : "");
                this.log(this.current_time, `Boss ${py.str(move.name)} hits P${py.str(py.add(player_id, 1))} for ${py.str(damage)}${py.str(dodge_text)}; ${py.str(player.species.name)} HP ${py.str(py.max(0, player.hp))}`);
                if (py.truth(PLAYER_ENERGY_FROM_DAMAGE)) {
                    player.energy = py.min(100, py.add(player.energy, Math.floor((damage / 2))));
                }
                if (py.truth(((player.hp <= 0)))) {
                    player.faints = py.add(player.faints, 1);
                    this.switch(this.current_time, player_id, false);
                }
            }
        }
        capture_replay_state(): void {
            /** Optional playback observer; ordinary trials do not collect states. */
        }
        run(): TrialResult {
            let player_id: any;
            let last_time: any;
            let time: any;
            let _seq: any;
            let kind: any;
            let data: any;
            let p: any;
            this.capture_replay_state();
            for (const __item of py.iter(py.range(py.len(this.players)))) {
                player_id = __item;
                this.schedule_player(player_id, 0.0);
            }
            this.push(0.0, "boss_decision");
            last_time = 0.0;
            while (py.truth(this.events)) {
                [time, _seq, kind, data] = py.heappop(this.events);
                if (py.truth(py.or(((time > RAID_SECONDS)), () => ((this.boss_hp <= 0))))) {
                    break;
                }
                this.current_time = time;
                last_time = time;
                if (py.truth(((py.equal(kind, "player_ready"))))) {
                    this.start_player_action(time, ...(data as [
                        any,
                        any
                    ]));
                }
                else {
                    if (py.truth(((py.equal(kind, "player_hit"))))) {
                        this.apply_player_hit(...(data as [
                            any,
                            any,
                            any
                        ]));
                    }
                    else {
                        if (py.truth(((py.equal(kind, "boss_decision"))))) {
                            this.boss_decision(time);
                        }
                        else {
                            if (py.truth(((py.equal(kind, "boss_hit"))))) {
                                this.apply_boss_hit(...(data as [
                                    any,
                                    any
                                ]));
                            }
                            else {
                                if (py.truth(((py.equal(kind, "catch_tank_swap"))))) {
                                    this.start_catch_tank(time, ...(data as [
                                        any,
                                        any
                                    ]));
                                }
                                else {
                                if (py.truth(((py.equal(kind, "rejoin"))))) {
                                    this.rejoin(time, ...(data as [
                                        any
                                    ]));
                                }
                                else if (py.truth(((py.equal(kind, "gem_use"))))) {
                                    this.use_purified_gem(time, ...(data as [any]));
                                }
                                }
                            }
                        }
                    }
                }
                this.capture_replay_state();
            }
            return new TrialResult(((this.boss_hp <= 0)), (py.truth(((this.boss_hp <= 0))) ? last_time : RAID_SECONDS), py.max(0, this.boss_hp), py.sum(py.iter(this.players).map((p: any) => (p.switches))), py.sum(py.iter(this.players).map((p: any) => (p.faints))), py.sum(py.iter(this.players).map((p: any) => (p.tactical_switches))), py.sum(py.iter(this.players).map((p: any) => (p.rejoins))), py.sum(py.iter(this.players).map((p: any) => (p.catch_tanks_used))), this.purified_gems_used);
        }
    }
    function replay_tick_text(tick: number): string {
        let whole: any;
        let half: any;
        [whole, half] = py.divmod(tick, 2);
        return (py.truth(half) ? `${py.str(whole)}.5` : py.str(whole));
    }
    function build_replay_move_codes(move_names: (string)[]): Record<string, string> {
        let codes_by_name: any;
        let used_codes: any;
        let move_name: any;
        let words: any;
        let base: any;
        let word: any;
        let code: any;
        let suffix: any;
        /** Create compact, deterministic aliases and disambiguate collisions. */
        codes_by_name = py.dict([]);
        used_codes = new Set<any>(["d", "g", "q", "r"]);
        for (const __item of py.iter(move_names)) {
            move_name = __item;
            if (py.truth(((py.has(codes_by_name, move_name))))) {
                continue;
            }
            words = re.findall("[A-Za-z0-9]+", py.rstrip(move_name, "+"));
            if (py.truth(!py.truth(words))) {
                base = "mv";
            }
            else {
                if (py.truth(((py.equal(py.len(words), 1))))) {
                    base = py.lower(py.slice(py.at(words, 0), undefined, 2));
                }
                else {
                    base = py.lower(py.join("", py.iter(words).map((word: any) => (py.at(word, 0)))));
                }
            }
            if (py.truth(py.or(((py.has(used_codes, base))), () => re.fullmatch("s\\d+", base)))) {
                base = py.add(base, "m");
            }
            code = base;
            suffix = 2;
            while (py.truth(((py.has(used_codes, code))))) {
                code = `${py.str(base)}${py.str(suffix)}`;
                suffix = py.add(suffix, 1);
            }
            used_codes.add(code);
            codes_by_name[py.key(move_name)] = code;
        }
        return codes_by_name;
    }
    function render_battle_replay(simulation: Simulation, result: TrialResult, actual_seed: number | string | bigint): string {
        let move_names: any;
        let _tick: any;
        let _sequence: any;
        let actor: any;
        let _actor_id: any;
        let kind: any;
        let value: any;
        let move_codes: any;
        let grouped: any;
        let group_indexes: any;
        let tick: any;
        let actor_id: any;
        let key: any;
        let group_index: any;
        let players: any;
        let lines: any;
        let player_id: any;
        let team: any;
        let multiplier: any;
        let enabled: any;
        let index: any;
        let indexes: any;
        let party_groups: any;
        let group: any;
        let move_name: any;
        let code: any;
        let previous_tick: any;
        let event: any;
        let time_code: any;
        let actor_code: any;
        let action_code: any;
        /** Render one completed detailed simulation in the compact text format. */
        move_names = py.iter(simulation.replay_actions).filter(([_tick, _sequence, actor, _actor_id, kind, value]: any) => py.truth(py.and(((py.equal(actor, "player"))), () => ((py.equal(kind, "move")))))).map(([_tick, _sequence, actor, _actor_id, kind, value]: any) => (py.str(value)));
        move_codes = build_replay_move_codes(move_names);
        grouped = [];
        group_indexes = py.dict([]);
        for (const __item of py.iter(simulation.replay_actions)) {
            [tick, _sequence, actor, actor_id, kind, value] = __item;
            if (py.truth(((py.equal(actor, "player"))))) {
                key = [tick, kind, value];
                group_index = py.get(group_indexes, key);
                if (py.truth(((group_index !== null)))) {
                    players = py.at(py.at(grouped, group_index), "players");
                    if (!py.truth(py.isinstance(players, "list")))
                        throw new Error("Internal assertion failed");
                    py.append(players, py.int(actor_id));
                    continue;
                }
                group_indexes[py.key(key)] = py.len(grouped);
                py.append(grouped, py.dict([["tick", tick], ["actor", actor], ["players", [py.int(actor_id)]], ["kind", kind], ["value", value]]));
            }
            else {
                py.append(grouped, py.dict([["tick", tick], ["actor", actor], ["players", []], ["kind", kind], ["value", value]]));
            }
        }
        lines = [`Raid: ${py.str(RAID_DIFFICULTY)}`, `Boss: ${py.str(BOSS_FORM_ID)}; fast=${py.str(simulation.boss_fast.name)}; charged=${py.str(simulation.boss_charged.name)}`, "Teams:"];
        py.extend(lines, py.iter(py.enumerate(PLAYER_TEAMS, 1)).map(([player_id, team]: any) => (`p${py.str(player_id)}: ${py.repr(team)}`)));
        py.extend(lines, ["", py.add("Friendship: ", py.join("; ", py.iter(py.enumerate(FRIENDSHIP_MULTIPLIERS, 1)).map(([player_id, multiplier]: any) => (`p${py.str(player_id)}=${py.format(py.float(multiplier), `g`)}`)))), py.add("Zacian effects: ", py.join("; ", py.iter(py.enumerate(ZACIAN_ADVENTURE_EFFECT, 1)).map(([player_id, enabled]: any) => (`p${py.str(player_id)}=${py.str((py.truth(enabled) ? "true" : "false"))}`)))), py.add("Behemoth Bash effects: ", py.join("; ", py.iter(py.enumerate(BEHEMOTH_BASH_ADVENTURE_EFFECT, 1)).map(([player_id, enabled]: any) => (`p${py.str(player_id)}=${py.str((py.truth(enabled) ? "true" : "false"))}`)))), py.add("Dynamic Punch+ effects: ", py.join("; ", py.iter(py.enumerate(DYNAMIC_PUNCH_ADVENTURE_EFFECT, 1)).map(([player_id, enabled]: any) => (`p${py.str(player_id)}=${py.str((py.truth(enabled) ? "true" : "false"))}`)))), `Weather: ${py.str(py.or(WEATHER, () => "none"))}`, `Dodge: ${py.str(DODGE_STRATEGY)}`, `Swap: ${py.str(PLAYER_STRATEGY)}`, `Purified Gems: ${USE_PURIFIED_GEMS ? "use" : "none"}`, py.add("Catch tanks: ", py.join("; ", py.iter(py.enumerate(CATCH_TANK_TEAM_INDICES, 1)).map(([player_id, indexes]: any) => (py.add(`p${py.str(player_id)}=`, (py.truth(indexes) ? py.join(",", py.iter(indexes).map((index: any) => (py.str(py.add(index, 1))))) : "-"))))))]);
        party_groups = py.or(py.join("|", py.iter(PARTY_POWER_GROUPS).map((group: any) => (py.add("p", py.join(",", py.iter(group).map((player_id: any) => (py.str(py.add(player_id, 1))))))))), () => "-");
        py.extend(lines, [`Party Power: ${py.str((py.truth(BOOSTED_PARTY_POWER) ? "boosted" : "normal"))}; groups=${py.str(party_groups)}`, `Seed: ${py.str(actual_seed)}`, `Result: ${py.str((py.truth(result.won) ? "win" : "loss"))}; time=${py.str(replay_tick_text(py.round(py.mul(result.finish_time, 2))))}; boss_hp=${py.str(result.boss_hp)}`]);
        if (py.truth(move_codes)) {
            py.append(lines, py.add("Move codes: ", py.join("; ", py.iter(py.items(move_codes)).map(([move_name, code]: any) => (`${py.str(code)}=${py.str(move_name)}`)))));
        }
        py.extend(lines, ["", "Events:"]);
        previous_tick = null;
        for (const __item of py.iter(grouped)) {
            event = __item;
            tick = py.int(py.at(event, "tick"));
            if (py.truth(((previous_tick === null)))) {
                time_code = py.add("t", replay_tick_text(tick));
            }
            else {
                time_code = py.add("+", replay_tick_text(py.sub(tick, previous_tick)));
            }
            previous_tick = tick;
            if (py.truth(((py.equal(py.at(event, "actor"), "boss"))))) {
                actor_code = "b";
                action_code = (py.truth(((py.equal(py.at(event, "kind"), "charged")))) ? "c" : "f");
            }
            else {
                players = py.at(event, "players");
                if (!py.truth(py.and(py.isinstance(players, "list"), () => players)))
                    throw new Error("Internal assertion failed");
                actor_code = py.add("p", py.join(",", py.iter(players).map((player_id: any) => (py.str(py.add(player_id, 1))))));
                kind = py.at(event, "kind");
                value = py.at(event, "value");
                if (py.truth(((py.equal(kind, "move"))))) {
                    action_code = py.at(move_codes, py.str(value));
                }
                else {
                    if (py.truth(((py.equal(kind, "switch"))))) {
                        action_code = `s${py.str(py.int(value))}`;
                    }
                    else {
                        if (py.truth(((py.equal(kind, "quit"))))) {
                            action_code = "q";
                        }
                        else {
                            if (py.truth(((py.equal(kind, "rejoin"))))) {
                                action_code = "r";
                            }
                            else {
                                if (py.truth(((py.equal(kind, "dodge"))))) {
                                    action_code = "d";
                                }
                                else if (py.truth(((py.equal(kind, "gem"))))) {
                                    action_code = "g";
                                }
                                else {
                                    throw new Error(`Unknown replay action kind ${py.repr(kind)}`);
                                }
                            }
                        }
                    }
                }
            }
            py.append(lines, `${py.str(time_code)}${py.str(actor_code)}:${py.str(action_code)}`);
        }
        return py.join("\n", lines);
    }
    function simulate_moveset_details(fast: Move, charged: Move, seed: number | string | bigint): ([
        TrialResult,
        string
    ])[] {
        let rng: any;
        let dodge_profiles: any;
        let details: any;
        let _: any;
        let simulation: any;
        rng = new PythonRandom(seed);
        dodge_profiles = precompute_dodge_profiles(charged);
        details = [];
        for (const __item of py.iter(py.range(TRIALS_PER_MOVESET))) {
            _ = __item;
            simulation = new Simulation(fast, charged, rng, dodge_profiles);
            py.append(details, [simulation.run(), simulation.boss_fast.move_type]);
        }
        return details;
    }
    function simulate_moveset(fast: Move, charged: Move, seed: number | string | bigint): (TrialResult)[] {
        let result: any;
        let _move_type: any;
        return py.iter(simulate_moveset_details(fast, charged, seed)).map(([result, _move_type]: any) => (result));
    }
    function aggregate_summary(): Record<string, any> {
        let rows: any;
        let row_seed: any;
        let total_wins: any;
        let total_battles: any;
        let fast: any;
        let charged: any;
        let details: any;
        let results: any;
        let result: any;
        let _move_type: any;
        let wins: any;
        let losses: any;
        let type_counts: any;
        let _result: any;
        let move_type: any;
        let r: any;
        /** Return website-friendly aggregate results for every configured moveset. */
        rows = [];
        row_seed = RANDOM_SEED;
        total_wins = 0;
        total_battles = 0;
        for (const __item of py.iter(py.values(BOSS_FAST_MOVES))) {
            fast = __item;
            for (const __item of py.iter(py.values(BOSS_CHARGED_MOVES))) {
                charged = __item;
                details = simulate_moveset_details(fast, charged, row_seed);
                results = py.iter(details).map(([result, _move_type]: any) => (result));
                wins = py.iter(results).filter((result: any) => py.truth(result.won)).map((result: any) => (result));
                losses = py.iter(results).filter((result: any) => py.truth(!py.truth(result.won))).map((result: any) => (result));
                type_counts = py.dict([]);
                if (py.truth(((py.equal(fast.name, "Hidden Power"))))) {
                    for (const __item of py.iter(details)) {
                        [_result, move_type] = __item;
                        type_counts[py.key(move_type)] = py.add(py.get(type_counts, move_type, 0), 1);
                    }
                }
                py.append(rows, py.dict([["fast_move", fast.name], ["charged_move", charged.name], ["games", py.len(results)], ["wins", py.len(wins)], ["win_percent", (py.mul(100, py.len(wins)) / py.len(results))], ["average_win_time", (py.truth(wins) ? py.mean(py.iter(wins).map((r: any) => (r.finish_time))) : null)], ["average_boss_hp_on_loss", (py.truth(losses) ? py.mean(py.iter(losses).map((r: any) => (r.boss_hp))) : 0.0)], ["average_switches", py.mean(py.iter(results).map((r: any) => (r.switches)))], ["average_faints", py.mean(py.iter(results).map((r: any) => (r.faints)))], ["average_retreats", py.mean(py.iter(results).map((r: any) => (r.tactical_switches)))], ["average_rejoins", py.mean(py.iter(results).map((r: any) => (r.rejoins)))], ["average_catch_tanks", py.mean(py.iter(results).map((r: any) => (r.catch_tanks_used)))], ["average_purified_gems", py.mean(py.iter(results).map((r: any) => (r.purified_gems_used)))], ["hidden_power_types", type_counts], ["seed", py.str(row_seed)]]));
                total_wins = py.add(total_wins, py.len(wins));
                total_battles = py.add(total_battles, py.len(results));
                row_seed = py.add(row_seed, 1);
            }
        }
        return py.dict([["mode", "batch"], ["random_seed", py.str(RANDOM_SEED)], ["total_battles", total_battles], ["total_wins", total_wins], ["win_percent", (py.mul(100, total_wins) / total_battles)], ["movesets", rows]]);
    }
    function moveset_seed(fast_name: string, charged_name: string): number {
        let combinations: any;
        let fast: any;
        let charged: any;
        combinations = (() => { const result: any[] = []; for (const fast of py.iter(BOSS_FAST_MOVES)) {
            for (const charged of py.iter(BOSS_CHARGED_MOVES)) {
                result.push([fast, charged]);
            }
        } return result; })();
        try {
            return py.add(RANDOM_SEED, py.index(combinations, [fast_name, charged_name]));
        }
        catch (error) {
            throw new Error(`Unknown moveset ${py.repr(fast_name)} / ${py.repr(charged_name)}`);
        }
    }
    function validate_settings(): void {
        let invalid_boss_types: any;
        let move_type: any;
        let player_count: any;
        let team: any;
        let conflicting_adventure_effects: any;
        let player_id: any;
        let effects: any;
        let effect: any;
        let invalid_catch_tanks: any;
        let indices: any;
        let index: any;
        let invalid_setups: any;
        let setup: any;
        let normalized_setups: any;
        let unknown_species: any;
        let species: any;
        let _fast: any;
        let _charged: any;
        let _level: any;
        let _ivs: any;
        let too_many_megas: any;
        let unknown_moves: any;
        let _species: any;
        let fast: any;
        let charged: any;
        let move: any;
        let invalid_levels: any;
        let level: any;
        let invalid_ivs: any;
        let attack_iv: any;
        let defense_iv: any;
        let stamina_iv: any;
        let _shadow: any;
        let _mega_level: any;
        let iv: any;
        let invalid_mega_levels: any;
        let _attack_iv: any;
        let _defense_iv: any;
        let _stamina_iv: any;
        let mega_level: any;
        let illegal_plus_moves: any;
        let invalid_shadow_flags: any;
        let shadow: any;
        let invalid_sizes: any;
        let group: any;
        let grouped_players: any;
        let invalid_players: any;
        if (py.truth(((TRIALS_PER_MOVESET <= 0)))) {
            throw new Error("TRIALS_PER_MOVESET must be a positive integer");
        }
        if (py.truth(((!py.has(DODGE_STRATEGIES, DODGE_STRATEGY))))) {
            throw new Error(`Unknown DODGE_STRATEGY ${py.repr(DODGE_STRATEGY)}; choose from ${py.str(DODGE_STRATEGIES)}`);
        }
        if (py.truth(((!py.has(PLAYER_STRATEGIES, PLAYER_STRATEGY))))) {
            throw new Error(`Unknown PLAYER_STRATEGY ${py.repr(PLAYER_STRATEGY)}; choose from ${py.str(PLAYER_STRATEGIES)}`);
        }
        if (py.truth(((!py.has(BATTLE_LOG_MODES, BATTLE_LOG_MODE))))) {
            throw new Error(`Unknown BATTLE_LOG_MODE ${py.repr(BATTLE_LOG_MODE)}; choose from ${py.str(BATTLE_LOG_MODES)}`);
        }
        if (py.truth(py.or(!py.truth(BOSS_FAST_MOVES), () => !py.truth(BOSS_CHARGED_MOVES)))) {
            throw new Error("The boss must have at least one fast and one charged move");
        }
        invalid_boss_types = py.iter(BOSS_TYPES).filter((move_type: any) => py.truth(((!py.has(TYPES, move_type))))).map((move_type: any) => (move_type));
        if (py.truth(py.or(!py.truth(BOSS_TYPES), () => invalid_boss_types))) {
            throw new Error(`Invalid boss types ${py.str(BOSS_TYPES)}; expected one or two values from ${py.str(TYPES)}`);
        }
        if (py.truth(py.or(((BOSS_ATTACK_BASE <= 0)), () => ((BOSS_DEFENSE_BASE <= 0))))) {
            throw new Error("Boss Attack and Defense must both be positive");
        }
        player_count = py.len(PLAYER_TEAMS);
        if (py.truth(py.or(!py.truth(player_count), () => py.iter(py.iter(PLAYER_TEAMS).map((team: any) => (!py.truth(team)))).some(py.truth)))) {
            throw new Error("Every player must have at least one Pokémon");
        }
        if (py.truth(((!py.equal(py.len(FRIENDSHIP_MULTIPLIERS), player_count))))) {
            throw new Error("FRIENDSHIP_MULTIPLIERS must contain one value per player");
        }
        if (py.truth(((!py.equal(py.len(ZACIAN_ADVENTURE_EFFECT), player_count))))) {
            throw new Error("ZACIAN_ADVENTURE_EFFECT must contain one value per player");
        }
        if (py.truth(((!py.equal(py.len(BEHEMOTH_BASH_ADVENTURE_EFFECT), player_count))))) {
            throw new Error("BEHEMOTH_BASH_ADVENTURE_EFFECT must contain one value per player");
        }
        if (py.truth(((!py.equal(py.len(DYNAMIC_PUNCH_ADVENTURE_EFFECT), player_count))))) {
            throw new Error("DYNAMIC_PUNCH_ADVENTURE_EFFECT must contain one value per player");
        }
        conflicting_adventure_effects = py.iter(py.enumerate(py.zip(ZACIAN_ADVENTURE_EFFECT, BEHEMOTH_BASH_ADVENTURE_EFFECT, DYNAMIC_PUNCH_ADVENTURE_EFFECT))).filter(([player_id, effects]: any) => py.truth(((py.sum(py.iter(effects).map((effect: any) => (py.truth(effect)))) > 1)))).map(([player_id, effects]: any) => (py.add(player_id, 1)));
        if (py.truth(conflicting_adventure_effects)) {
            throw new Error(`Only one Adventure Effect may be active per player; conflicting players: ${py.str(conflicting_adventure_effects)}`);
        }
        if (py.truth(((!py.equal(py.len(CATCH_TANK_TEAM_INDICES), player_count))))) {
            throw new Error("CATCH_TANK_TEAM_INDICES must contain one index list per player");
        }
        invalid_catch_tanks = py.iter(py.enumerate(py.zip(PLAYER_TEAMS, CATCH_TANK_TEAM_INDICES))).filter(([player_id, [team, indices]]: any) => py.truth(py.or(((!py.equal(py.len(indices), py.len(py.set(indices))))), () => py.or(((py.len(indices) >= py.len(team))), () => py.iter(py.iter(indices).map((index: any) => (py.or(!py.truth(py.isinstance(index, "int")), () => py.or(py.isinstance(index, "bool"), () => !py.truth(((0 <= index) && (index < py.len(team))))))))).some(py.truth))))).map(([player_id, [team, indices]]: any) => ([player_id, indices]));
        if (py.truth(invalid_catch_tanks)) {
            throw new Error(`Each player's catch-tank indexes must be unique valid team positions and leave one normal attacker: ${py.str(invalid_catch_tanks)}`);
        }
        invalid_setups = (() => { const result: any[] = []; for (const team of py.iter(PLAYER_TEAMS)) {
            for (const setup of py.iter(team)) {
                if (!py.truth(py.or(!py.truth(py.isinstance(setup, "(tuple, list)")), () => ((!py.has([4, 7, 8, 9], py.len(setup)))))))
                    continue;
                result.push(setup);
            }
        } return result; })();
        if (py.truth(invalid_setups)) {
            throw new Error("Each PLAYER_TEAMS entry must contain species, fast move, charged move, and level, optionally followed by attack/defense/stamina IVs, a Shadow flag, and Mega Level");
        }
        normalized_setups = (() => { const result: any[] = []; for (const team of py.iter(PLAYER_TEAMS)) {
            for (const setup of py.iter(team)) {
                result.push(unpack_player_setup(setup));
            }
        } return result; })();
        unknown_species = py.iter(normalized_setups).filter(([species, _fast, _charged, _level, ..._ivs]: any) => py.truth(((!py.has(SPECIES, species))))).map(([species, _fast, _charged, _level, ..._ivs]: any) => (species));
        if (py.truth(unknown_species)) {
            throw new Error(`Unknown species in PLAYER_TEAMS: ${py.str(unknown_species)}`);
        }
        too_many_megas = py.iter(py.enumerate(PLAYER_TEAMS)).filter(([player_id, team]: any) => py.truth(((py.sum(py.iter(team).map((setup: any) => (py.truth(py.at(SPECIES, py.at(unpack_player_setup(setup), 0)).mega_boost_types)))) > 1)))).map(([player_id, team]: any) => (py.add(player_id, 1)));
        if (py.truth(too_many_megas)) {
            throw new Error(`Each player team may contain at most one Mega/Primal Pokémon; invalid players: ${py.str(too_many_megas)}`);
        }
        unknown_moves = (() => { const result: any[] = []; for (const [_species, fast, charged, _level, ..._ivs] of py.iter(normalized_setups)) {
            for (const move of py.iter([fast, charged])) {
                if (!py.truth(((!py.has(MOVES, move)))))
                    continue;
                result.push(move);
            }
        } return result; })();
        if (py.truth(unknown_moves)) {
            throw new Error(`Unknown moves in PLAYER_TEAMS: ${py.str(unknown_moves)}`);
        }
        invalid_levels = py.iter(normalized_setups).filter(([_species, _fast, _charged, level, ..._ivs]: any) => py.truth(py.or(!py.truth(py.isinstance(level, "(int, float)")), () => py.or(py.isinstance(level, "bool"), () => py.or(((!py.has(CPM_BY_HALF_LEVEL, py.round(py.mul(level, 2))))), () => ((Math.abs(py.sub(py.mul(level, 2), py.round(py.mul(level, 2)))) > 1e-09))))))).map(([_species, _fast, _charged, level, ..._ivs]: any) => (level));
        if (py.truth(invalid_levels)) {
            throw new Error(`Pokémon levels must be half-levels from 1 through 55: ${py.str(invalid_levels)}`);
        }
        invalid_ivs = (() => { const result: any[] = []; for (const [_species, _fast, _charged, _level, attack_iv, defense_iv, stamina_iv, _shadow, _mega_level] of py.iter(normalized_setups)) {
            for (const iv of py.iter([attack_iv, defense_iv, stamina_iv])) {
                if (!py.truth(py.or(!py.truth(py.isinstance(iv, "int")), () => py.or(py.isinstance(iv, "bool"), () => !py.truth(((0 <= iv) && (iv <= 15)))))))
                    continue;
                result.push(iv);
            }
        } return result; })();
        if (py.truth(invalid_ivs)) {
            throw new Error(`Pokémon IVs must be integers from 0 through 15: ${py.str(invalid_ivs)}`);
        }
        invalid_mega_levels = py.iter(normalized_setups).filter(([_species, _fast, _charged, _level, _attack_iv, _defense_iv, _stamina_iv, _shadow, mega_level]: any) => py.truth(py.or(!py.truth(py.isinstance(mega_level, "int")), () => py.or(py.isinstance(mega_level, "bool"), () => !py.truth(((1 <= mega_level) && (mega_level <= 4))))))).map(([_species, _fast, _charged, _level, _attack_iv, _defense_iv, _stamina_iv, _shadow, mega_level]: any) => (mega_level));
        if (py.truth(invalid_mega_levels)) {
            throw new Error(`Mega Levels must be integers from 1 through 4: ${py.str(invalid_mega_levels)}`);
        }
        illegal_plus_moves = py.iter(normalized_setups).filter(([species, _fast, charged, _level, _attack_iv, _defense_iv, _stamina_iv, _shadow, _mega_level]: any) => py.truth(py.and(((py.has(PLUS_MOVE_FORM_IDS, charged))), () => ((!py.equal(py.at(SPECIES, species).form_id, py.at(PLUS_MOVE_FORM_IDS, charged))))))).map(([species, _fast, charged, _level, _attack_iv, _defense_iv, _stamina_iv, _shadow, _mega_level]: any) => ([species, charged, py.at(SPECIES, species).form_id]));
        if (py.truth(illegal_plus_moves)) {
            throw new Error(`Each + move can only be used by its corresponding Mega form: ${py.str(illegal_plus_moves)}`);
        }
        invalid_shadow_flags = py.iter(normalized_setups).filter(([_species, _fast, _charged, _level, _attack_iv, _defense_iv, _stamina_iv, shadow, _mega_level]: any) => py.truth(!py.truth(py.isinstance(shadow, "bool")))).map(([_species, _fast, _charged, _level, _attack_iv, _defense_iv, _stamina_iv, shadow, _mega_level]: any) => (shadow));
        if (py.truth(invalid_shadow_flags)) {
            throw new Error(`Pokémon Shadow flags must be true or false: ${py.str(invalid_shadow_flags)}`);
        }
        if (py.truth(((!py.has(WEATHER_BOOSTED_TYPES, WEATHER))))) {
            throw new Error(`Unknown WEATHER ${py.repr(WEATHER)}; choose from ${py.str(py.iter(WEATHER_BOOSTED_TYPES))}`);
        }
        invalid_sizes = py.iter(PARTY_POWER_GROUPS).filter((group: any) => py.truth(((!py.has([2, 3, 4], py.len(group)))))).map((group: any) => (py.len(group)));
        if (py.truth(invalid_sizes)) {
            throw new Error(`Party Power groups must contain 2-4 players: ${py.str(invalid_sizes)}`);
        }
        grouped_players = (() => { const result: any[] = []; for (const group of py.iter(PARTY_POWER_GROUPS)) {
            for (const player_id of py.iter(group)) {
                result.push(player_id);
            }
        } return result; })();
        if (py.truth(((!py.equal(py.len(grouped_players), py.len(py.set(grouped_players))))))) {
            throw new Error("A player may appear in only one Party Power group");
        }
        invalid_players = py.iter(grouped_players).filter((player_id: any) => py.truth(py.or(!py.truth(py.isinstance(player_id, "int")), () => py.or(py.isinstance(player_id, "bool"), () => !py.truth(((0 <= player_id) && (player_id < player_count))))))).map((player_id: any) => (player_id));
        if (py.truth(invalid_players)) {
            throw new Error(`Invalid player indexes in PARTY_POWER_GROUPS: ${py.str(invalid_players)}`);
        }
    }
    /** Start an independent attempt; detailed mode records replay actions and logs. */
    function createSimulation(options: {
        fast?: string;
        charged?: string;
        seed?: number | string | bigint;
        detailed?: boolean;
    } = {}): Simulation {
        validate_settings();
        const fast = BOSS_FAST_MOVES[options.fast ?? Object.keys(BOSS_FAST_MOVES)[0]];
        const charged = BOSS_CHARGED_MOVES[options.charged ?? Object.keys(BOSS_CHARGED_MOVES)[0]];
        if (!fast || !charged)
            throw new Error('Choose a configured boss moveset.');
        const sim = new Simulation(fast, charged, new PythonRandom(options.seed ?? RANDOM_SEED));
        sim.detailed = options.detailed ?? false;
        return sim;
    }
    return { createSimulation, type_effectiveness, Move, Species, find_calculator_species, move_from_calculator, register_player_form, register_player_moves, register_new_mega_form, register_configured_player_forms, BattlePokemon, unpack_player_setup, effective_player_move_power, displayed_player_move_name, select_boss_moves, pokemon_go_damage, boss_type_modifier, weather_move_multiplier, DodgeProfile, incoming_damage_for_pokemon, precompute_dodge_profiles, Player, TrialResult, Simulation, replay_tick_text, build_replay_move_codes, render_battle_replay, simulate_moveset_details, simulate_moveset, aggregate_summary, moveset_seed, validate_settings, RAID_DIFFICULTIES, RAID_DIFFICULTY, RAID_SECONDS, BOSS_HP, BOSS_CPM, BOSS_NAME, BOSS_TYPES, BOSS_FAST_MOVES, BOSS_CHARGED_MOVES, BOSS_MAX_ENERGY, FAST_MOVE_DELAY, SWITCH_SECONDS, DODGE_SECONDS, REJOIN_TIMES, RANDOM_SEED, SHADOW_RAID, SUPER_MEGA_ENRAGE, ENRAGE_HP, SHADOW_UNENRAGE_HP, USE_PURIFIED_GEMS, PURIFIED_GEM_COOLDOWN, PURIFIED_GEM_LIMIT_PER_PLAYER, PURIFIED_GEMS_TO_SUBDUE, SHADOW_ENRAGE_DEFENSE_BONUS, ZACIAN_ADVENTURE_EFFECT, BEHEMOTH_BASH_ADVENTURE_EFFECT, DYNAMIC_PUNCH_ADVENTURE_EFFECT, HIDDEN_POWER_TYPES, MOVES, SPECIES };
}
export type RaidEngine = ReturnType<typeof createRaidEngine>;
export type Simulation = InstanceType<RaidEngine["Simulation"]>;
export type Move = InstanceType<RaidEngine["Move"]>;
export type BattlePokemon = InstanceType<RaidEngine["BattlePokemon"]>;
export type TrialResult = InstanceType<RaidEngine["TrialResult"]>;
