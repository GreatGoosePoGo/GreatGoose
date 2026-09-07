"""Core Pokémon collection, CP inference, and SQLite persistence for the bot."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
import sqlite3

from pokemon_cp_iv_guesser import (
    CPM_BY_HALF_LEVEL,
    DATA_PATH,
    calculate_cp,
    find_with_cp_chaos_fallback,
    load_data,
    normalized,
    ranking_key,
    resolve_species,
)


MAX_LEVEL = 55.0
CATALOG = load_data(DATA_PATH)
CATALOG_BY_FORM_ID = {entry["form_id"]: entry for entry in CATALOG}


class PokemonInputError(ValueError):
    """A user-facing validation error."""


@dataclass(frozen=True)
class PokemonRecord:
    species_form_id: str
    species_name: str
    fast_move: str
    charged_move: str
    cp: int
    formula_cp: int
    level: float
    attack_iv: int
    defense_iv: int
    stamina_iv: int
    slot: int | None = None

    @property
    def iv_percent(self) -> float:
        return 100 * (self.attack_iv + self.defense_iv + self.stamina_iv) / 45

    @property
    def has_cp_chaos_warning(self) -> bool:
        return self.cp != self.formula_cp


@dataclass(frozen=True)
class BuildResult:
    pokemon: PokemonRecord
    notices: tuple[str, ...] = ()


def resolve_species_for_user(query: str) -> dict:
    try:
        return resolve_species(CATALOG, query)
    except SystemExit as error:
        raise PokemonInputError(str(error)) from None


def player_move_pool(entry: dict, pool_name: str) -> tuple[dict, ...]:
    """Return every move a player-owned Pokemon may legitimately know.

    The calculator's ordinary pools already include Elite-TM/legacy attacks.
    True exclusives such as fusion moves live in separate fields because they
    are valid for player Pokemon but must never enter a raid boss's move pool.
    """
    exclusive_pool_name = f"exclusive_{pool_name}"
    combined = (*entry.get(pool_name, ()), *entry.get(exclusive_pool_name, ()))
    unique: dict[str, dict] = {}
    for move in combined:
        unique.setdefault(normalized(move["name"]), move)
    return tuple(unique.values())


def resolve_move(entry: dict, query: str, pool_name: str) -> str:
    pool = player_move_pool(entry, pool_name)
    wanted = normalized(query)
    matches = {
        move["name"] for move in pool if normalized(move["name"]) == wanted
    }
    if len(matches) == 1:
        return next(iter(matches))
    kind = "fast" if pool_name == "fast_moves" else "charged"
    available = ", ".join(move["name"] for move in pool)
    raise PokemonInputError(
        f"{query!r} is not a {kind} move for {entry['name']}. "
        f"Available: {available}"
    )


def validate_level_and_ivs(
    level: float,
    attack_iv: int,
    defense_iv: int,
    stamina_iv: int,
) -> None:
    if (
        not 1 <= level <= MAX_LEVEL
        or abs(level * 2 - round(level * 2)) > 1e-9
        or round(level * 2) not in CPM_BY_HALF_LEVEL
    ):
        raise PokemonInputError("Level must be a half-level from 1 through 55.")
    for label, value in (
        ("Attack IV", attack_iv),
        ("Defense IV", defense_iv),
        ("Stamina IV", stamina_iv),
    ):
        if isinstance(value, bool) or not 0 <= value <= 15:
            raise PokemonInputError(f"{label} must be an integer from 0 through 15.")


def cp_from_stats(
    entry: dict,
    level: float,
    attack_iv: int,
    defense_iv: int,
    stamina_iv: int,
) -> int:
    validate_level_and_ivs(level, attack_iv, defense_iv, stamina_iv)
    stats = entry["stats"]
    return calculate_cp(
        int(stats["attack"]),
        int(stats["defense"]),
        int(stats["stamina"]),
        attack_iv,
        defense_iv,
        stamina_iv,
        CPM_BY_HALF_LEVEL[round(level * 2)],
    )


@lru_cache(maxsize=4096)
def infer_from_cp(form_id: str, requested_cp: int):
    """Return the ranked immutable candidate tuple and fallback status."""
    if requested_cp < 10:
        raise PokemonInputError("CP must be at least 10.")
    entry = CATALOG_BY_FORM_ID[form_id]
    candidates, used_fallback = find_with_cp_chaos_fallback(
        entry, requested_cp, MAX_LEVEL
    )
    candidates.sort(key=ranking_key)
    return tuple(candidates), used_fallback


def infer_stats(entry: dict, requested_cp: int) -> tuple[PokemonRecord, tuple[str, ...]]:
    candidates, used_fallback = infer_from_cp(entry["form_id"], requested_cp)
    if not candidates:
        raise PokemonInputError(
            f"No solution for CP {requested_cp}, including CP {requested_cp - 1} "
            f"and CP {requested_cp + 1}."
        )
    best = candidates[0]
    notices = [
        f"Selected the highest-ranked of {len(candidates):,} possible "
        f"level/IV combination{'s' if len(candidates) != 1 else ''}."
    ]
    if used_fallback:
        nearby = "/".join(str(value) for value in sorted(
            {candidate.calculated_cp for candidate in candidates}
        ))
        notices.append(
            f"⚠️ Potential CP chaos: CP {requested_cp} had no exact solution; "
            f"the selected level/IVs calculate to CP {best.calculated_cp} "
            f"(nearby solutions found at {nearby})."
        )
    placeholder = PokemonRecord(
        species_form_id=entry["form_id"],
        species_name=entry["name"],
        fast_move="",
        charged_move="",
        cp=requested_cp,
        formula_cp=best.calculated_cp,
        level=best.level,
        attack_iv=best.attack_iv,
        defense_iv=best.defense_iv,
        stamina_iv=best.stamina_iv,
    )
    return placeholder, tuple(notices)


def validate_supplied_cp(
    requested_cp: int,
    formula_cp: int,
) -> tuple[str, ...]:
    if requested_cp < 10:
        raise PokemonInputError("CP must be at least 10.")
    difference = formula_cp - requested_cp
    if difference == 0:
        return ()
    if abs(difference) == 1:
        return (
            f"⚠️ Potential CP chaos: the supplied level/IVs calculate to "
            f"CP {formula_cp}, {difference:+d} from the displayed CP {requested_cp}.",
        )
    raise PokemonInputError(
        f"The supplied level/IVs calculate to CP {formula_cp}, not CP "
        f"{requested_cp}. The difference is greater than the ±1 CP-chaos allowance."
    )


def build_new_pokemon(
    *,
    species: str,
    fast_move: str,
    charged_move: str,
    cp: int | None,
    level: float | None,
    attack_iv: int | None,
    defense_iv: int | None,
    stamina_iv: int | None,
) -> BuildResult:
    entry = resolve_species_for_user(species)
    canonical_fast = resolve_move(entry, fast_move, "fast_moves")
    canonical_charged = resolve_move(entry, charged_move, "charged_moves")
    details = (level, attack_iv, defense_iv, stamina_iv)
    supplied_details = sum(value is not None for value in details)

    if cp is None and supplied_details == 0:
        raise PokemonInputError(
            "Supply CP, or supply level together with all three IVs."
        )
    if supplied_details not in (0, 4):
        raise PokemonInputError(
            "Level, Attack IV, Defense IV, and Stamina IV must be supplied together."
        )

    notices: tuple[str, ...]
    if supplied_details == 0:
        assert cp is not None
        inferred, notices = infer_stats(entry, cp)
        record = PokemonRecord(
            **{
                **inferred.__dict__,
                "fast_move": canonical_fast,
                "charged_move": canonical_charged,
            }
        )
    else:
        assert level is not None
        assert attack_iv is not None and defense_iv is not None and stamina_iv is not None
        formula_cp = cp_from_stats(entry, level, attack_iv, defense_iv, stamina_iv)
        observed_cp = formula_cp if cp is None else cp
        notices = validate_supplied_cp(observed_cp, formula_cp)
        record = PokemonRecord(
            entry["form_id"], entry["name"], canonical_fast, canonical_charged,
            observed_cp, formula_cp, level, attack_iv, defense_iv, stamina_iv,
        )
    return BuildResult(record, notices)


def build_edited_pokemon(
    existing: PokemonRecord,
    *,
    species: str | None,
    fast_move: str | None,
    charged_move: str | None,
    cp: int | None,
    level: float | None,
    attack_iv: int | None,
    defense_iv: int | None,
    stamina_iv: int | None,
) -> BuildResult:
    entry = (
        resolve_species_for_user(species)
        if species is not None
        else CATALOG_BY_FORM_ID[existing.species_form_id]
    )
    canonical_fast = resolve_move(
        entry, fast_move if fast_move is not None else existing.fast_move,
        "fast_moves",
    )
    canonical_charged = resolve_move(
        entry, charged_move if charged_move is not None else existing.charged_move,
        "charged_moves",
    )
    supplied_stat_detail = any(
        value is not None for value in (level, attack_iv, defense_iv, stamina_iv)
    )

    if cp is not None and not supplied_stat_detail:
        inferred, notices = infer_stats(entry, cp)
        updated = PokemonRecord(
            entry["form_id"], entry["name"], canonical_fast, canonical_charged,
            inferred.cp, inferred.formula_cp, inferred.level,
            inferred.attack_iv, inferred.defense_iv, inferred.stamina_iv,
            existing.slot,
        )
        return BuildResult(updated, notices)

    merged_level = existing.level if level is None else level
    merged_attack = existing.attack_iv if attack_iv is None else attack_iv
    merged_defense = existing.defense_iv if defense_iv is None else defense_iv
    merged_stamina = existing.stamina_iv if stamina_iv is None else stamina_iv

    if supplied_stat_detail or species is not None:
        formula_cp = cp_from_stats(
            entry, merged_level, merged_attack, merged_defense, merged_stamina
        )
        observed_cp = formula_cp if cp is None else cp
        notices = validate_supplied_cp(observed_cp, formula_cp)
    else:
        formula_cp = existing.formula_cp
        observed_cp = existing.cp
        notices = ()

    updated = PokemonRecord(
        entry["form_id"], entry["name"], canonical_fast, canonical_charged,
        observed_cp, formula_cp, merged_level, merged_attack, merged_defense,
        merged_stamina, existing.slot,
    )
    return BuildResult(updated, notices)


class PokemonStore:
    """Small per-user SQLite collection with contiguous, shifting IDs."""

    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.execute("""
                CREATE TABLE IF NOT EXISTS pokemon (
                    user_id TEXT NOT NULL,
                    slot INTEGER NOT NULL,
                    species_form_id TEXT NOT NULL,
                    species_name TEXT NOT NULL,
                    fast_move TEXT NOT NULL,
                    charged_move TEXT NOT NULL,
                    cp INTEGER NOT NULL,
                    formula_cp INTEGER NOT NULL,
                    level REAL NOT NULL,
                    attack_iv INTEGER NOT NULL,
                    defense_iv INTEGER NOT NULL,
                    stamina_iv INTEGER NOT NULL,
                    PRIMARY KEY (user_id, slot)
                )
            """)
            connection.execute("""
                CREATE TABLE IF NOT EXISTS trusted_users (
                    owner_id TEXT NOT NULL,
                    trusted_user_id TEXT NOT NULL,
                    PRIMARY KEY (owner_id, trusted_user_id)
                )
            """)
            connection.execute("""
                CREATE TABLE IF NOT EXISTS trust_settings (
                    owner_id TEXT PRIMARY KEY,
                    trust_everyone INTEGER NOT NULL DEFAULT 0
                        CHECK (trust_everyone IN (0, 1))
                )
            """)

    @staticmethod
    def _from_row(row: sqlite3.Row) -> PokemonRecord:
        return PokemonRecord(
            species_form_id=row["species_form_id"],
            species_name=row["species_name"],
            fast_move=row["fast_move"],
            charged_move=row["charged_move"],
            cp=row["cp"],
            formula_cp=row["formula_cp"],
            level=row["level"],
            attack_iv=row["attack_iv"],
            defense_iv=row["defense_iv"],
            stamina_iv=row["stamina_iv"],
            slot=row["slot"],
        )

    @staticmethod
    def _values(user_id: str, pokemon: PokemonRecord, slot: int) -> tuple:
        return (
            user_id, slot, pokemon.species_form_id, pokemon.species_name,
            pokemon.fast_move, pokemon.charged_move, pokemon.cp,
            pokemon.formula_cp, pokemon.level, pokemon.attack_iv,
            pokemon.defense_iv, pokemon.stamina_iv,
        )

    def list_for_user(self, user_id: int | str) -> list[PokemonRecord]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM pokemon WHERE user_id = ? ORDER BY slot",
                (str(user_id),),
            ).fetchall()
        return [self._from_row(row) for row in rows]

    def get(self, user_id: int | str, slot: int) -> PokemonRecord | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM pokemon WHERE user_id = ? AND slot = ?",
                (str(user_id), slot),
            ).fetchone()
        return self._from_row(row) if row else None

    def add(self, user_id: int | str, pokemon: PokemonRecord) -> PokemonRecord:
        user = str(user_id)
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            slot = connection.execute(
                "SELECT COALESCE(MAX(slot), 0) + 1 FROM pokemon WHERE user_id = ?",
                (user,),
            ).fetchone()[0]
            connection.execute(
                "INSERT INTO pokemon VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                self._values(user, pokemon, slot),
            )
        return PokemonRecord(**{**pokemon.__dict__, "slot": slot})

    def add_many(
        self,
        user_id: int | str,
        pokemon: list[PokemonRecord] | tuple[PokemonRecord, ...],
    ) -> list[PokemonRecord]:
        """Append a party atomically, assigning consecutive Pokebox IDs."""
        if not pokemon:
            return []
        user = str(user_id)
        stored: list[PokemonRecord] = []
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            first_slot = connection.execute(
                "SELECT COALESCE(MAX(slot), 0) + 1 FROM pokemon WHERE user_id = ?",
                (user,),
            ).fetchone()[0]
            for offset, record in enumerate(pokemon):
                slot = first_slot + offset
                connection.execute(
                    "INSERT INTO pokemon VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    self._values(user, record, slot),
                )
                stored.append(PokemonRecord(**{**record.__dict__, "slot": slot}))
        return stored

    def update(self, user_id: int | str, pokemon: PokemonRecord) -> bool:
        if pokemon.slot is None:
            raise ValueError("An updated Pokémon must have a slot")
        values = self._values(str(user_id), pokemon, pokemon.slot)
        with self._connect() as connection:
            cursor = connection.execute("""
                UPDATE pokemon SET
                    species_form_id = ?, species_name = ?, fast_move = ?,
                    charged_move = ?, cp = ?, formula_cp = ?, level = ?,
                    attack_iv = ?, defense_iv = ?, stamina_iv = ?
                WHERE user_id = ? AND slot = ?
            """, (*values[2:], values[0], values[1]))
        return cursor.rowcount == 1

    def remove(self, user_id: int | str, slot: int) -> PokemonRecord | None:
        user = str(user_id)
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT * FROM pokemon WHERE user_id = ? AND slot = ?",
                (user, slot),
            ).fetchone()
            if row is None:
                return None
            removed = self._from_row(row)
            connection.execute(
                "DELETE FROM pokemon WHERE user_id = ? AND slot = ?",
                (user, slot),
            )
            # Two phases avoid transient UNIQUE collisions while IDs shift.
            offset = 1_000_000_000
            connection.execute(
                "UPDATE pokemon SET slot = slot + ? "
                "WHERE user_id = ? AND slot > ?",
                (offset, user, slot),
            )
            connection.execute(
                "UPDATE pokemon SET slot = slot - ? - 1 "
                "WHERE user_id = ? AND slot > ?",
                (offset, user, offset),
            )
        return removed

    def add_trusted_user(
        self,
        owner_id: int | str,
        trusted_user_id: int | str,
    ) -> bool:
        """Trust one user; return False when that relationship already exists."""
        with self._connect() as connection:
            cursor = connection.execute(
                "INSERT OR IGNORE INTO trusted_users "
                "(owner_id, trusted_user_id) VALUES (?, ?)",
                (str(owner_id), str(trusted_user_id)),
            )
        return cursor.rowcount == 1

    def remove_trusted_user(
        self,
        owner_id: int | str,
        trusted_user_id: int | str,
    ) -> bool:
        with self._connect() as connection:
            cursor = connection.execute(
                "DELETE FROM trusted_users "
                "WHERE owner_id = ? AND trusted_user_id = ?",
                (str(owner_id), str(trusted_user_id)),
            )
        return cursor.rowcount == 1

    def list_trusted_users(self, owner_id: int | str) -> list[str]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT trusted_user_id FROM trusted_users "
                "WHERE owner_id = ? ORDER BY trusted_user_id",
                (str(owner_id),),
            ).fetchall()
        return [row[0] for row in rows]

    def set_trust_everyone(self, owner_id: int | str, enabled: bool) -> None:
        with self._connect() as connection:
            connection.execute("""
                INSERT INTO trust_settings (owner_id, trust_everyone)
                VALUES (?, ?)
                ON CONFLICT(owner_id) DO UPDATE SET
                    trust_everyone = excluded.trust_everyone
            """, (str(owner_id), int(enabled)))

    def trusts_everyone(self, owner_id: int | str) -> bool:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT trust_everyone FROM trust_settings WHERE owner_id = ?",
                (str(owner_id),),
            ).fetchone()
        return bool(row[0]) if row else False

    def reset_trust(self, owner_id: int | str) -> None:
        """Clear specific trusted users and turn off trust-everyone."""
        owner = str(owner_id)
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "DELETE FROM trusted_users WHERE owner_id = ?", (owner,)
            )
            connection.execute(
                "DELETE FROM trust_settings WHERE owner_id = ?", (owner,)
            )

    def can_modify(
        self,
        owner_id: int | str,
        actor_id: int | str,
        *,
        is_superuser: bool = False,
    ) -> bool:
        owner = str(owner_id)
        actor = str(actor_id)
        if owner == actor or is_superuser:
            return True
        with self._connect() as connection:
            trusts_everyone = connection.execute(
                "SELECT trust_everyone FROM trust_settings WHERE owner_id = ?",
                (owner,),
            ).fetchone()
            if trusts_everyone and trusts_everyone[0]:
                return True
            relationship = connection.execute(
                "SELECT 1 FROM trusted_users "
                "WHERE owner_id = ? AND trusted_user_id = ?",
                (owner, actor),
            ).fetchone()
        return relationship is not None


def format_pokemon(pokemon: PokemonRecord) -> str:
    warning = (
        f" ⚠️ formula CP {pokemon.formula_cp}"
        if pokemon.has_cp_chaos_warning else ""
    )
    return (
        f"**#{pokemon.slot} · {pokemon.species_name}** — "
        f"{pokemon.fast_move} / {pokemon.charged_move}\n"
        f"CP {pokemon.cp}{warning} · L{pokemon.level:g} · "
        f"IVs {pokemon.attack_iv}/{pokemon.defense_iv}/{pokemon.stamina_iv} "
        f"({pokemon.iv_percent:.1f}%)"
    )
