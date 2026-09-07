"""Configurable Pokémon GO raid simulator.

Run with:  python super_mega_raid_simulator.py
Keep calculator_data.json beside this script, then edit BOSS_* and PLAYER_TEAMS.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from heapq import heappop, heappush
from math import ceil, floor
import argparse
import json
import os
import random
import re
from pathlib import Path
from statistics import mean


# ----------------------------- Editable settings -----------------------------

TRIALS_PER_MOVESET = 1_000
RANDOM_SEED = 20260716

# Raid HP, CPM, and timers mirror PokéChespin's current public raid modes.
# Shadow tiers expose their correct base HP/CPM/timer, but this simulator does
# not yet model Shadow enrage or Purified Gems.
RAID_DIFFICULTIES = {
    "Tier 1": {"hp": 600, "cpm": 0.5974, "seconds": 180.0},
    "Tier 3": {"hp": 3_600, "cpm": 0.73, "seconds": 180.0},
    "Tier 4": {"hp": 9_000, "cpm": 0.79, "seconds": 300.0},
    "Tier 5": {"hp": 15_000, "cpm": 0.79, "seconds": 300.0},
    "Mega": {"hp": 9_000, "cpm": 0.79, "seconds": 300.0},
    "Mega Legendary": {"hp": 22_500, "cpm": 0.79, "seconds": 300.0},
    "Super Mega": {
        "hp": 25_000, "cpm": 0.79, "seconds": 300.0,
        "super_mega_enrage": True,
    },
    "Elite": {"hp": 22_500, "cpm": 1.0, "seconds": 300.0},
    "Primal": {"hp": 22_500, "cpm": 0.79, "seconds": 300.0},
    "Tier 1 Shadow": {
        "hp": 600, "cpm": 0.5974, "seconds": 180.0, "shadow": True,
    },
    "Tier 3 Shadow": {
        "hp": 3_600, "cpm": 0.76, "seconds": 180.0, "shadow": True,
    },
    "Tier 5 Shadow": {
        "hp": 15_000, "cpm": 0.82, "seconds": 300.0, "shadow": True,
    },
}
RAID_DIFFICULTY = "Tier 5"
if RAID_DIFFICULTY not in RAID_DIFFICULTIES:
    raise ValueError(
        f"Unknown RAID_DIFFICULTY {RAID_DIFFICULTY!r}; "
        f"choose from {tuple(RAID_DIFFICULTIES)}"
    )
RAID_RULES = RAID_DIFFICULTIES[RAID_DIFFICULTY]
RAID_SECONDS = RAID_RULES["seconds"]
BOSS_HP = RAID_RULES["hp"]
BOSS_CPM = RAID_RULES["cpm"]
SUPER_MEGA_ENRAGE = RAID_RULES.get("super_mega_enrage", False)
ENRAGE_HP = floor(BOSS_HP * 0.80) if SUPER_MEGA_ENRAGE else -1

FAST_MOVE_DELAY = 2.5
BOSS_CHARGED_CHANCE = 0.30
BOSS_MAX_ENERGY = 200.0
ENRAGE_ATTACK_MULTIPLIER = 1.8
DODGE_SECONDS = 1.0
DODGED_DAMAGE_FRACTION = 0.25
SWITCH_SECONDS = 1.0
REJOIN_TIMES = (7.0, 7.5, 8.0)
PLAYER_ENERGY_FROM_DAMAGE = True

# Put (species, fast move, charged move, level, attack IV, defense IV, stamina IV,
# shadow, mega level) in battle order. The IVs, Shadow flag, and Mega Level may
# be omitted. Mega Level defaults to 1 and controls the tuned power of + moves.
# These configurations are converted into independent BattlePokemon objects
# when each simulation begins.
PLAYER_TEAMS = [
    [("Electivire", "Thunder Shock", "Wild Charge", 40.5, 15, 15, 15),
     ("Luxray", "Spark", "Wild Charge", 43.0, 15, 13, 14),
     ("Torterra", "Razor Leaf", "Frenzy Plant", 40.0, 14, 15, 14),
     ("Venusaur", "Vine Whip", "Frenzy Plant", 45.0, 13, 14, 15),
     ("Zekrom", "Charge Beam", "Fusion Bolt", 25.0, 14, 12, 12),
     ("Venusaur", "Vine Whip", "Frenzy Plant", 43.0, 15, 15, 15)],
]

# Party Play groups use zero-based player indexes. Each group must contain
# 2-4 players. Omit players who are not in a Party Play group; they receive no
# Party Power. Example for one PP3 group plus one solo: [[0, 1, 2]].
PARTY_POWER_GROUPS = []

# Event boost observed in-game. Official sources did not publish the exact
# thresholds, so both tables are kept explicit rather than using a multiplier.
BOOSTED_PARTY_POWER = False
NORMAL_PARTY_POWER_THRESHOLDS = {2: 18, 3: 8, 4: 6}
BOOSTED_PARTY_POWER_THRESHOLDS = {2: 9, 3: 5, 4: 3}

FRIENDSHIP_MULTIPLIERS = [1.0]
ZACIAN_ADVENTURE_EFFECT = [False]
BEHEMOTH_BASH_ADVENTURE_EFFECT = [False]
DYNAMIC_PUNCH_ADVENTURE_EFFECT = [False]

# Valid values: None, Sunny/Clear, Rainy, Partly Cloudy, Cloudy, Windy,
# Snow, and Fog. Weather boosts matching player and boss moves by 1.2x.
WEATHER = None
SAME_TYPE_MEGA_ALLY_MULTIPLIER = 1.30
OTHER_TYPE_MEGA_ALLY_MULTIPLIER = 1.10
ZACIAN_MULTIPLIER = 1.10
BEHEMOTH_BASH_DEFENSE_MULTIPLIER = 1.10
DYNAMIC_PUNCH_ATTACK_MULTIPLIER = 1.15
DYNAMIC_PUNCH_RAID_DIFFICULTIES = frozenset({
    "Tier 4", "Mega", "Mega Legendary", "Super Mega",
})
WEATHER_MULTIPLIER = 1.20

# Boss species, types, move pools, and (normally) stats come from the adjacent
# calculator_data.json. Use its stable `form_id`, not the display name; this
# distinguishes forms such as normal Raichu from Alolan Raichu.
BOSS_FORM_ID = "KYOGRE"

# Leave this as None for an official boss whose stats and types should come
# directly from calculator_data.json. For a teased/unreleased boss, provide
# only the known overrides; its moves still come from BOSS_FORM_ID.
BOSS_MANUAL_PROFILE = None

# Empty tuples mean every move in the JSON move pool. Lists are useful for
# excluding legacy/unavailable moves or testing only an announced move pool.
BOSS_FAST_MOVE_NAMES = ()
BOSS_CHARGED_MOVE_NAMES = (
    "Hydro Pump", "Blizzard", "Thunder", "Surf", "Avalanche",
)

# Presentation-only aliases can merge mechanically equivalent moves without
# duplicating a simulation row. The key must be a selected JSON move name.
BOSS_MOVE_DISPLAY_NAMES = {}

# Applied independently by every active player. Valid strategies:
#   "none"              Never dodge.
#   "all_survivable"    Dodge every charged move unless dodged damage still KOs.
#   "super_effective"   Dodge survivable super-effective charged moves.
#   "non_resisted"      Dodge every charged move that is not resisted.
#   "lethal_only"       Dodge only when the full hit KOs and the dodged hit does not.
#   "downtime_saver"    Dodge a lethal charged move only when the 1s dodge and
#                       lost-energy replacement cost less than the switch/relobby.
DODGE_STRATEGY = "downtime_saver"
DODGE_STRATEGIES = (
    "none", "all_survivable", "super_effective", "non_resisted", "lethal_only",
    "downtime_saver",
)

# Player strategy is separate from dodging. With no strategy, the player never
# switches voluntarily: use fast moves until the charged move is ready, then
# use it immediately. Fainting still advances to the next attacker as normal.
# Hot-swap strategies predict the fast-move damage taken before the next charged
# move finishes. Greedy adds no reserve; cautious and very cautious additionally
# reserve 10% or 15% of the configured boss charged move's undodged damage.
PLAYER_STRATEGY = "no_strategy"
PLAYER_STRATEGIES = (
    "no_strategy",
    "hot_swap_greedy",
    "hot_swap_cautious",
    "hot_swap_very_cautious",
    "catch_tank",
)

# Detailed trials can omit the event stream, show only the beginning of each
# move, or retain every internal event for debugging.
BATTLE_LOG_MODE = "full"
BATTLE_LOG_MODES = ("none", "moves", "full")

HOT_SWAP_CHARGED_DAMAGE_RESERVES = {
    "hot_swap_greedy": 0.0,
    "hot_swap_cautious": 0.10,
    "hot_swap_very_cautious": 0.15,
}

# Zero-based team positions reserved as catch tanks for each player. A catch
# tank is never used in the ordinary battle order. When the boss announces a
# charged move, the next unused tank is timed to switch as late as possible.
# Expected energy from the hit is counted first; when that is insufficient,
# the tank is brought in early enough to use the extra fast moves it needs.
# It then takes the hit, throws one charged move, and is retired for the rest
# of the raid. Whether that choice is worthwhile or survivable is intentionally
# left to the player who configured the team.
CATCH_TANK_TEAM_INDICES = [[] for _team in PLAYER_TEAMS]

CALCULATOR_DATA_PATH = Path(__file__).resolve().with_name("calculator_data.json")


def apply_runtime_config_from_environment() -> None:
    """Apply an isolated JSON configuration supplied by the Discord bot.

    A subprocess is used for every Discord simulation, so changing these
    module-level settings cannot leak into another user's concurrent raid.
    """
    config_path = os.environ.get("RAID_SIM_CONFIG_PATH")
    if not config_path:
        return
    try:
        config = json.loads(Path(config_path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"Could not load raid runtime config: {error}") from error
    if not isinstance(config, dict):
        raise ValueError("Raid runtime config must be a JSON object")

    global TRIALS_PER_MOVESET, RANDOM_SEED
    global RAID_DIFFICULTY, RAID_RULES, RAID_SECONDS, BOSS_HP, BOSS_CPM
    global SUPER_MEGA_ENRAGE, ENRAGE_HP
    global PLAYER_TEAMS, PARTY_POWER_GROUPS, BOOSTED_PARTY_POWER
    global CATCH_TANK_TEAM_INDICES
    global FRIENDSHIP_MULTIPLIERS, ZACIAN_ADVENTURE_EFFECT
    global BEHEMOTH_BASH_ADVENTURE_EFFECT, DYNAMIC_PUNCH_ADVENTURE_EFFECT
    global WEATHER
    global BOSS_FORM_ID, BOSS_MANUAL_PROFILE
    global BOSS_FAST_MOVE_NAMES, BOSS_CHARGED_MOVE_NAMES
    global BOSS_MOVE_DISPLAY_NAMES, DODGE_STRATEGY, PLAYER_STRATEGY
    global BATTLE_LOG_MODE

    TRIALS_PER_MOVESET = int(config.get("trials", TRIALS_PER_MOVESET))
    RANDOM_SEED = int(config.get("random_seed", RANDOM_SEED))
    RAID_DIFFICULTY = str(config.get("raid_difficulty", RAID_DIFFICULTY))
    if RAID_DIFFICULTY not in RAID_DIFFICULTIES:
        raise ValueError(
            f"Unknown raid difficulty {RAID_DIFFICULTY!r}; "
            f"choose from {tuple(RAID_DIFFICULTIES)}"
        )
    RAID_RULES = RAID_DIFFICULTIES[RAID_DIFFICULTY]
    RAID_SECONDS = RAID_RULES["seconds"]
    BOSS_HP = RAID_RULES["hp"]
    BOSS_CPM = RAID_RULES["cpm"]
    SUPER_MEGA_ENRAGE = RAID_RULES.get("super_mega_enrage", False)
    ENRAGE_HP = floor(BOSS_HP * 0.80) if SUPER_MEGA_ENRAGE else -1

    PLAYER_TEAMS = config.get("player_teams", PLAYER_TEAMS)
    CATCH_TANK_TEAM_INDICES = config.get(
        "catch_tank_team_indices", CATCH_TANK_TEAM_INDICES
    )
    PARTY_POWER_GROUPS = config.get("party_power_groups", PARTY_POWER_GROUPS)
    BOOSTED_PARTY_POWER = bool(
        config.get("boosted_party_power", BOOSTED_PARTY_POWER)
    )
    FRIENDSHIP_MULTIPLIERS = config.get(
        "friendship_multipliers", FRIENDSHIP_MULTIPLIERS
    )
    ZACIAN_ADVENTURE_EFFECT = config.get(
        "zacian_adventure_effect", ZACIAN_ADVENTURE_EFFECT
    )
    BEHEMOTH_BASH_ADVENTURE_EFFECT = config.get(
        "behemoth_bash_adventure_effect", [False] * len(PLAYER_TEAMS)
    )
    DYNAMIC_PUNCH_ADVENTURE_EFFECT = config.get(
        "dynamic_punch_adventure_effect", [False] * len(PLAYER_TEAMS)
    )
    WEATHER = config.get("weather", WEATHER)

    BOSS_FORM_ID = str(config.get("boss_form_id", BOSS_FORM_ID))
    BOSS_MANUAL_PROFILE = config.get("boss_manual_profile", BOSS_MANUAL_PROFILE)
    BOSS_FAST_MOVE_NAMES = tuple(
        config.get("boss_fast_move_names", BOSS_FAST_MOVE_NAMES)
    )
    BOSS_CHARGED_MOVE_NAMES = tuple(
        config.get("boss_charged_move_names", BOSS_CHARGED_MOVE_NAMES)
    )
    BOSS_MOVE_DISPLAY_NAMES = dict(
        config.get("boss_move_display_names", BOSS_MOVE_DISPLAY_NAMES)
    )
    DODGE_STRATEGY = str(config.get("dodge_strategy", DODGE_STRATEGY))
    PLAYER_STRATEGY = str(config.get("player_strategy", PLAYER_STRATEGY))
    BATTLE_LOG_MODE = str(config.get("battle_log_mode", BATTLE_LOG_MODE))


apply_runtime_config_from_environment()

STAB = 1.2
SUPER_EFFECTIVE = 1.6
NOT_VERY_EFFECTIVE = 0.625
IMMUNITY_AS_DOUBLE_RESISTANCE = 0.390625

TYPES = (
    "Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting",
    "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost",
    "Dragon", "Dark", "Steel", "Fairy",
)
HIDDEN_POWER_TYPES = tuple(
    move_type for move_type in TYPES if move_type not in {"Normal", "Fairy"}
)

WEATHER_BOOSTED_TYPES = {
    None: frozenset(),
    "Sunny/Clear": frozenset({"Grass", "Fire", "Ground"}),
    "Rainy": frozenset({"Water", "Electric", "Bug"}),
    "Partly Cloudy": frozenset({"Normal", "Rock"}),
    "Cloudy": frozenset({"Fairy", "Fighting", "Poison"}),
    "Windy": frozenset({"Flying", "Dragon", "Psychic"}),
    "Snow": frozenset({"Ice", "Steel"}),
    "Fog": frozenset({"Dark", "Ghost"}),
}

# Pokémon GO combat-power multipliers, indexed by twice the Pokémon level.
# This supports every half-level from 1 through 55 without float-key issues.
CPM_BY_HALF_LEVEL = dict(zip(range(2, 111), (
    0.094, 0.135137432, 0.16639787, 0.192650919, 0.21573247,
    0.236572661, 0.25572005, 0.273530381, 0.29024988, 0.306057377,
    0.3210876, 0.335445036, 0.34921268, 0.362457751, 0.37523559,
    0.387592406, 0.39956728, 0.411193551, 0.42250001, 0.432926419,
    0.44310755, 0.453059958, 0.46279839, 0.472336083, 0.48168495,
    0.4908558, 0.49985844, 0.508701765, 0.51739395, 0.525942511,
    0.53435433, 0.542635767, 0.55079269, 0.558830576, 0.56675452,
    0.574569153, 0.58227891, 0.589887917, 0.59740001, 0.604818814,
    0.61215729, 0.619399365, 0.62656713, 0.633644533, 0.64065295,
    0.647576426, 0.65443563, 0.661214806, 0.667934, 0.674577537,
    0.68116492, 0.687680648, 0.69414365, 0.700538673, 0.70688421,
    0.713164996, 0.71939909, 0.725571552, 0.7317, 0.734741009,
    0.73776948, 0.740785574, 0.74378943, 0.746781211, 0.74976104,
    0.752729087, 0.75568551, 0.758630378, 0.76156384, 0.764486065,
    0.76739717, 0.770297266, 0.7731865, 0.776064962, 0.77893275,
    0.781790055, 0.78463697, 0.787473578, 0.79030001, 0.792803968,
    0.79530001, 0.797803921, 0.8003, 0.802803892, 0.8053,
    0.807803863, 0.81029999, 0.812803834, 0.81529999, 0.817803806,
    0.82029999, 0.822803778, 0.82529999, 0.82780375, 0.83029999,
    0.832803753, 0.83529999, 0.837803755, 0.84029999,
    0.842803697870388, 0.84529999, 0.847803676002882,
    0.85029999, 0.852803654391795, 0.85529999,
    0.857803633032642, 0.86029999, 0.862803611921044,
    0.86529999,
)))

# Main-series type relationships converted to Pokémon GO multipliers. An
# immunity is 0.390625 rather than zero. Unlisted matchups are neutral.
TYPE_RELATIONSHIPS = {
    "Normal": ({}, {"Rock", "Steel"}, {"Ghost"}),
    "Fire": ({"Grass", "Ice", "Bug", "Steel"}, {"Fire", "Water", "Rock", "Dragon"}, {}),
    "Water": ({"Fire", "Ground", "Rock"}, {"Water", "Grass", "Dragon"}, {}),
    "Electric": ({"Water", "Flying"}, {"Electric", "Grass", "Dragon"}, {"Ground"}),
    "Grass": ({"Water", "Ground", "Rock"}, {"Fire", "Grass", "Poison", "Flying", "Bug", "Dragon", "Steel"}, {}),
    "Ice": ({"Grass", "Ground", "Flying", "Dragon"}, {"Fire", "Water", "Ice", "Steel"}, {}),
    "Fighting": ({"Normal", "Ice", "Rock", "Dark", "Steel"}, {"Poison", "Flying", "Psychic", "Bug", "Fairy"}, {"Ghost"}),
    "Poison": ({"Grass", "Fairy"}, {"Poison", "Ground", "Rock", "Ghost"}, {"Steel"}),
    "Ground": ({"Fire", "Electric", "Poison", "Rock", "Steel"}, {"Grass", "Bug"}, {"Flying"}),
    "Flying": ({"Grass", "Fighting", "Bug"}, {"Electric", "Rock", "Steel"}, {}),
    "Psychic": ({"Fighting", "Poison"}, {"Psychic", "Steel"}, {"Dark"}),
    "Bug": ({"Grass", "Psychic", "Dark"}, {"Fire", "Fighting", "Poison", "Flying", "Ghost", "Steel", "Fairy"}, {}),
    "Rock": ({"Fire", "Ice", "Flying", "Bug"}, {"Fighting", "Ground", "Steel"}, {}),
    "Ghost": ({"Psychic", "Ghost"}, {"Dark"}, {"Normal"}),
    "Dragon": ({"Dragon"}, {"Steel"}, {"Fairy"}),
    "Dark": ({"Psychic", "Ghost"}, {"Fighting", "Dark", "Fairy"}, {}),
    "Steel": ({"Ice", "Rock", "Fairy"}, {"Fire", "Water", "Electric", "Steel"}, {}),
    "Fairy": ({"Fighting", "Dragon", "Dark"}, {"Fire", "Poison", "Steel"}, {}),
}


def type_effectiveness(move_type: str, defender_types: tuple[str, ...]) -> float:
    """Multiply the move's effectiveness against each defending type."""
    super_types, resisted_types, immune_types = TYPE_RELATIONSHIPS[move_type]
    result = 1.0
    for defender_type in defender_types:
        if defender_type in immune_types:
            result *= IMMUNITY_AS_DOUBLE_RESISTANCE
        elif defender_type in super_types:
            result *= SUPER_EFFECTIVE
        elif defender_type in resisted_types:
            result *= NOT_VERY_EFFECTIVE
    return result


@dataclass(frozen=True)
class Move:
    name: str
    power: int
    duration: float
    energy: int
    move_type: str
    dodge: bool = False
    plus_powers: tuple[int, int, int, int] | None = None


@dataclass(frozen=True)
class Species:
    name: str
    attack: int
    defense: int
    stamina: int
    types: tuple[str, ...]
    shadow: bool = False
    mega_boost_types: tuple[str, ...] = ()
    persistent_mega_boost: bool = False
    form_id: str | None = None


def load_calculator_data(path: Path) -> list[dict]:
    """Load and minimally validate the adjacent Pokémon/move data export."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise FileNotFoundError(
            f"Missing {path.name!r}. Place it in the same folder as "
            f"{Path(__file__).name!r}."
        ) from error
    except json.JSONDecodeError as error:
        raise ValueError(f"Could not parse {path}: {error}") from error
    if not isinstance(data, list):
        raise ValueError(f"Expected a list of Pokémon records in {path}")
    return data


def find_calculator_species(data: list[dict], form_id: str) -> dict:
    matches = [entry for entry in data if entry.get("form_id") == form_id]
    if len(matches) != 1:
        raise ValueError(
            f"BOSS_FORM_ID {form_id!r} matched {len(matches)} records in "
            f"{CALCULATOR_DATA_PATH.name}; expected exactly one"
        )
    return matches[0]


def move_from_calculator(entry: dict, *, dodge: bool = False) -> Move:
    """Convert one calculator-data move, normalizing charged energy to positive."""
    name = entry["name"]
    display_name = BOSS_MOVE_DISPLAY_NAMES.get(name, name)
    return Move(
        display_name,
        int(entry["power"]),
        int(entry["duration_ms"]) / 1000,
        abs(int(entry["energy"])),
        str(entry["type"]).title(),
        dodge=dodge,
    )


CALCULATOR_DATA = load_calculator_data(CALCULATOR_DATA_PATH)
BOSS_DATA = find_calculator_species(CALCULATOR_DATA, BOSS_FORM_ID)

_boss_stats = BOSS_DATA["stats"]
_manual = BOSS_MANUAL_PROFILE or {}
BOSS_NAME = str(_manual.get("name", BOSS_DATA["name"]))
BOSS_ATTACK_BASE = int(_manual.get("attack", _boss_stats["attack"]))
BOSS_DEFENSE_BASE = int(_manual.get("defense", _boss_stats["defense"]))
BOSS_TYPES = tuple(
    str(move_type).title()
    for move_type in _manual.get("types", BOSS_DATA["types"])
)
# Raid bosses use 15 Attack and Defense IVs in the damage formula.
BOSS_ATTACK = BOSS_ATTACK_BASE + 15
BOSS_DEFENSE = BOSS_DEFENSE_BASE + 15

MUD_SHOT = Move("Mud Shot", 4, 0.5, 6, "Ground")
PRECIPICE_BLADES = Move("Precipice Blades", 120, 1.5, 100, "Ground")
SANDSEAR_STORM = Move("Sandsear Storm", 150, 2.5, 100, "Ground")
EARTH_POWER = Move("Earth Power", 100, 3.5, 50, "Ground")
EARTHQUAKE = Move("Earthquake", 140, 3.5, 100, "Ground")
DRAGON_TAIL = Move("Dragon Tail", 14, 1.0, 8, "Dragon")
DYNAMAX_CANNON = Move("Dynamax Cannon", 215, 1.5, 100, "Dragon")

# Additional Mega Charged Attacks. These are stored once, with explicit integer
# power at each Mega Level. Keeping the four tuned values avoids fractional
# assumptions: observed Outrage+ is 204 at Mega Level 2, not 203.5, and 240 at
# Mega Level 4 (185 base power plus the in-game displayed +55 bonus).
ACID_SPRAY_PLUS = Move(
    "Acid Spray+", 160, 3.0, 100, "Poison",
    plus_powers=(160, 176, 192, 208),
)
LIQUIDATION_PLUS = Move(
    "Liquidation+", 180, 3.0, 100, "Water",
    plus_powers=(180, 198, 216, 234),
)
OUTRAGE_PLUS = Move(
    "Outrage+", 185, 4.0, 100, "Dragon",
    plus_powers=(185, 204, 222, 240),
)
DRILL_PECK_PLUS = Move(
    "Drill Peck+", 170, 2.5, 100, "Flying",
    plus_powers=(170, 187, 204, 221),
)
SEED_BOMB_PLUS = Move(
    "Seed Bomb+", 150, 2.0, 100, "Grass",
    plus_powers=(150, 165, 180, 195),
)
MYSTICAL_FIRE_PLUS = Move(
    "Mystical Fire+", 140, 2.0, 100, "Fire",
    plus_powers=(140, 154, 168, 182),
)
SURF_PLUS = Move(
    "Surf+", 130, 1.5, 100, "Water",
    plus_powers=(130, 143, 156, 169),
)
PSYBEAM_PLUS = Move(
    "Psybeam+", 170, 3.0, 100, "Psychic",
    plus_powers=(170, 187, 203, 221),
)
BRICK_BREAK_PLUS = Move(
    "Brick Break+", 150, 1.5, 100, "Fighting",
    plus_powers=(150, 165, 180, 195),
)
VOLT_TACKLE_PLUS = Move(
    "Volt Tackle+", 170, 3.5, 100, "Electric",
    plus_powers=(170, 187, 204, 221),
)
DYNAMIC_PUNCH_PLUS = Move(
    "Dynamic Punch+", 130, 2.5, 100, "Fighting",
    plus_powers=(130, 143, 156, 169),
)
ZAP_CANNON_PLUS = Move(
    "Zap Cannon+", 160, 3.5, 100, "Electric",
    plus_powers=(160, 176, 192, 208),
)
FUTURE_SIGHT_PLUS = Move(
    "Future Sight+", 140, 2.5, 100, "Psychic",
    plus_powers=(140, 154, 168, 182),
)

PLUS_MOVE_FORM_IDS = {
    "Acid Spray+": "VICTREEBEL_MEGA",
    "Liquidation+": "STARMIE_MEGA",
    "Outrage+": "DRAGONITE_MEGA",
    "Drill Peck+": "SKARMORY_MEGA",
    "Seed Bomb+": "CHESNAUGHT_MEGA",
    "Mystical Fire+": "DELPHOX_MEGA",
    "Surf+": "GRENINJA_MEGA",
    "Psybeam+": "MALAMAR_MEGA",
    "Brick Break+": "FALINKS_MEGA",
    "Volt Tackle+": "RAICHU_MEGA_X",
    "Dynamic Punch+": "MEWTWO_MEGA_X",
    "Zap Cannon+": "RAICHU_MEGA_Y",
    "Future Sight+": "MEWTWO_MEGA_Y",
}

MOVES = {
    move.name: move for move in (
        MUD_SHOT, PRECIPICE_BLADES, SANDSEAR_STORM, EARTH_POWER, EARTHQUAKE,
        DRAGON_TAIL, DYNAMAX_CANNON,
        ACID_SPRAY_PLUS, LIQUIDATION_PLUS, OUTRAGE_PLUS, DRILL_PECK_PLUS,
        SEED_BOMB_PLUS, MYSTICAL_FIRE_PLUS, SURF_PLUS, PSYBEAM_PLUS,
        BRICK_BREAK_PLUS, VOLT_TACKLE_PLUS, DYNAMIC_PUNCH_PLUS,
        ZAP_CANNON_PLUS, FUTURE_SIGHT_PLUS,
    )
}

SPECIES = {
    "Groudon": Species(
        "Groudon", 270, 228, 205, ("Ground",),
    ),
    "Shadow Groudon": Species(
        "Shadow Groudon", 270, 228, 205, ("Ground",), shadow=True,
    ),
    "Primal Groudon": Species(
        "Primal Groudon", 353, 268, 218, ("Ground", "Fire"),
        mega_boost_types=("Fire", "Ground", "Grass"),
        persistent_mega_boost=True,
    ),
    "Landorus Therian": Species(
        "Landorus Therian", 289, 179, 205, ("Ground", "Flying"),
    ),
    "Mega Garchomp": Species(
        "Mega Garchomp", 339, 222, 239, ("Dragon", "Ground"),
        mega_boost_types=("Dragon", "Ground"),
    ),
    "Eternatus": Species(
        "Eternatus", 278, 192, 268, ("Poison", "Dragon"),
    ),
}


def register_player_form(
    form_id: str,
    *,
    mega_boost: bool = False,
    shadow: bool = False,
    mega_boost_types: tuple[str, ...] | None = None,
    persistent_mega_boost: bool = False,
) -> None:
    """Add one calculator-data form and all of its moves to player catalogs."""
    entry = find_calculator_species(CALCULATOR_DATA, form_id)
    name = entry["name"]
    stats = entry["stats"]
    types = tuple(str(move_type).title() for move_type in entry["types"])
    SPECIES[name] = Species(
        name,
        int(stats["attack"]),
        int(stats["defense"]),
        int(stats["stamina"]),
        types,
        shadow=shadow,
        mega_boost_types=(
            mega_boost_types if mega_boost_types is not None
            else types if mega_boost else ()
        ),
        persistent_mega_boost=persistent_mega_boost,
        form_id=form_id,
    )
    register_player_moves(entry)


def register_player_moves(entry: dict, *, preserve_existing: bool = False) -> None:
    """Register ordinary, Elite/legacy, and true-exclusive player moves."""
    move_data_pool = (
        *entry.get("fast_moves", ()),
        *entry.get("charged_moves", ()),
        *entry.get("exclusive_fast_moves", ()),
        *entry.get("exclusive_charged_moves", ()),
    )
    for move_data in move_data_pool:
        move = move_from_calculator(move_data)
        existing = MOVES.get(move.name)
        if existing is not None and existing != move:
            if preserve_existing:
                continue
            raise ValueError(
                f"Conflicting calculator data for player move {move.name!r}: "
                f"{existing} versus {move}"
            )
        MOVES[move.name] = move


register_player_form("ELECTIVIRE")
register_player_form("LUXRAY")
register_player_form("TORTERRA")
register_player_form("VENUSAUR")
register_player_form("ZEKROM")
register_player_form("GARDEVOIR_MEGA", mega_boost=True)
register_player_form("ZACIAN_CROWNED_SWORD")


def register_new_mega_form(
    form_id: str,
    name: str,
    base_form_id: str,
    stats: tuple[int, int, int],
    types: tuple[str, ...],
) -> None:
    """Register a new Mega that is absent from the older calculator export.

    Its ordinary moves come from the base species. Once calculator_data.json
    contains the Mega form itself, that authoritative record is used instead.
    """
    matches = [entry for entry in CALCULATOR_DATA if entry.get("form_id") == form_id]
    if len(matches) == 1:
        register_player_form(form_id, mega_boost=True)
        SPECIES[form_id] = SPECIES[matches[0]["name"]]
        return
    if matches:
        raise ValueError(f"Duplicate calculator records for {form_id!r}")

    base_entry = find_calculator_species(CALCULATOR_DATA, base_form_id)
    attack, defense, stamina = stats
    species = Species(
        name,
        attack,
        defense,
        stamina,
        types,
        mega_boost_types=types,
        form_id=form_id,
    )
    SPECIES[name] = species
    SPECIES[form_id] = species
    register_player_moves(base_entry)


# These four Megas postdate the calculator export bundled with this checkpoint.
# Their stats and typings come from the current Game Master; their base species
# entries already contain their ordinary and legacy moves.
register_new_mega_form(
    "STARMIE_MEGA", "Mega Starmie", "STARMIE",
    (276, 229, 155), ("Water", "Psychic"),
)
register_new_mega_form(
    "CHESNAUGHT_MEGA", "Mega Chesnaught", "CHESNAUGHT",
    (242, 282, 204), ("Grass", "Fighting"),
)
register_new_mega_form(
    "DELPHOX_MEGA", "Mega Delphox", "DELPHOX",
    (331, 235, 181), ("Fire", "Psychic"),
)
register_new_mega_form(
    "GRENINJA_MEGA", "Mega Greninja", "GRENINJA",
    (299, 180, 176), ("Water", "Dark"),
)


def register_configured_player_forms() -> None:
    """Load any configured attacker that is not already in the catalog.

    This lets PLAYER_TEAMS use calculator-data display names directly instead
    of requiring a new hard-coded register_player_form call for every species.
    """
    weather_trio_boosts = {
        "GROUDON_PRIMAL": ("Fire", "Ground", "Grass"),
        "KYOGRE_PRIMAL": ("Water", "Electric", "Bug"),
        "RAYQUAZA_MEGA": ("Dragon", "Flying", "Psychic"),
    }
    for team in PLAYER_TEAMS:
        for setup in team:
            if not isinstance(setup, (tuple, list)) or not setup:
                continue
            configured_name = setup[0]

            def normalized(value: object) -> str:
                return "".join(
                    character for character in str(value).casefold()
                    if character.isalnum()
                )

            wanted = normalized(configured_name)

            matches = [
                entry for entry in CALCULATOR_DATA
                if wanted in {
                    normalized(entry.get("name", "")),
                    normalized(entry.get("form_id", "")),
                }
            ]
            if len(matches) != 1:
                # validate_settings reports the usual unknown-species error;
                # it is clearer than guessing among ambiguous display names.
                continue
            entry = matches[0]
            form_id = str(entry["form_id"])
            if configured_name in SPECIES:
                # A manual Species entry may intentionally override stats or
                # typing, but its JSON moves still need to be made available.
                register_player_moves(entry, preserve_existing=True)
                continue
            persistent_types = weather_trio_boosts.get(form_id)
            is_ordinary_mega = "MEGA" in form_id.split("_") and persistent_types is None
            is_shadow = "SHADOW" in form_id.split("_")
            register_player_form(
                form_id,
                mega_boost=is_ordinary_mega,
                shadow=is_shadow,
                mega_boost_types=persistent_types,
                persistent_mega_boost=persistent_types is not None,
            )
            # Permit the stable form_id as a PLAYER_TEAMS key as well as the
            # calculator's display name.
            if configured_name != entry["name"]:
                SPECIES[configured_name] = SPECIES[entry["name"]]


register_configured_player_forms()


@dataclass
class BattlePokemon:
    """One configured Pokémon and its mutable state in a single raid trial."""

    species: Species
    fast_move: Move
    charged_move: Move
    level: float
    attack_iv: int = 15
    defense_iv: int = 15
    stamina_iv: int = 15
    shadow: bool = False
    mega_level: int = 1
    hp: int = 0
    energy: int = 0

    def __post_init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.hp = self.max_hp
        self.energy = 0

    @property
    def cpm(self) -> float:
        return CPM_BY_HALF_LEVEL[round(self.level * 2)]

    @property
    def effective_attack(self) -> float:
        return (self.species.attack + self.attack_iv) * self.cpm

    @property
    def effective_defense(self) -> float:
        return (self.species.defense + self.defense_iv) * self.cpm

    @property
    def max_hp(self) -> int:
        return floor((self.species.stamina + self.stamina_iv) * self.cpm)

    @property
    def is_shadow(self) -> bool:
        """Whether this individual or its catalog species is Shadow."""
        return self.shadow or self.species.shadow


def unpack_player_setup(
    setup: tuple | list,
) -> tuple[str, str, str, float, int, int, int, bool, int]:
    """Normalize legacy setups and the IV/Shadow/Mega-Level format."""
    if len(setup) == 4:
        species, fast, charged, level = setup
        return species, fast, charged, level, 15, 15, 15, False, 1
    if len(setup) == 7:
        species, fast, charged, level, attack_iv, defense_iv, stamina_iv = setup
        return (
            species, fast, charged, level,
            attack_iv, defense_iv, stamina_iv, False, 1,
        )
    if len(setup) == 8:
        (
            species, fast, charged, level,
            attack_iv, defense_iv, stamina_iv, shadow,
        ) = setup
        mega_level = 1
    else:
        (
            species, fast, charged, level,
            attack_iv, defense_iv, stamina_iv, shadow, mega_level,
        ) = setup
    return (
        species, fast, charged, level,
        attack_iv, defense_iv, stamina_iv, shadow, mega_level,
    )


def effective_player_move_power(move: Move, pokemon: BattlePokemon) -> int:
    """Return the move's exact integer power at this Pokémon's Mega Level."""
    if move.plus_powers is None:
        return move.power
    return move.plus_powers[pokemon.mega_level - 1]


def displayed_player_move_name(move: Move, pokemon: BattlePokemon) -> str:
    """Render + through ++++ without creating four separate move objects."""
    if move.plus_powers is None:
        return move.name
    return move.name.rstrip("+") + "+" * pokemon.mega_level

def select_boss_moves(pool_key: str, selected_names: tuple[str, ...]) -> dict[str, Move]:
    """Select only ordinary boss moves, retaining calculator-data order.

    Elite/legacy moves and true-exclusive player moves are intentionally not
    boss moves. The latter are stored outside this base pool entirely.
    """
    pool = [move for move in BOSS_DATA[pool_key] if not move.get("elite", False)]
    available = {entry["name"] for entry in pool}
    wanted = set(selected_names) if selected_names else available
    unknown = wanted - available
    if unknown:
        raise ValueError(
            f"Unknown {BOSS_NAME} moves in {pool_key}: {sorted(unknown)}; "
            f"available: {sorted(available)}"
        )
    result: dict[str, Move] = {}
    for entry in pool:
        if entry["name"] not in wanted:
            continue
        move = move_from_calculator(entry)
        if move.name in result:
            raise ValueError(
                f"Boss move display name {move.name!r} is duplicated; adjust "
                "BOSS_MOVE_DISPLAY_NAMES or BOSS_*_MOVE_NAMES"
            )
        result[move.name] = move
    return result


BOSS_FAST_MOVES = select_boss_moves("fast_moves", BOSS_FAST_MOVE_NAMES)
BOSS_CHARGED_MOVES = select_boss_moves(
    "charged_moves", BOSS_CHARGED_MOVE_NAMES
)


def pokemon_go_damage(power: int, attack: float, defense: float, modifier: float) -> int:
    return floor(0.5 * power * attack / defense * modifier) + 1


def boss_type_modifier(move: Move, species: Species) -> float:
    stab = STAB if move.move_type in BOSS_TYPES else 1.0
    return stab * type_effectiveness(move.move_type, species.types)


def weather_move_multiplier(move_type: str) -> float:
    return (
        WEATHER_MULTIPLIER
        if move_type in WEATHER_BOOSTED_TYPES[WEATHER]
        else 1.0
    )


@dataclass(frozen=True)
class DodgeProfile:
    """Precomputed charged-move dodge facts for one configured team slot."""

    full_damage: int
    dodged_damage: int
    is_super_effective: bool
    is_resisted: bool
    downtime_saver_is_worthwhile: bool


def incoming_damage_for_pokemon(
    move: Move,
    pokemon: BattlePokemon,
    *,
    enraged: bool,
    dodged: bool,
    defense_multiplier: float = 1.0,
) -> int:
    """Calculate boss damage without requiring mutable Simulation state."""
    species = pokemon.species
    modifier = boss_type_modifier(move, species) * weather_move_multiplier(move.move_type)
    if enraged:
        modifier *= ENRAGE_ATTACK_MULTIPLIER
    if pokemon.is_shadow:
        modifier *= 1.2
    damage = pokemon_go_damage(
        move.power,
        BOSS_ATTACK * BOSS_CPM,
        pokemon.effective_defense * defense_multiplier,
        modifier,
    )
    return max(1, floor(damage * DODGED_DAMAGE_FRACTION)) if dodged else damage


def precompute_dodge_profiles(
    boss_charged: Move,
) -> dict[tuple[int, int, bool], DodgeProfile]:
    """Build the shared lookup table once for an aggregate moveset run."""
    profiles: dict[tuple[int, int, bool], DodgeProfile] = {}
    enrage_states = (False, True) if SUPER_MEGA_ENRAGE else (False,)
    for player_id, team in enumerate(PLAYER_TEAMS):
        for pokemon_index, setup in enumerate(team):
            (
                species, fast, charged, level,
                attack_iv, defense_iv, stamina_iv, shadow, mega_level,
            ) = (
                unpack_player_setup(setup)
            )
            pokemon = BattlePokemon(
                SPECIES[species], MOVES[fast], MOVES[charged], level,
                attack_iv, defense_iv, stamina_iv, shadow, mega_level,
            )
            has_next = pokemon_index + 1 < len(team)
            forced_transition_time = SWITCH_SECONDS if has_next else mean(REJOIN_TIMES)
            for enraged in enrage_states:
                full_damage = incoming_damage_for_pokemon(
                    boss_charged, pokemon, enraged=enraged, dodged=False,
                    defense_multiplier=(
                        BEHEMOTH_BASH_DEFENSE_MULTIPLIER
                        if BEHEMOTH_BASH_ADVENTURE_EFFECT[player_id] else 1.0
                    ),
                )
                dodged_damage = incoming_damage_for_pokemon(
                    boss_charged, pokemon, enraged=enraged, dodged=True,
                    defense_multiplier=(
                        BEHEMOTH_BASH_DEFENSE_MULTIPLIER
                        if BEHEMOTH_BASH_ADVENTURE_EFFECT[player_id] else 1.0
                    ),
                )
                energy_recovery_time = 0.0
                if PLAYER_ENERGY_FROM_DAMAGE:
                    energy_not_received = max(
                        0, floor(full_damage / 2) - floor(dodged_damage / 2)
                    )
                    energy_recovery_time = (
                        energy_not_received
                        * pokemon.fast_move.duration
                        / max(1, pokemon.fast_move.energy)
                    )
                profiles[(player_id, pokemon_index, enraged)] = DodgeProfile(
                    full_damage=full_damage,
                    dodged_damage=dodged_damage,
                    is_super_effective=(
                        type_effectiveness(
                            boss_charged.move_type, pokemon.species.types
                        ) > 1.0
                    ),
                    is_resisted=(
                        type_effectiveness(
                            boss_charged.move_type, pokemon.species.types
                        ) < 1.0
                    ),
                    downtime_saver_is_worthwhile=(
                        forced_transition_time
                        > DODGE_SECONDS + energy_recovery_time
                    ),
                )
    return profiles


@dataclass
class Player:
    team: list[BattlePokemon]
    pokemon_index: int = 0
    on_field: bool = True
    token: int = 0
    generation: int = 0
    next_action_time: float = 0.0
    action_start: float = 0.0
    action_end: float = 0.0
    action_is_charged: bool = False
    switches: int = 0
    faints: int = 0
    tactical_switches: int = 0
    rejoins: int = 0
    party_power_threshold: int = 0
    party_power_progress: int = 0
    party_power_active: bool = False
    damage_dealt: int = 0
    damage_taken: int = 0
    fast_moves_used: int = 0
    charged_moves_used: int = 0
    powered_charged_moves: int = 0
    successful_dodges: int = 0
    catch_tank_indices: tuple[int, ...] = ()
    used_catch_tanks: set[int] = field(default_factory=set)
    catch_tank_active: bool = False
    catch_return_index: int | None = None
    catch_tanks_used: int = 0
    saved_energy_indices: set[int] = field(default_factory=set)
    saved_energy_return_after: dict[int, float] = field(default_factory=dict)
    committed_saved_energy_index: int | None = None
    energy_save_guard_until: float = 0.0

    @property
    def pokemon(self) -> BattlePokemon:
        return self.team[self.pokemon_index]

    @property
    def species(self) -> Species:
        return self.pokemon.species

    @property
    def hp(self) -> int:
        return self.pokemon.hp

    @hp.setter
    def hp(self, value: int) -> None:
        self.pokemon.hp = value

    @property
    def energy(self) -> int:
        return self.pokemon.energy

    @energy.setter
    def energy(self, value: int) -> None:
        self.pokemon.energy = value

    @property
    def has_next(self) -> bool:
        return self.pokemon_index + 1 < len(self.team)


@dataclass
class TrialResult:
    won: bool
    finish_time: float
    boss_hp: int
    switches: int
    faints: int
    tactical_switches: int
    rejoins: int
    catch_tanks_used: int


@dataclass
class Simulation:
    boss_fast: Move
    boss_charged: Move
    rng: random.Random
    dodge_profiles: dict[tuple[int, int, bool], DodgeProfile] | None = None
    boss_hp: int = BOSS_HP
    boss_energy: float = 0.0
    enraged: bool = False
    players: list[Player] = field(default_factory=list)
    events: list[tuple] = field(default_factory=list)
    sequence: int = 0
    detailed: bool = False
    event_log: list[str] = field(default_factory=list)
    replay_actions: list[tuple[int, int, str, int | None, str, object]] = field(
        default_factory=list
    )
    replay_sequence: int = 0

    def __post_init__(self) -> None:
        # A raid boss's Hidden Power is rolled once when the attempt starts.
        # The replacement belongs only to this Simulation, so the type stays
        # fixed during the attempt and rerolls for the next Simulation.
        if self.boss_fast.name == "Hidden Power":
            self.boss_fast = replace(
                self.boss_fast,
                move_type=self.rng.choice(HIDDEN_POWER_TYPES),
            )
        if self.dodge_profiles is None:
            self.dodge_profiles = precompute_dodge_profiles(
                self.boss_charged
            )
        self.players = [
            Player([
                BattlePokemon(
                    SPECIES[species], MOVES[fast], MOVES[charged], level,
                    attack_iv, defense_iv, stamina_iv, shadow, mega_level,
                )
                for (
                    species, fast, charged, level,
                    attack_iv, defense_iv, stamina_iv, shadow, mega_level,
                )
                in map(unpack_player_setup, team)
            ])
            for team in PLAYER_TEAMS
        ]
        for player_id, player in enumerate(self.players):
            player.catch_tank_indices = tuple(
                CATCH_TANK_TEAM_INDICES[player_id]
            ) if PLAYER_STRATEGY == "catch_tank" else ()
            player.pokemon_index = self.first_normal_index(player)
        thresholds = (
            BOOSTED_PARTY_POWER_THRESHOLDS
            if BOOSTED_PARTY_POWER
            else NORMAL_PARTY_POWER_THRESHOLDS
        )
        for group in PARTY_POWER_GROUPS:
            threshold = thresholds[len(group)]
            for player_id in group:
                self.players[player_id].party_power_threshold = threshold

    def push(self, time: float, kind: str, data: tuple = ()) -> None:
        self.sequence += 1
        heappush(self.events, (time, self.sequence, kind, data))

    def log(
        self, time: float, message: str, category: str = "event",
    ) -> None:
        if self.detailed and (
            BATTLE_LOG_MODE == "full"
            or (BATTLE_LOG_MODE == "moves" and category == "move_start")
        ):
            self.event_log.append(f"{time:7.2f}s  {message}")

    def record_replay_action(
        self,
        time: float,
        actor_kind: str,
        actor_id: int | None,
        action_kind: str,
        value: object = None,
    ) -> None:
        """Record one observable action using exact half-second game ticks."""
        if not self.detailed:
            return
        tick = round(time * 2)
        if abs(time - tick / 2) > 1e-9:
            raise ValueError(
                f"Replay action at {time}s does not land on a 0.5-second tick"
            )
        self.replay_sequence += 1
        self.replay_actions.append(
            (tick, self.replay_sequence, actor_kind, actor_id, action_kind, value)
        )

    def schedule_player(self, player_id: int, time: float) -> None:
        player = self.players[player_id]
        player.token += 1
        player.next_action_time = time
        self.push(time, "player_ready", (player_id, player.token))

    def outgoing_damage(self, move: Move, player_id: int, party_power: bool = False) -> int:
        player = self.players[player_id]
        pokemon = player.pokemon
        species = player.species
        defense = BOSS_DEFENSE * BOSS_CPM * (4 if self.enraged else 1)
        modifier = type_effectiveness(move.move_type, BOSS_TYPES)
        if move.move_type in species.types:
            modifier *= STAB
        modifier *= FRIENDSHIP_MULTIPLIERS[player_id]
        if pokemon.is_shadow:
            modifier *= 1.2
        modifier *= self.mega_ally_multiplier(move.move_type, player_id)
        if ZACIAN_ADVENTURE_EFFECT[player_id]:
            modifier *= ZACIAN_MULTIPLIER
        if (
            DYNAMIC_PUNCH_ADVENTURE_EFFECT[player_id]
            and RAID_DIFFICULTY in DYNAMIC_PUNCH_RAID_DIFFICULTIES
            and "_MEGA" in BOSS_FORM_ID.upper()
            and "_PRIMAL" not in BOSS_FORM_ID.upper()
        ):
            modifier *= DYNAMIC_PUNCH_ATTACK_MULTIPLIER
        modifier *= weather_move_multiplier(move.move_type)
        if party_power:
            modifier *= 2.0
        return pokemon_go_damage(
            effective_player_move_power(move, pokemon),
            pokemon.effective_attack,
            defense,
            modifier,
        )

    def mega_ally_multiplier(self, move_type: str, player_id: int) -> float:
        """Return the strongest automatic Mega/Primal boost from an ally."""
        boost_types: list[tuple[str, ...]] = []
        for other_id, other in enumerate(self.players):
            if other_id == player_id:
                continue

            # Primal Groudon, Primal Kyogre, and Mega Rayquaza remain active
            # while present anywhere in the registered team, even after fainting.
            boost_types.extend(
                member.species.mega_boost_types
                for member in other.team
                if member.species.persistent_mega_boost
            )

            # Ordinary Mega boosts require that Mega to be alive and on field.
            if (
                other.on_field
                and other.hp > 0
                and other.species.mega_boost_types
                and not other.species.persistent_mega_boost
            ):
                boost_types.append(other.species.mega_boost_types)

        if any(move_type in types for types in boost_types):
            return SAME_TYPE_MEGA_ALLY_MULTIPLIER
        if boost_types:
            return OTHER_TYPE_MEGA_ALLY_MULTIPLIER
        return 1.0

    @staticmethod
    def player_defense_multiplier(player_id: int) -> float:
        return (
            BEHEMOTH_BASH_DEFENSE_MULTIPLIER
            if BEHEMOTH_BASH_ADVENTURE_EFFECT[player_id] else 1.0
        )

    def incoming_damage(
        self, move: Move, player_id: int, player: Player, dodged: bool,
    ) -> int:
        return incoming_damage_for_pokemon(
            move, player.pokemon, enraged=self.enraged, dodged=dodged,
            defense_multiplier=self.player_defense_multiplier(player_id),
        )

    def should_dodge_charged(self, player_id: int, player: Player) -> bool:
        """Apply the configured dodge policy to one player and charged move."""
        if DODGE_STRATEGY == "none":
            return False

        assert self.dodge_profiles is not None
        profile = self.dodge_profiles[
            (player_id, player.pokemon_index, self.enraged)
        ]

        # This policy is deliberately type-only: unlike the survivability
        # policies, it attempts every charged move that the active Pokémon
        # does not resist.
        if DODGE_STRATEGY == "non_resisted":
            return not profile.is_resisted

        # Spending a second cannot help when the quarter-damage hit still KOs.
        if profile.dodged_damage >= player.hp:
            return False
        if DODGE_STRATEGY == "all_survivable":
            return True
        if DODGE_STRATEGY == "super_effective":
            return profile.is_super_effective
        if DODGE_STRATEGY == "lethal_only":
            return profile.full_damage >= player.hp

        # "downtime_saver": nonlethal hits cause no immediate transition
        # downtime, so taking them is preferable to spending one second dodging.
        # The transition-versus-energy comparison is already in the profile.
        if profile.full_damage < player.hp:
            return False
        return profile.downtime_saver_is_worthwhile

    def predicted_fast_hits_before_charge(
        self, pokemon: BattlePokemon, energy: int,
    ) -> int:
        fasts = max(0, ceil(
            (pokemon.charged_move.energy - energy) / pokemon.fast_move.energy
        ))
        time_to_charge = fasts * pokemon.fast_move.duration + pokemon.charged_move.duration
        first_hit = self.boss_fast.duration
        interval = self.boss_fast.duration + FAST_MOVE_DELAY
        if time_to_charge < first_hit:
            return 0
        return 1 + floor((time_to_charge - first_hit) / interval)

    def should_retreat(self, player_id: int, player: Player) -> bool:
        hits = self.predicted_fast_hits_before_charge(player.pokemon, player.energy)
        predicted = hits * self.incoming_damage(
            self.boss_fast, player_id, player, dodged=False,
        )
        reserve_fraction = HOT_SWAP_CHARGED_DAMAGE_RESERVES[PLAYER_STRATEGY]
        profile = self.dodge_profiles[
            (player_id, player.pokemon_index, self.enraged)
        ]
        charged_damage_reserve = ceil(profile.full_damage * reserve_fraction)
        return predicted + charged_damage_reserve >= player.hp

    @staticmethod
    def first_normal_index(player: Player) -> int:
        return next(
            index
            for index in range(len(player.team))
            if index not in player.catch_tank_indices
        )

    @staticmethod
    def normal_indices_after(player: Player) -> tuple[int, ...]:
        """Return later normal-team slots in ordinary party order."""
        return tuple(
            index
            for index in range(player.pokemon_index + 1, len(player.team))
            if index not in player.catch_tank_indices
        )

    @staticmethod
    def normal_indices_in_rotation(player: Player) -> tuple[int, ...]:
        """Return every other normal slot, wrapping once from the active slot."""
        return tuple(
            index
            for index in (
                *range(player.pokemon_index + 1, len(player.team)),
                *range(0, player.pokemon_index),
            )
            if index not in player.catch_tank_indices
        )

    def next_normal_index(
        self, player: Player, *, include_saved: bool = False,
    ) -> int | None:
        return next(
            (
                index for index in self.normal_indices_after(player)
                if player.team[index].hp > 0
                and (include_saved or index not in player.saved_energy_indices)
            ),
            None,
        )

    def best_saved_energy_index(
        self, player_id: int, player: Player, time: float,
    ) -> int | None:
        """Choose a saved attacker that can now reach and land its charge."""
        candidates = []
        for index in player.saved_energy_indices:
            pokemon = player.team[index]
            if (
                index == player.pokemon_index
                or pokemon.hp <= 0
                or player.saved_energy_return_after.get(index, 0.0) > time
            ):
                continue
            hits = self.predicted_fast_hits_before_charge(pokemon, pokemon.energy)
            fast_damage = incoming_damage_for_pokemon(
                self.boss_fast, pokemon, enraged=self.enraged, dodged=False,
                defense_multiplier=self.player_defense_multiplier(player_id),
            )
            if hits * fast_damage >= pokemon.hp:
                continue
            # Prefer an immediately ready charge, then the fullest meter.
            candidates.append((
                pokemon.energy >= pokemon.charged_move.energy,
                pokemon.energy / pokemon.charged_move.energy,
                -hits,
                -index,
                index,
            ))
        return max(candidates)[-1] if candidates else None

    def replacement_for_announced_charge(
        self, player_id: int, player: Player, boss_move: Move,
    ) -> int | None:
        """Prefer the next unused attacker that survives the announced hit."""
        candidates = [
            index for index in self.normal_indices_in_rotation(player)
            if player.team[index].hp > 0
            and index not in player.saved_energy_indices
        ]
        if not candidates:
            return None
        return next(
            (
                index for index in candidates
                if incoming_damage_for_pokemon(
                    boss_move, player.team[index],
                    enraged=self.enraged, dodged=False,
                    defense_multiplier=self.player_defense_multiplier(player_id),
                ) < player.team[index].hp
            ),
            candidates[0],
        )

    def announced_charge_prevents_next_charge(
        self,
        player_id: int,
        player: Player,
        hit_time: float,
        damage: int,
        boss_move: Move,
    ) -> bool:
        """Whether taking an announced hit stops this attacker spending its meter."""
        if PLAYER_STRATEGY not in HOT_SWAP_CHARGED_DAMAGE_RESERVES:
            return False
        if player.energy <= 0:
            return False
        # A charged move already in flight and landing first has spent the energy.
        if (
            player.action_is_charged
            and player.action_start <= self.current_time
            and player.action_end <= hit_time
        ):
            return False
        if self.replacement_for_announced_charge(
            player_id, player, boss_move,
        ) is None:
            return False

        hp_after_hit = player.hp - damage
        if hp_after_hit <= 0:
            return True
        energy_after_hit = player.energy
        if PLAYER_ENERGY_FROM_DAMAGE:
            energy_after_hit = min(100, energy_after_hit + floor(damage / 2))
        hits = self.predicted_fast_hits_before_charge(player.pokemon, energy_after_hit)
        predicted_fast_damage = hits * self.incoming_damage(
            self.boss_fast, player_id, player, dodged=False,
        )
        return predicted_fast_damage >= hp_after_hit

    @staticmethod
    def next_unused_catch_tank_index(player: Player) -> int | None:
        return next(
            (
                index for index in player.catch_tank_indices
                if index not in player.used_catch_tanks
            ),
            None,
        )

    def save_energy_for_announced_charge(
        self,
        time: float,
        hit_time: float,
        player_id: int,
        boss_move: Move,
    ) -> bool:
        """Move a threatened attacker off field while preserving its meter."""
        player = self.players[player_id]
        replacement_index = self.replacement_for_announced_charge(
            player_id, player, boss_move,
        )
        if replacement_index is None:
            return False

        departing_index = player.pokemon_index
        departing = player.species.name
        saved_energy = player.energy
        player.saved_energy_indices.add(departing_index)
        player.saved_energy_return_after[departing_index] = hit_time
        player.committed_saved_energy_index = None
        player.energy_save_guard_until = max(
            player.energy_save_guard_until, hit_time,
        )
        player.token += 1
        player.generation += 1
        player.action_is_charged = False
        player.action_start = time
        player.action_end = time
        player.pokemon_index = replacement_index
        player.switches += 1
        player.tactical_switches += 1
        self.record_replay_action(
            time, "player", player_id, "switch", replacement_index + 1
        )
        self.log(
            time,
            f"P{player_id + 1} {departing}: incoming {boss_move.name} would "
            f"prevent its next charged move; marked has energy left "
            f"({saved_energy}) and switched -> {player.species.name}",
        )
        self.schedule_player(player_id, time + SWITCH_SECONDS)
        return True

    def return_to_saved_energy(
        self, time: float, player_id: int,
    ) -> bool:
        """Bring back a protected attacker once it can safely spend its meter."""
        player = self.players[player_id]
        if not player.on_field or player.catch_tank_active:
            return False
        return_index = self.best_saved_energy_index(player_id, player, time)
        if return_index is None:
            return False

        departing = player.species.name
        player.token += 1
        player.generation += 1
        player.action_is_charged = False
        player.action_start = time
        player.action_end = time
        player.pokemon_index = return_index
        player.saved_energy_indices.discard(return_index)
        player.saved_energy_return_after.pop(return_index, None)
        player.committed_saved_energy_index = return_index
        player.switches += 1
        player.tactical_switches += 1
        self.record_replay_action(
            time, "player", player_id, "switch", return_index + 1
        )
        self.log(
            time,
            f"P{player_id + 1} {departing}: saved-energy return -> "
            f"{player.species.name} ({player.energy} energy)",
        )
        self.schedule_player(player_id, time + SWITCH_SECONDS)
        return True

    def schedule_catch_tank(
        self,
        time: float,
        hit_time: float,
        player_id: int,
        boss_move: Move,
    ) -> bool:
        """Schedule the latest useful catch-tank swap for an announced hit."""
        if PLAYER_STRATEGY != "catch_tank":
            return False
        player = self.players[player_id]
        if not player.on_field or player.catch_tank_active:
            return False
        tank_index = self.next_unused_catch_tank_index(player)
        if tank_index is None:
            return False

        tank = player.team[tank_index]
        incoming_damage = incoming_damage_for_pokemon(
            boss_move, tank, enraged=self.enraged, dodged=False,
            defense_multiplier=self.player_defense_multiplier(player_id),
        )
        incoming_energy = (
            floor(incoming_damage / 2) if PLAYER_ENERGY_FROM_DAMAGE else 0
        )
        energy_after_hit = min(100, tank.energy + incoming_energy)
        missing_energy = max(0, tank.charged_move.energy - energy_after_hit)
        fast_moves_needed = (
            ceil(missing_energy / tank.fast_move.energy)
            if missing_energy and tank.fast_move.energy > 0
            else 0
        )
        preparation_time = (
            SWITCH_SECONDS + fast_moves_needed * tank.fast_move.duration
        )
        swap_time = max(time, hit_time - preparation_time)
        available_preparation_time = hit_time - swap_time
        immediate = swap_time == time
        timing_text = "immediately" if immediate else f"at {swap_time:.2f}s"
        self.log(
            time,
            f"P{player_id + 1} plans {tank.species.name} catch-tank swap "
            f"{timing_text}: expected +{incoming_energy} energy from "
            f"{boss_move.name}, {fast_moves_needed} fast move(s) needed, "
            f"{preparation_time:.2f}s required / "
            f"{available_preparation_time:.2f}s available",
        )
        self.push(swap_time, "catch_tank_swap", (player_id, tank_index))
        return True

    def start_catch_tank(
        self, time: float, player_id: int, tank_index: int,
    ) -> None:
        """Start a previously scheduled catch-tank switch."""
        player = self.players[player_id]
        if (
            not player.on_field
            or player.catch_tank_active
            or tank_index in player.used_catch_tanks
            or tank_index not in player.catch_tank_indices
        ):
            return

        departing = player.species.name
        player.catch_return_index = player.pokemon_index
        player.catch_tank_active = True
        player.used_catch_tanks.add(tank_index)
        player.catch_tanks_used += 1
        player.token += 1
        player.generation += 1
        player.action_is_charged = False
        player.action_start = time
        player.action_end = time
        player.pokemon_index = tank_index
        player.switches += 1
        player.tactical_switches += 1
        self.record_replay_action(
            time, "player", player_id, "switch", tank_index + 1
        )
        self.log(
            time,
            f"P{player_id + 1} {departing}: catch-tank switch -> "
            f"{player.species.name}",
        )
        self.schedule_player(player_id, time + SWITCH_SECONDS)

    def finish_catch_tank(
        self, time: float, player_id: int, reason: str,
    ) -> None:
        """Retire the current tank and return to the attacker it replaced."""
        player = self.players[player_id]
        departing = player.species.name
        return_index = player.catch_return_index
        player.token += 1
        player.generation += 1
        player.action_is_charged = False
        player.action_start = time
        player.action_end = time
        player.catch_tank_active = False
        player.catch_return_index = None

        if return_index is None or player.team[return_index].hp <= 0:
            return_index = self.first_normal_index(player)
        player.pokemon_index = return_index
        player.on_field = True
        player.switches += 1
        player.tactical_switches += 1
        self.record_replay_action(
            time, "player", player_id, "switch", return_index + 1
        )
        self.log(
            time,
            f"P{player_id + 1} {departing}: catch tank {reason}; retired -> "
            f"{player.species.name}",
        )
        self.schedule_player(player_id, time + SWITCH_SECONDS)

    def switch(self, time: float, player_id: int, tactical: bool) -> None:
        player = self.players[player_id]
        departing = player.species.name
        departing_index = player.pokemon_index
        if player.catch_tank_active:
            self.finish_catch_tank(time, player_id, "fainted")
            return
        player.token += 1
        player.generation += 1
        player.action_is_charged = False
        player.action_start = time
        player.action_end = time
        player.committed_saved_energy_index = None
        if tactical:
            player.tactical_switches += 1
        else:
            player.saved_energy_indices.discard(departing_index)
            player.saved_energy_return_after.pop(departing_index, None)

        next_index = self.next_normal_index(player)
        returning_to_saved_energy = False
        if next_index is None:
            next_index = self.best_saved_energy_index(player_id, player, time)
            returning_to_saved_energy = next_index is not None
        if next_index is None:
            player.on_field = False
            player.rejoins += 1
            rejoin_seconds = self.rng.choice(REJOIN_TIMES)
            reason = "predictive retreat" if tactical else "fainted"
            self.log(
                time,
                f"P{player_id + 1} {departing}: {reason}; "
                f"relobby {rejoin_seconds:.1f}s until {time + rejoin_seconds:.2f}s",
            )
            self.record_replay_action(time, "player", player_id, "quit")
            self.push(time + rejoin_seconds, "rejoin", (player_id,))
            return
        player.pokemon_index = next_index
        if returning_to_saved_energy:
            player.saved_energy_indices.discard(next_index)
            player.saved_energy_return_after.pop(next_index, None)
            player.committed_saved_energy_index = next_index
        player.on_field = True
        player.switches += 1
        self.record_replay_action(
            time, "player", player_id, "switch", next_index + 1
        )
        if returning_to_saved_energy:
            reason = "saved-energy return"
        else:
            reason = "predictive switch" if tactical else "fainted"
        self.log(
            time,
            f"P{player_id + 1} {departing}: {reason} -> {player.species.name}",
        )
        self.schedule_player(player_id, time + SWITCH_SECONDS)

    def rejoin(self, time: float, player_id: int) -> None:
        player = self.players[player_id]
        self.record_replay_action(time, "player", player_id, "rejoin")
        player.generation += 1
        player.action_is_charged = False
        player.action_start = time
        player.action_end = time
        player.pokemon_index = self.first_normal_index(player)
        for pokemon in player.team:
            pokemon.reset()
        player.saved_energy_indices.clear()
        player.saved_energy_return_after.clear()
        player.committed_saved_energy_index = None
        player.energy_save_guard_until = 0.0
        player.on_field = True
        self.log(time, f"P{player_id + 1} rejoined with {player.species.name} at {player.hp} HP")
        self.schedule_player(player_id, time)

    def start_player_action(self, time: float, player_id: int, token: int) -> None:
        player = self.players[player_id]
        if token != player.token or not player.on_field:
            return
        if (
            PLAYER_STRATEGY in HOT_SWAP_CHARGED_DAMAGE_RESERVES
            and time >= player.energy_save_guard_until
            and player.committed_saved_energy_index != player.pokemon_index
            and self.return_to_saved_energy(time, player_id)
        ):
            return
        if (
            PLAYER_STRATEGY in HOT_SWAP_CHARGED_DAMAGE_RESERVES
            and time >= player.energy_save_guard_until
            and player.committed_saved_energy_index != player.pokemon_index
            and self.should_retreat(player_id, player)
        ):
            self.switch(time, player_id, tactical=True)
            return

        pokemon = player.pokemon
        move = pokemon.charged_move if player.energy >= pokemon.charged_move.energy else pokemon.fast_move
        if move is pokemon.charged_move:
            player.energy -= move.energy
        player.action_start = time
        player.action_end = time + move.duration
        player.action_is_charged = move is pokemon.charged_move
        self.record_replay_action(
            time,
            "player",
            player_id,
            "move",
            displayed_player_move_name(move, pokemon),
        )
        self.log(
            time,
            f"P{player_id + 1} starts {displayed_player_move_name(move, pokemon)} "
            f"(HP {player.hp}, energy {player.energy}, "
            f"PP {'active' if player.party_power_active else f'{player.party_power_progress}/{player.party_power_threshold}'})",
            category="move_start",
        )
        generation = player.generation
        self.push(player.action_end, "player_hit", (player_id, generation, move))
        self.schedule_player(player_id, player.action_end)

    def apply_player_hit(self, player_id: int, generation: int, move: Move) -> None:
        player = self.players[player_id]
        if not player.on_field or generation != player.generation:
            return
        if move is player.pokemon.fast_move:
            player.energy = min(100, player.energy + move.energy)
            self.charge_party_power(player)
        powered = move is player.pokemon.charged_move and player.party_power_active
        damage = self.outgoing_damage(move, player_id, party_power=powered)
        player.damage_dealt += damage
        if move is player.pokemon.fast_move:
            player.fast_moves_used += 1
        else:
            player.charged_moves_used += 1
            if player.committed_saved_energy_index == player.pokemon_index:
                player.committed_saved_energy_index = None
            if powered:
                player.powered_charged_moves += 1
        if powered:
            self.consume_party_power(player)
        self.boss_hp -= damage
        pp_text = " with PP" if powered else ""
        self.log(
            self.current_time,
            f"P{player_id + 1} lands "
            f"{displayed_player_move_name(move, player.pokemon)}{pp_text} "
            f"for {damage}; boss HP {max(0, self.boss_hp)}",
        )
        self.boss_energy = min(BOSS_MAX_ENERGY, self.boss_energy + floor(damage / 2))
        if SUPER_MEGA_ENRAGE and not self.enraged and self.boss_hp <= ENRAGE_HP:
            self.enraged = True
            self.log(self.current_time, "BOSS ENRAGED (defense x4, attack x1.8)")
        if player.catch_tank_active and move is player.pokemon.charged_move:
            self.finish_catch_tank(
                self.current_time, player_id, "used its charged move"
            )

    @staticmethod
    def charge_party_power(player: Player) -> None:
        """Add one completed fast move to the trainer's Party Power meter."""
        threshold = player.party_power_threshold
        if threshold <= 0:
            return
        player.party_power_progress = min(threshold, player.party_power_progress + 1)
        if not player.party_power_active and player.party_power_progress >= threshold:
            player.party_power_active = True
            player.party_power_progress = 0

    @staticmethod
    def consume_party_power(player: Player) -> None:
        """Consume PP and immediately activate a fully charged queued meter."""
        player.party_power_active = False
        if player.party_power_progress >= player.party_power_threshold > 0:
            player.party_power_active = True
            player.party_power_progress = 0

    def boss_decision(self, time: float) -> None:
        can_charge = self.boss_energy >= self.boss_charged.energy
        if can_charge and self.rng.random() < BOSS_CHARGED_CHANCE:
            move = self.boss_charged
            self.boss_energy -= move.energy
            hit_time = time + move.duration
            self.record_replay_action(time, "boss", None, "charged")
            self.log(
                time,
                f"Boss starts {move.name}; hits at {hit_time:.2f}s",
                category="move_start",
            )
            dodgers: set[int] = set()
            for player_id, player in enumerate(self.players):
                if not player.on_field:
                    continue
                if self.schedule_catch_tank(
                    time, hit_time, player_id, move,
                ):
                    continue
                will_dodge = self.should_dodge_charged(player_id, player)
                # Dodge fails if the boss hit lands strictly inside the
                # player's charged-move animation.
                collision = (
                    will_dodge
                    and
                    player.action_is_charged
                    and player.action_start < hit_time < player.action_end
                )
                assert self.dodge_profiles is not None
                profile = self.dodge_profiles[
                    (player_id, player.pokemon_index, self.enraged)
                ]
                expected_damage = (
                    profile.dodged_damage if will_dodge and not collision
                    else profile.full_damage
                )
                if self.announced_charge_prevents_next_charge(
                    player_id, player, hit_time, expected_damage, move,
                ) and self.save_energy_for_announced_charge(
                    time, hit_time, player_id, move,
                ):
                    continue
                if not will_dodge:
                    continue
                if collision:
                    self.log(
                        time,
                        f"P{player_id + 1} tries to dodge {move.name}, but its "
                        f"charged-move animation overlaps the hit",
                    )
                    continue
                dodgers.add(player_id)
                self.record_replay_action(time, "player", player_id, "dodge")
                self.log(time, f"P{player_id + 1} chooses to dodge {move.name}")
                self.schedule_player(
                    player_id,
                    max(time, player.next_action_time) + DODGE_SECONDS,
                )
            self.push(hit_time, "boss_hit", (move, frozenset(dodgers)))
            self.push(hit_time, "boss_decision")
        else:
            move = self.boss_fast
            self.boss_energy = min(BOSS_MAX_ENERGY, self.boss_energy + move.energy)
            hit_time = time + move.duration
            self.record_replay_action(time, "boss", None, "fast")
            self.log(
                time,
                f"Boss starts {move.name}; hits at {hit_time:.2f}s",
                category="move_start",
            )
            self.push(hit_time, "boss_hit", (move, frozenset()))
            self.push(hit_time + FAST_MOVE_DELAY, "boss_decision")

    def apply_boss_hit(self, move: Move, dodgers: frozenset[int]) -> None:
        for player_id, player in enumerate(self.players):
            if not player.on_field:
                continue
            damage = self.incoming_damage(
                move, player_id, player, player_id in dodgers,
            )
            player.hp -= damage
            player.damage_taken += damage
            if player_id in dodgers:
                player.successful_dodges += 1
            dodge_text = " (dodged)" if player_id in dodgers else ""
            self.log(
                self.current_time,
                f"Boss {move.name} hits P{player_id + 1} for {damage}{dodge_text}; "
                f"{player.species.name} HP {max(0, player.hp)}",
            )
            if PLAYER_ENERGY_FROM_DAMAGE:
                player.energy = min(100, player.energy + floor(damage / 2))
            if player.hp <= 0:
                player.faints += 1
                self.switch(self.current_time, player_id, tactical=False)

    current_time: float = 0.0

    def capture_replay_state(self) -> None:
        """Optional playback observer; ordinary trials do not collect states."""
        pass

    def run(self) -> TrialResult:
        self.capture_replay_state()
        for player_id in range(len(self.players)):
            self.schedule_player(player_id, 0.0)
        self.push(0.0, "boss_decision")
        last_time = 0.0
        while self.events:
            time, _seq, kind, data = heappop(self.events)
            if time > RAID_SECONDS or self.boss_hp <= 0:
                break
            self.current_time = last_time = time
            if kind == "player_ready":
                self.start_player_action(time, *data)
            elif kind == "player_hit":
                self.apply_player_hit(*data)
            elif kind == "boss_decision":
                self.boss_decision(time)
            elif kind == "boss_hit":
                self.apply_boss_hit(*data)
            elif kind == "catch_tank_swap":
                self.start_catch_tank(time, *data)
            elif kind == "rejoin":
                self.rejoin(time, *data)
            self.capture_replay_state()

        return TrialResult(
            self.boss_hp <= 0,
            last_time if self.boss_hp <= 0 else RAID_SECONDS,
            max(0, self.boss_hp),
            sum(p.switches for p in self.players),
            sum(p.faints for p in self.players),
            sum(p.tactical_switches for p in self.players),
            sum(p.rejoins for p in self.players),
            sum(p.catch_tanks_used for p in self.players),
        )


def replay_tick_text(tick: int) -> str:
    whole, half = divmod(tick, 2)
    return f"{whole}.5" if half else str(whole)


def build_replay_move_codes(move_names: list[str]) -> dict[str, str]:
    """Create compact, deterministic aliases and disambiguate collisions."""
    codes_by_name: dict[str, str] = {}
    used_codes = {"d", "q", "r"}
    for move_name in move_names:
        if move_name in codes_by_name:
            continue
        words = re.findall(r"[A-Za-z0-9]+", move_name.rstrip("+"))
        if not words:
            base = "mv"
        elif len(words) == 1:
            base = words[0][:2].lower()
        else:
            base = "".join(word[0] for word in words).lower()
        if base in used_codes or re.fullmatch(r"s\d+", base):
            base += "m"
        code = base
        suffix = 2
        while code in used_codes:
            code = f"{base}{suffix}"
            suffix += 1
        used_codes.add(code)
        codes_by_name[move_name] = code
    return codes_by_name


def render_battle_replay(
    simulation: Simulation,
    result: TrialResult,
    actual_seed: int,
) -> str:
    """Render one completed detailed simulation in the compact text format."""
    move_names = [
        str(value)
        for _tick, _sequence, actor, _actor_id, kind, value
        in simulation.replay_actions
        if actor == "player" and kind == "move"
    ]
    move_codes = build_replay_move_codes(move_names)

    # Combine players who begin the same action on the same tick. This preserves
    # event order while producing the p1,2 shorthand intended for hand editing.
    grouped: list[dict[str, object]] = []
    group_indexes: dict[tuple[int, str, object], int] = {}
    for tick, _sequence, actor, actor_id, kind, value in simulation.replay_actions:
        if actor == "player":
            key = (tick, kind, value)
            group_index = group_indexes.get(key)
            if group_index is not None:
                players = grouped[group_index]["players"]
                assert isinstance(players, list)
                players.append(int(actor_id))
                continue
            group_indexes[key] = len(grouped)
            grouped.append({
                "tick": tick,
                "actor": actor,
                "players": [int(actor_id)],
                "kind": kind,
                "value": value,
            })
        else:
            grouped.append({
                "tick": tick,
                "actor": actor,
                "players": [],
                "kind": kind,
                "value": value,
            })

    lines = [
        f"Raid: {RAID_DIFFICULTY}",
        f"Boss: {BOSS_FORM_ID}; fast={simulation.boss_fast.name}; "
        f"charged={simulation.boss_charged.name}",
        "Teams:",
    ]
    lines.extend(
        f"p{player_id}: {team!r}"
        for player_id, team in enumerate(PLAYER_TEAMS, start=1)
    )
    lines.extend([
        "",
        "Friendship: " + "; ".join(
            f"p{player_id}={float(multiplier):g}"
            for player_id, multiplier in enumerate(FRIENDSHIP_MULTIPLIERS, start=1)
        ),
        "Zacian effects: " + "; ".join(
            f"p{player_id}={'true' if enabled else 'false'}"
            for player_id, enabled in enumerate(ZACIAN_ADVENTURE_EFFECT, start=1)
        ),
        "Behemoth Bash effects: " + "; ".join(
            f"p{player_id}={'true' if enabled else 'false'}"
            for player_id, enabled in enumerate(
                BEHEMOTH_BASH_ADVENTURE_EFFECT, start=1
            )
        ),
        "Dynamic Punch+ effects: " + "; ".join(
            f"p{player_id}={'true' if enabled else 'false'}"
            for player_id, enabled in enumerate(
                DYNAMIC_PUNCH_ADVENTURE_EFFECT, start=1
            )
        ),
        f"Weather: {WEATHER or 'none'}",
        f"Dodge: {DODGE_STRATEGY}",
        f"Swap: {PLAYER_STRATEGY}",
        "Catch tanks: " + "; ".join(
            f"p{player_id}=" + (
                ",".join(str(index + 1) for index in indexes) if indexes else "-"
            )
            for player_id, indexes in enumerate(CATCH_TANK_TEAM_INDICES, start=1)
        ),
    ])
    party_groups = "|".join(
        "p" + ",".join(str(player_id + 1) for player_id in group)
        for group in PARTY_POWER_GROUPS
    ) or "-"
    lines.extend([
        f"Party Power: {'boosted' if BOOSTED_PARTY_POWER else 'normal'}; "
        f"groups={party_groups}",
        f"Seed: {actual_seed}",
        f"Result: {'win' if result.won else 'loss'}; "
        f"time={replay_tick_text(round(result.finish_time * 2))}; "
        f"boss_hp={result.boss_hp}",
    ])
    if move_codes:
        lines.append(
            "Move codes: " + "; ".join(
                f"{code}={move_name}" for move_name, code in move_codes.items()
            )
        )
    lines.extend(["", "Events:"])

    previous_tick: int | None = None
    for event in grouped:
        tick = int(event["tick"])
        if previous_tick is None:
            time_code = "t" + replay_tick_text(tick)
        else:
            time_code = "+" + replay_tick_text(tick - previous_tick)
        previous_tick = tick

        if event["actor"] == "boss":
            actor_code = "b"
            action_code = "c" if event["kind"] == "charged" else "f"
        else:
            players = event["players"]
            assert isinstance(players, list) and players
            actor_code = "p" + ",".join(str(player_id + 1) for player_id in players)
            kind = event["kind"]
            value = event["value"]
            if kind == "move":
                action_code = move_codes[str(value)]
            elif kind == "switch":
                action_code = f"s{int(value)}"
            elif kind == "quit":
                action_code = "q"
            elif kind == "rejoin":
                action_code = "r"
            elif kind == "dodge":
                action_code = "d"
            else:
                raise ValueError(f"Unknown replay action kind {kind!r}")
        lines.append(f"{time_code}{actor_code}:{action_code}")
    return "\n".join(lines)


def simulate_moveset_details(
    fast: Move, charged: Move, seed: int,
) -> list[tuple[TrialResult, str]]:
    rng = random.Random(seed)
    dodge_profiles = precompute_dodge_profiles(charged)
    details = []
    for _ in range(TRIALS_PER_MOVESET):
        simulation = Simulation(
            fast, charged, rng, dodge_profiles=dodge_profiles,
        )
        details.append((simulation.run(), simulation.boss_fast.move_type))
    return details


def simulate_moveset(fast: Move, charged: Move, seed: int) -> list[TrialResult]:
    return [result for result, _move_type in simulate_moveset_details(fast, charged, seed)]


def aggregate_summary() -> dict[str, object]:
    """Return website-friendly aggregate results for every configured moveset."""
    rows = []
    row_seed = RANDOM_SEED
    total_wins = 0
    total_battles = 0
    for fast in BOSS_FAST_MOVES.values():
        for charged in BOSS_CHARGED_MOVES.values():
            details = simulate_moveset_details(fast, charged, row_seed)
            results = [result for result, _move_type in details]
            wins = [result for result in results if result.won]
            losses = [result for result in results if not result.won]
            type_counts: dict[str, int] = {}
            if fast.name == "Hidden Power":
                for _result, move_type in details:
                    type_counts[move_type] = type_counts.get(move_type, 0) + 1
            rows.append({
                "fast_move": fast.name,
                "charged_move": charged.name,
                "games": len(results),
                "wins": len(wins),
                "win_percent": 100 * len(wins) / len(results),
                "average_win_time": mean(r.finish_time for r in wins) if wins else None,
                "average_boss_hp_on_loss": mean(r.boss_hp for r in losses) if losses else 0.0,
                "average_switches": mean(r.switches for r in results),
                "average_faints": mean(r.faints for r in results),
                "average_retreats": mean(r.tactical_switches for r in results),
                "average_rejoins": mean(r.rejoins for r in results),
                "average_catch_tanks": mean(r.catch_tanks_used for r in results),
                "hidden_power_types": type_counts,
                "seed": str(row_seed),
            })
            total_wins += len(wins)
            total_battles += len(results)
            row_seed += 1
    return {
        "mode": "batch",
        "random_seed": str(RANDOM_SEED),
        "total_battles": total_battles,
        "total_wins": total_wins,
        "win_percent": 100 * total_wins / total_battles,
        "movesets": rows,
    }


def moveset_seed(fast_name: str, charged_name: str) -> int:
    combinations = [
        (fast, charged)
        for fast in BOSS_FAST_MOVES
        for charged in BOSS_CHARGED_MOVES
    ]
    try:
        return RANDOM_SEED + combinations.index((fast_name, charged_name))
    except ValueError as error:
        raise ValueError(
            f"Unknown moveset {fast_name!r} / {charged_name!r}"
        ) from error


def detailed_trial(fast_name: str, charged_name: str, trial_index: int) -> None:
    if trial_index < 0:
        raise ValueError("Trial index must be zero or greater")
    fast = BOSS_FAST_MOVES[fast_name]
    charged = BOSS_CHARGED_MOVES[charged_name]
    actual_seed = moveset_seed(fast_name, charged_name)
    rng = random.Random(actual_seed)
    dodge_profiles = precompute_dodge_profiles(charged)
    simulation: Simulation | None = None
    result: TrialResult | None = None
    # Reuse the same random stream as the aggregate run so trial N is exactly
    # reproducible rather than merely another battle with a similar seed.
    for index in range(trial_index + 1):
        simulation = Simulation(
            fast, charged, rng,
            dodge_profiles=dodge_profiles,
            detailed=index == trial_index,
        )
        result = simulation.run()
    assert simulation is not None and result is not None
    print(
        f"Detailed trial {trial_index}: {fast_name} / {charged_name} "
        f"({'WIN' if result.won else 'LOSS'}); dodge strategy {DODGE_STRATEGY}; "
        f"player strategy {PLAYER_STRATEGY}"
    )
    print(f"Boss fast move type: {simulation.boss_fast.move_type}")
    print("Battle log:")
    for entry in simulation.event_log:
        print(entry)
    print("End battle log")
    print("Battle replay:")
    print(render_battle_replay(simulation, result, actual_seed))
    print("End battle replay")
    print("Player totals:")
    for player_id, player in enumerate(simulation.players):
        print(
            f"  P{player_id + 1}: damage {player.damage_dealt}; "
            f"fast {player.fast_moves_used}; charged {player.charged_moves_used} "
            f"({player.powered_charged_moves} powered); damage taken {player.damage_taken}; "
            f"dodges {player.successful_dodges}; faints {player.faints}; "
            f"retreats {player.tactical_switches}; rejoins {player.rejoins}; "
            f"catch tanks {player.catch_tanks_used}"
        )
    print(
        f"Result: {'win' if result.won else 'loss'} at {result.finish_time:.2f}s; "
        f"boss HP {result.boss_hp}; faints {result.faints}; "
        f"retreats {result.tactical_switches}; rejoins {result.rejoins}; "
        f"catch tanks {result.catch_tanks_used}"
    )


def validate_settings() -> None:
    if TRIALS_PER_MOVESET <= 0:
        raise ValueError("TRIALS_PER_MOVESET must be a positive integer")
    if DODGE_STRATEGY not in DODGE_STRATEGIES:
        raise ValueError(
            f"Unknown DODGE_STRATEGY {DODGE_STRATEGY!r}; "
            f"choose from {DODGE_STRATEGIES}"
        )
    if PLAYER_STRATEGY not in PLAYER_STRATEGIES:
        raise ValueError(
            f"Unknown PLAYER_STRATEGY {PLAYER_STRATEGY!r}; "
            f"choose from {PLAYER_STRATEGIES}"
        )
    if BATTLE_LOG_MODE not in BATTLE_LOG_MODES:
        raise ValueError(
            f"Unknown BATTLE_LOG_MODE {BATTLE_LOG_MODE!r}; "
            f"choose from {BATTLE_LOG_MODES}"
        )
    if not BOSS_FAST_MOVES or not BOSS_CHARGED_MOVES:
        raise ValueError("The boss must have at least one fast and one charged move")
    invalid_boss_types = [move_type for move_type in BOSS_TYPES if move_type not in TYPES]
    if not BOSS_TYPES or invalid_boss_types:
        raise ValueError(
            f"Invalid boss types {BOSS_TYPES}; expected one or two values from {TYPES}"
        )
    if BOSS_ATTACK_BASE <= 0 or BOSS_DEFENSE_BASE <= 0:
        raise ValueError("Boss Attack and Defense must both be positive")
    player_count = len(PLAYER_TEAMS)
    if not player_count or any(not team for team in PLAYER_TEAMS):
        raise ValueError("Every player must have at least one Pokémon")
    if len(FRIENDSHIP_MULTIPLIERS) != player_count:
        raise ValueError("FRIENDSHIP_MULTIPLIERS must contain one value per player")
    if len(ZACIAN_ADVENTURE_EFFECT) != player_count:
        raise ValueError("ZACIAN_ADVENTURE_EFFECT must contain one value per player")
    if len(BEHEMOTH_BASH_ADVENTURE_EFFECT) != player_count:
        raise ValueError(
            "BEHEMOTH_BASH_ADVENTURE_EFFECT must contain one value per player"
        )
    if len(DYNAMIC_PUNCH_ADVENTURE_EFFECT) != player_count:
        raise ValueError(
            "DYNAMIC_PUNCH_ADVENTURE_EFFECT must contain one value per player"
        )
    conflicting_adventure_effects = [
        player_id + 1
        for player_id, effects in enumerate(zip(
            ZACIAN_ADVENTURE_EFFECT,
            BEHEMOTH_BASH_ADVENTURE_EFFECT,
            DYNAMIC_PUNCH_ADVENTURE_EFFECT,
        ))
        if sum(bool(effect) for effect in effects) > 1
    ]
    if conflicting_adventure_effects:
        raise ValueError(
            "Only one Adventure Effect may be active per player; conflicting "
            f"players: {conflicting_adventure_effects}"
        )
    if len(CATCH_TANK_TEAM_INDICES) != player_count:
        raise ValueError(
            "CATCH_TANK_TEAM_INDICES must contain one index list per player"
        )
    invalid_catch_tanks = [
        (player_id, indices)
        for player_id, (team, indices) in enumerate(
            zip(PLAYER_TEAMS, CATCH_TANK_TEAM_INDICES)
        )
        if (
            len(indices) != len(set(indices))
            or len(indices) >= len(team)
            or any(
                not isinstance(index, int) or isinstance(index, bool)
                or not 0 <= index < len(team)
                for index in indices
            )
        )
    ]
    if invalid_catch_tanks:
        raise ValueError(
            "Each player's catch-tank indexes must be unique valid team "
            f"positions and leave one normal attacker: {invalid_catch_tanks}"
        )
    invalid_setups = [
        setup for team in PLAYER_TEAMS for setup in team
        if not isinstance(setup, (tuple, list)) or len(setup) not in (4, 7, 8, 9)
    ]
    if invalid_setups:
        raise ValueError(
            "Each PLAYER_TEAMS entry must contain species, fast move, charged "
            "move, and level, optionally followed by attack/defense/stamina "
            "IVs, a Shadow flag, and Mega Level"
        )
    normalized_setups = [
        unpack_player_setup(setup) for team in PLAYER_TEAMS for setup in team
    ]
    unknown_species = [
        species for species, _fast, _charged, _level, *_ivs in normalized_setups
        if species not in SPECIES
    ]
    if unknown_species:
        raise ValueError(f"Unknown species in PLAYER_TEAMS: {unknown_species}")
    too_many_megas = [
        player_id + 1
        for player_id, team in enumerate(PLAYER_TEAMS)
        if sum(
            bool(SPECIES[unpack_player_setup(setup)[0]].mega_boost_types)
            for setup in team
        ) > 1
    ]
    if too_many_megas:
        raise ValueError(
            "Each player team may contain at most one Mega/Primal Pokémon; "
            f"invalid players: {too_many_megas}"
        )
    unknown_moves = [
        move for _species, fast, charged, _level, *_ivs in normalized_setups
        for move in (fast, charged) if move not in MOVES
    ]
    if unknown_moves:
        raise ValueError(f"Unknown moves in PLAYER_TEAMS: {unknown_moves}")
    invalid_levels = [
        level for _species, _fast, _charged, level, *_ivs in normalized_setups
        if not isinstance(level, (int, float)) or isinstance(level, bool)
        or round(level * 2) not in CPM_BY_HALF_LEVEL
        or abs(level * 2 - round(level * 2)) > 1e-9
    ]
    if invalid_levels:
        raise ValueError(
            f"Pokémon levels must be half-levels from 1 through 55: {invalid_levels}"
        )
    invalid_ivs = [
        iv
        for (
            _species, _fast, _charged, _level,
            attack_iv, defense_iv, stamina_iv, _shadow, _mega_level,
        ) in normalized_setups
        for iv in (attack_iv, defense_iv, stamina_iv)
        if not isinstance(iv, int) or isinstance(iv, bool) or not 0 <= iv <= 15
    ]
    if invalid_ivs:
        raise ValueError(f"Pokémon IVs must be integers from 0 through 15: {invalid_ivs}")
    invalid_mega_levels = [
        mega_level
        for (
            _species, _fast, _charged, _level,
            _attack_iv, _defense_iv, _stamina_iv, _shadow, mega_level,
        ) in normalized_setups
        if not isinstance(mega_level, int) or isinstance(mega_level, bool)
        or not 1 <= mega_level <= 4
    ]
    if invalid_mega_levels:
        raise ValueError(
            "Mega Levels must be integers from 1 through 4: "
            f"{invalid_mega_levels}"
        )
    illegal_plus_moves = [
        (species, charged, SPECIES[species].form_id)
        for (
            species, _fast, charged, _level,
            _attack_iv, _defense_iv, _stamina_iv, _shadow, _mega_level,
        ) in normalized_setups
        if charged in PLUS_MOVE_FORM_IDS
        and SPECIES[species].form_id != PLUS_MOVE_FORM_IDS[charged]
    ]
    if illegal_plus_moves:
        raise ValueError(
            "Each + move can only be used by its corresponding Mega form: "
            f"{illegal_plus_moves}"
        )
    invalid_shadow_flags = [
        shadow
        for (
            _species, _fast, _charged, _level,
            _attack_iv, _defense_iv, _stamina_iv, shadow, _mega_level,
        ) in normalized_setups
        if not isinstance(shadow, bool)
    ]
    if invalid_shadow_flags:
        raise ValueError(
            f"Pokémon Shadow flags must be true or false: {invalid_shadow_flags}"
        )
    if WEATHER not in WEATHER_BOOSTED_TYPES:
        raise ValueError(
            f"Unknown WEATHER {WEATHER!r}; choose from {list(WEATHER_BOOSTED_TYPES)}"
        )
    invalid_sizes = [len(group) for group in PARTY_POWER_GROUPS if len(group) not in (2, 3, 4)]
    if invalid_sizes:
        raise ValueError(f"Party Power groups must contain 2-4 players: {invalid_sizes}")
    grouped_players = [player_id for group in PARTY_POWER_GROUPS for player_id in group]
    if len(grouped_players) != len(set(grouped_players)):
        raise ValueError("A player may appear in only one Party Power group")
    invalid_players = [
        player_id for player_id in grouped_players
        if not isinstance(player_id, int) or isinstance(player_id, bool)
        or not 0 <= player_id < player_count
    ]
    if invalid_players:
        raise ValueError(f"Invalid player indexes in PARTY_POWER_GROUPS: {invalid_players}")


def main() -> None:
    global DODGE_STRATEGY, PLAYER_STRATEGY, BATTLE_LOG_MODE
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--detail", nargs=2, metavar=("FAST_MOVE", "CHARGED_MOVE"),
        help="print one reproducible battle log instead of aggregate results",
    )
    parser.add_argument(
        "--trial", type=int, default=0,
        help="zero-based trial number used with --detail (default: 0)",
    )
    parser.add_argument(
        "--dodge-strategy", choices=DODGE_STRATEGIES,
        help="override DODGE_STRATEGY for this run",
    )
    parser.add_argument(
        "--player-strategy", choices=PLAYER_STRATEGIES,
        help="override PLAYER_STRATEGY for this run",
    )
    parser.add_argument(
        "--battle-log-mode", choices=BATTLE_LOG_MODES,
        help="with --detail, show no events, move starts, or every event",
    )
    parser.add_argument(
        "--json-summary", action="store_true",
        help="print aggregate results as JSON for the website",
    )
    args = parser.parse_args()
    if args.dodge_strategy:
        DODGE_STRATEGY = args.dodge_strategy
    if args.player_strategy:
        PLAYER_STRATEGY = args.player_strategy
    if args.battle_log_mode:
        BATTLE_LOG_MODE = args.battle_log_mode
    validate_settings()
    if args.json_summary:
        print(json.dumps(aggregate_summary()))
        return
    if args.detail:
        detailed_trial(args.detail[0], args.detail[1], args.trial)
        return
    print(f"Trials per moveset: {TRIALS_PER_MOVESET:,}")
    print(
        f"Raid difficulty: {RAID_DIFFICULTY}; boss HP {BOSS_HP:,}; "
        f"boss CPM {BOSS_CPM}; timer {RAID_SECONDS:.0f}s"
    )
    if RAID_RULES.get("shadow"):
        print(
            "Warning: Shadow-tier base stats are active, but Shadow enrage and "
            "Purified Gems are not modeled."
        )
    profile_source = "manual overrides" if BOSS_MANUAL_PROFILE else "calculator data"
    print(
        f"Boss: {BOSS_NAME} ({BOSS_FORM_ID}; {profile_source}); "
        f"types: {'/'.join(BOSS_TYPES)}; "
        f"base attack/defense: {BOSS_ATTACK_BASE}/{BOSS_DEFENSE_BASE}"
    )
    print(f"Player teams: {PLAYER_TEAMS}")
    print(f"Friendship: {FRIENDSHIP_MULTIPLIERS}")
    print(f"Zacian effects: {ZACIAN_ADVENTURE_EFFECT}; weather: {WEATHER or 'None'}")
    print(f"Behemoth Bash effects: {BEHEMOTH_BASH_ADVENTURE_EFFECT}")
    print(f"Dynamic Punch+ effects: {DYNAMIC_PUNCH_ADVENTURE_EFFECT}")
    print(f"Dodge strategy: {DODGE_STRATEGY}")
    print(f"Player strategy: {PLAYER_STRATEGY}")
    print(f"Catch-tank team indexes: {CATCH_TANK_TEAM_INDICES}")
    pp_mode = "boosted" if BOOSTED_PARTY_POWER else "normal"
    print(f"Party Power: {pp_mode}; groups: {PARTY_POWER_GROUPS}")
    print(
        "Fast move".ljust(22) + "Charged move".ljust(17)
        + "Win %".rjust(8) + "Win time".rjust(11)
        + "Switches".rjust(11) + "Faints".rjust(9)
        + "Retreats".rjust(10) + "Rejoins".rjust(10)
        + "Catches".rjust(9)
        + "Boss HP(loss)".rjust(15)
    )
    row_seed = RANDOM_SEED
    for fast in BOSS_FAST_MOVES.values():
        for charged in BOSS_CHARGED_MOVES.values():
            results = simulate_moveset(fast, charged, row_seed)
            row_seed += 1
            wins = [r for r in results if r.won]
            losses = [r for r in results if not r.won]
            win_time = mean(r.finish_time for r in wins) if wins else None
            remaining = mean(r.boss_hp for r in losses) if losses else 0.0
            print(
                fast.name.ljust(22) + charged.name.ljust(17)
                + f"{100 * len(wins) / len(results):7.1f}%"
                + (f"{win_time:10.1f}s" if win_time is not None else "        -- ")
                + f"{mean(r.switches for r in results):11.2f}"
                + f"{mean(r.faints for r in results):9.2f}"
                + f"{mean(r.tactical_switches for r in results):10.2f}"
                + f"{mean(r.rejoins for r in results):10.2f}"
                + f"{mean(r.catch_tanks_used for r in results):9.2f}"
                + f"{remaining:15.0f}"
            )


if __name__ == "__main__":
    main()
