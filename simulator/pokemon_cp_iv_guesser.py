"""Guess Pokémon GO level and IVs from a species/form and displayed CP.

Keep calculator_data.json beside this program.

Examples:
    python pokemon_cp_iv_guesser.py Electivire 3099
    python pokemon_cp_iv_guesser.py "Mega Garchomp" 6132 --all
    python pokemon_cp_iv_guesser.py ZEKROM 2836 --limit 50

If species and CP are omitted, the program asks for them interactively.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from math import floor, sqrt
import json
from pathlib import Path


DATA_PATH = Path(__file__).resolve().with_name("calculator_data.json")
DEFAULT_MAX_LEVEL = 55.0
PREFERRED_ENCOUNTER_LEVELS = frozenset({8.0, 15.0, 20.0, 25.0})

# Pokémon GO combat-power multipliers for each half-level from 1 through 55.
# Integer keys avoid float-key precision problems: key 81 means level 40.5.
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


@dataclass(frozen=True)
class Candidate:
    level: float
    attack_iv: int
    defense_iv: int
    stamina_iv: int
    calculated_cp: int
    requested_cp: int

    @property
    def total_iv(self) -> int:
        return self.attack_iv + self.defense_iv + self.stamina_iv

    @property
    def iv_percent(self) -> float:
        return 100 * self.total_iv / 45

    @property
    def cp_difference(self) -> int:
        return self.calculated_cp - self.requested_cp

    @property
    def preferred_level(self) -> bool:
        return self.level in PREFERRED_ENCOUNTER_LEVELS


def load_data(path: Path) -> list[dict]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise SystemExit(
            f"Missing {path.name}. Put it in the same folder as this program."
        ) from error
    except json.JSONDecodeError as error:
        raise SystemExit(f"Could not parse {path.name}: {error}") from error
    if not isinstance(data, list):
        raise SystemExit(f"Expected a list of Pokémon records in {path.name}")
    return data


def normalized(text: str) -> str:
    """Make display names and IDs comparable without erasing form words."""
    return "".join(character for character in text.casefold() if character.isalnum())


def resolve_species(data: list[dict], query: str) -> dict:
    wanted = normalized(query)
    exact = []
    for entry in data:
        names = (entry.get("name", ""), entry.get("id", ""), entry.get("form_id", ""))
        if wanted in {normalized(str(name)) for name in names if name}:
            exact.append(entry)

    # Identical records can occasionally be reachable through more than one key.
    unique = {entry["form_id"]: entry for entry in exact}
    if len(unique) == 1:
        return next(iter(unique.values()))
    if len(unique) > 1:
        forms = ", ".join(sorted(unique))
        raise SystemExit(f"Ambiguous species/form {query!r}. Use one of: {forms}")

    partial = {
        entry["form_id"]: entry
        for entry in data
        if wanted and wanted in normalized(str(entry.get("name", "")))
    }
    if len(partial) == 1:
        return next(iter(partial.values()))
    if partial:
        forms = ", ".join(sorted(partial)[:30])
        suffix = " ..." if len(partial) > 30 else ""
        raise SystemExit(
            f"Ambiguous species/form {query!r}. Matching form IDs: {forms}{suffix}"
        )
    raise SystemExit(f"Unknown species/form: {query!r}")


def calculate_cp(
    base_attack: int,
    base_defense: int,
    base_stamina: int,
    attack_iv: int,
    defense_iv: int,
    stamina_iv: int,
    cpm: float,
) -> int:
    raw_cp = (
        (base_attack + attack_iv)
        * sqrt(base_defense + defense_iv)
        * sqrt(base_stamina + stamina_iv)
        * cpm * cpm
        / 10
    )
    return max(10, floor(raw_cp))


def find_candidates(entry: dict, target_cp: int, max_level: float) -> list[Candidate]:
    stats = entry["stats"]
    candidates = []
    for half_level, cpm in CPM_BY_HALF_LEVEL.items():
        level = half_level / 2
        if level > max_level:
            continue
        for attack_iv in range(16):
            for defense_iv in range(16):
                for stamina_iv in range(16):
                    cp = calculate_cp(
                        int(stats["attack"]), int(stats["defense"]),
                        int(stats["stamina"]), attack_iv, defense_iv,
                        stamina_iv, cpm,
                    )
                    if cp == target_cp:
                        candidates.append(Candidate(
                            level, attack_iv, defense_iv, stamina_iv,
                            cp, target_cp,
                        ))
    return candidates


def ranking_key(candidate: Candidate) -> tuple:
    """Rank encounter levels first, then weighted IV quality and Attack IV."""
    weighted_ivs = 3 * candidate.attack_iv + candidate.defense_iv + candidate.stamina_iv
    return (
        0 if candidate.preferred_level else 1,
        -weighted_ivs,
        -candidate.total_iv,
        -candidate.attack_iv,
        -candidate.defense_iv,
        -candidate.stamina_iv,
        candidate.level,
        abs(candidate.cp_difference),
    )


def find_with_cp_chaos_fallback(
    entry: dict, requested_cp: int, max_level: float,
) -> tuple[list[Candidate], bool]:
    exact = find_candidates(entry, requested_cp, max_level)
    if exact:
        return exact, False

    nearby = []
    for tested_cp in (requested_cp - 1, requested_cp + 1):
        if tested_cp < 10:
            continue
        nearby.extend(
            Candidate(
                candidate.level, candidate.attack_iv, candidate.defense_iv,
                candidate.stamina_iv, tested_cp, requested_cp,
            )
            for candidate in find_candidates(entry, tested_cp, max_level)
        )
    return nearby, bool(nearby)


def print_candidates(
    entry: dict,
    requested_cp: int,
    candidates: list[Candidate],
    used_fallback: bool,
    limit: int | None,
) -> None:
    print(f"Pokémon: {entry['name']} ({entry['form_id']})")
    print(f"Requested CP: {requested_cp}")
    if not candidates:
        print("No solution")
        return

    candidates.sort(key=ranking_key)
    if used_fallback:
        nearby_values = sorted({candidate.calculated_cp for candidate in candidates})
        print(
            "Warning: no exact solution was found. Showing solutions for "
            + " and ".join(f"CP {cp}" for cp in nearby_values)
            + " instead."
        )

    best = candidates[0]
    preferred_note = " [preferred encounter level]" if best.preferred_level else ""
    print(
        f"Best guess: level {best.level:g}, "
        f"IVs {best.attack_iv}/{best.defense_iv}/{best.stamina_iv} "
        f"({best.iv_percent:.1f}%), calculated CP {best.calculated_cp}"
        f"{preferred_note}"
    )
    print(f"Possible combinations: {len(candidates):,}")

    shown = candidates if limit is None else candidates[:limit]
    print("\nRank  Level   Atk/Def/HP    IV%   Calc CP  Note")
    for rank, candidate in enumerate(shown, 1):
        note_parts = []
        if candidate.preferred_level:
            note_parts.append("encounter level")
        if candidate.cp_difference:
            note_parts.append(f"{candidate.cp_difference:+d} from requested")
        print(
            f"{rank:>4}  {candidate.level:>5g}   "
            f"{candidate.attack_iv:>2}/{candidate.defense_iv:>2}/{candidate.stamina_iv:>2}"
            f"     {candidate.iv_percent:>5.1f}%"
            f"   {candidate.calculated_cp:>7}  {', '.join(note_parts)}"
        )
    if limit is not None and len(candidates) > limit:
        print(f"... {len(candidates) - limit:,} more; rerun with --all to display them.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("species", nargs="?", help="display name, ID, or form_id")
    parser.add_argument("cp", nargs="?", type=int, help="displayed CP")
    parser.add_argument(
        "--max-level", type=float, default=DEFAULT_MAX_LEVEL,
        help=f"highest half-level to search (default: {DEFAULT_MAX_LEVEL:g})",
    )
    output = parser.add_mutually_exclusive_group()
    output.add_argument("--limit", type=int, default=20, help="rows to display (default: 20)")
    output.add_argument("--all", action="store_true", help="display every possible combination")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    species_query = args.species or input("Pokémon species/form: ").strip()
    if args.cp is None:
        try:
            requested_cp = int(input("Displayed CP: ").strip())
        except ValueError as error:
            raise SystemExit("CP must be a positive integer") from error
    else:
        requested_cp = args.cp

    if requested_cp <= 0:
        raise SystemExit("CP must be a positive integer")
    if not 1 <= args.max_level <= 55 or args.max_level * 2 != round(args.max_level * 2):
        raise SystemExit("--max-level must be a half-level from 1 through 55")
    if args.limit is not None and args.limit <= 0:
        raise SystemExit("--limit must be positive")

    entry = resolve_species(load_data(DATA_PATH), species_query)
    candidates, used_fallback = find_with_cp_chaos_fallback(
        entry, requested_cp, args.max_level,
    )
    print_candidates(
        entry, requested_cp, candidates, used_fallback,
        None if args.all else args.limit,
    )


if __name__ == "__main__":
    main()
