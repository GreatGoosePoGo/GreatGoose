"""Persistent Discord raid drafts and simulator configuration helpers."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import sqlite3

from pokemon_collection import PokemonInputError, PokemonStore


RAID_DIFFICULTIES = (
    "Tier 1", "Tier 3", "Tier 4", "Tier 5", "Mega", "Mega Legendary",
    "Super Mega", "Elite", "Primal", "Tier 1 Shadow", "Tier 3 Shadow",
    "Tier 5 Shadow",
)
WEATHERS = (
    "None", "Sunny/Clear", "Rainy", "Partly Cloudy", "Cloudy", "Windy",
    "Snow", "Fog",
)
DODGE_STRATEGIES = (
    "none", "all_survivable", "super_effective", "non_resisted",
    "lethal_only", "downtime_saver",
)
MAX_RAID_PLAYERS = 20
MAX_TEAM_SIZE = 6
MAX_TRIALS = 5_000


@dataclass(frozen=True)
class RaidPreset:
    preset_id: int
    name: str
    boss_form_id: str
    difficulty: str
    manual_profile: dict | None
    enabled: bool


@dataclass(frozen=True)
class RaidDraft:
    raid_id: int
    guild_id: str
    creator_id: str
    boss_form_id: str
    difficulty: str
    weather: str | None
    boosted_party_power: bool
    dodge_strategy: str
    trials: int
    preset_id: int | None
    manual_profile: dict | None


@dataclass(frozen=True)
class RaidParticipant:
    raid_id: int
    position: int
    user_id: str
    friendship: float
    zacian_effect: bool
    party_group: int
    team_ids: tuple[int, ...] | None


class RaidStore:
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
                CREATE TABLE IF NOT EXISTS raid_presets (
                    preset_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    boss_form_id TEXT NOT NULL,
                    difficulty TEXT NOT NULL,
                    manual_profile_json TEXT,
                    enabled INTEGER NOT NULL DEFAULT 1
                        CHECK (enabled IN (0, 1))
                )
            """)
            connection.execute("""
                CREATE TABLE IF NOT EXISTS raid_drafts (
                    raid_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    guild_id TEXT NOT NULL,
                    creator_id TEXT NOT NULL,
                    boss_form_id TEXT NOT NULL,
                    difficulty TEXT NOT NULL,
                    weather TEXT,
                    boosted_party_power INTEGER NOT NULL DEFAULT 0
                        CHECK (boosted_party_power IN (0, 1)),
                    dodge_strategy TEXT NOT NULL,
                    trials INTEGER NOT NULL,
                    preset_id INTEGER,
                    manual_profile_json TEXT,
                    FOREIGN KEY (preset_id) REFERENCES raid_presets(preset_id)
                        ON DELETE SET NULL
                )
            """)
            connection.execute("""
                CREATE TABLE IF NOT EXISTS raid_participants (
                    raid_id INTEGER NOT NULL,
                    position INTEGER NOT NULL,
                    user_id TEXT NOT NULL,
                    friendship REAL NOT NULL,
                    zacian_effect INTEGER NOT NULL DEFAULT 0
                        CHECK (zacian_effect IN (0, 1)),
                    party_group INTEGER NOT NULL DEFAULT 0,
                    team_ids_json TEXT,
                    PRIMARY KEY (raid_id, user_id),
                    UNIQUE (raid_id, position),
                    FOREIGN KEY (raid_id) REFERENCES raid_drafts(raid_id)
                        ON DELETE CASCADE
                )
            """)

    @staticmethod
    def _profile(raw: str | None) -> dict | None:
        return json.loads(raw) if raw else None

    @staticmethod
    def _preset(row: sqlite3.Row) -> RaidPreset:
        return RaidPreset(
            row["preset_id"], row["name"], row["boss_form_id"],
            row["difficulty"], RaidStore._profile(row["manual_profile_json"]),
            bool(row["enabled"]),
        )

    @staticmethod
    def _draft(row: sqlite3.Row) -> RaidDraft:
        return RaidDraft(
            row["raid_id"], row["guild_id"], row["creator_id"],
            row["boss_form_id"], row["difficulty"], row["weather"],
            bool(row["boosted_party_power"]), row["dodge_strategy"],
            row["trials"], row["preset_id"],
            RaidStore._profile(row["manual_profile_json"]),
        )

    @staticmethod
    def _participant(row: sqlite3.Row) -> RaidParticipant:
        raw_ids = row["team_ids_json"]
        return RaidParticipant(
            row["raid_id"], row["position"], row["user_id"],
            row["friendship"], bool(row["zacian_effect"]), row["party_group"],
            tuple(json.loads(raw_ids)) if raw_ids else None,
        )

    def add_preset(
        self, name: str, boss_form_id: str, difficulty: str,
        manual_profile: dict | None = None,
    ) -> RaidPreset:
        validate_difficulty(difficulty)
        if not name.strip():
            raise PokemonInputError("Preset name cannot be empty.")
        try:
            with self._connect() as connection:
                cursor = connection.execute(
                    "INSERT INTO raid_presets "
                    "(name, boss_form_id, difficulty, manual_profile_json) "
                    "VALUES (?, ?, ?, ?)",
                    (name.strip(), boss_form_id, difficulty,
                     json.dumps(manual_profile) if manual_profile else None),
                )
                preset_id = cursor.lastrowid
        except sqlite3.IntegrityError as error:
            raise PokemonInputError(f"A raid preset named {name!r} already exists.") from error
        assert preset_id is not None
        return self.get_preset(preset_id, include_disabled=True)  # type: ignore[return-value]

    def get_preset(self, preset_id: int, *, include_disabled: bool = False) -> RaidPreset | None:
        where = "preset_id = ?" if include_disabled else "preset_id = ? AND enabled = 1"
        with self._connect() as connection:
            row = connection.execute(
                f"SELECT * FROM raid_presets WHERE {where}", (preset_id,)
            ).fetchone()
        return self._preset(row) if row else None

    def list_presets(self, *, include_disabled: bool = False) -> list[RaidPreset]:
        where = "" if include_disabled else "WHERE enabled = 1"
        with self._connect() as connection:
            rows = connection.execute(
                f"SELECT * FROM raid_presets {where} ORDER BY name COLLATE NOCASE"
            ).fetchall()
        return [self._preset(row) for row in rows]

    def edit_preset(
        self, preset_id: int, *, name: str | None = None,
        difficulty: str | None = None, enabled: bool | None = None,
    ) -> RaidPreset | None:
        existing = self.get_preset(preset_id, include_disabled=True)
        if existing is None:
            return None
        if difficulty is not None:
            validate_difficulty(difficulty)
        values = (
            existing.name if name is None else name.strip(),
            existing.difficulty if difficulty is None else difficulty,
            int(existing.enabled if enabled is None else enabled), preset_id,
        )
        if not values[0]:
            raise PokemonInputError("Preset name cannot be empty.")
        try:
            with self._connect() as connection:
                connection.execute(
                    "UPDATE raid_presets SET name=?, difficulty=?, enabled=? "
                    "WHERE preset_id=?", values,
                )
        except sqlite3.IntegrityError as error:
            raise PokemonInputError(f"A raid preset named {values[0]!r} already exists.") from error
        return self.get_preset(preset_id, include_disabled=True)

    def remove_preset(self, preset_id: int) -> bool:
        with self._connect() as connection:
            cursor = connection.execute(
                "DELETE FROM raid_presets WHERE preset_id = ?", (preset_id,)
            )
        return cursor.rowcount == 1

    def create_draft(
        self, guild_id: int | str, creator_id: int | str, boss_form_id: str,
        difficulty: str, weather: str | None, boosted_party_power: bool,
        dodge_strategy: str, trials: int, *, preset_id: int | None = None,
        manual_profile: dict | None = None,
    ) -> RaidDraft:
        validate_raid_settings(difficulty, weather, dodge_strategy, trials)
        with self._connect() as connection:
            cursor = connection.execute("""
                INSERT INTO raid_drafts
                    (guild_id, creator_id, boss_form_id, difficulty, weather,
                     boosted_party_power, dodge_strategy, trials, preset_id,
                     manual_profile_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                str(guild_id), str(creator_id), boss_form_id, difficulty, weather,
                int(boosted_party_power), dodge_strategy, trials, preset_id,
                json.dumps(manual_profile) if manual_profile else None,
            ))
            raid_id = cursor.lastrowid
        assert raid_id is not None
        return self.get_draft(guild_id, raid_id)  # type: ignore[return-value]

    def get_draft(self, guild_id: int | str, raid_id: int) -> RaidDraft | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM raid_drafts WHERE guild_id = ? AND raid_id = ?",
                (str(guild_id), raid_id),
            ).fetchone()
        return self._draft(row) if row else None

    def update_draft(
        self, guild_id: int | str, raid_id: int, *,
        difficulty: str | None = None, weather: str | None | object = ...,
        boosted_party_power: bool | None = None,
        dodge_strategy: str | None = None, trials: int | None = None,
    ) -> RaidDraft | None:
        existing = self.get_draft(guild_id, raid_id)
        if existing is None:
            return None
        new_weather = existing.weather if weather is ... else weather
        values = (
            existing.difficulty if difficulty is None else difficulty,
            new_weather,
            int(existing.boosted_party_power if boosted_party_power is None else boosted_party_power),
            existing.dodge_strategy if dodge_strategy is None else dodge_strategy,
            existing.trials if trials is None else trials,
        )
        validate_raid_settings(values[0], values[1], values[3], values[4])
        with self._connect() as connection:
            connection.execute("""
                UPDATE raid_drafts SET difficulty=?, weather=?,
                    boosted_party_power=?, dodge_strategy=?, trials=?
                WHERE guild_id=? AND raid_id=?
            """, (*values, str(guild_id), raid_id))
        return self.get_draft(guild_id, raid_id)

    def delete_draft(self, guild_id: int | str, raid_id: int) -> bool:
        with self._connect() as connection:
            cursor = connection.execute(
                "DELETE FROM raid_drafts WHERE guild_id = ? AND raid_id = ?",
                (str(guild_id), raid_id),
            )
        return cursor.rowcount == 1

    def list_participants(self, raid_id: int) -> list[RaidParticipant]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM raid_participants WHERE raid_id = ? ORDER BY position",
                (raid_id,),
            ).fetchall()
        return [self._participant(row) for row in rows]

    def upsert_participant(
        self, raid_id: int, user_id: int | str, friendship: float,
        zacian_effect: bool, party_group: int, team_ids: tuple[int, ...] | None,
    ) -> RaidParticipant:
        validate_participant_settings(friendship, party_group, team_ids)
        user = str(user_id)
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute(
                "SELECT position FROM raid_participants WHERE raid_id=? AND user_id=?",
                (raid_id, user),
            ).fetchone()
            if existing:
                position = existing[0]
                connection.execute("""
                    UPDATE raid_participants SET friendship=?, zacian_effect=?,
                        party_group=?, team_ids_json=?
                    WHERE raid_id=? AND user_id=?
                """, (
                    friendship, int(zacian_effect), party_group,
                    json.dumps(team_ids) if team_ids else None, raid_id, user,
                ))
            else:
                count = connection.execute(
                    "SELECT COUNT(*) FROM raid_participants WHERE raid_id=?", (raid_id,)
                ).fetchone()[0]
                if count >= MAX_RAID_PLAYERS:
                    raise PokemonInputError(f"A raid supports at most {MAX_RAID_PLAYERS} players.")
                position = connection.execute(
                    "SELECT COALESCE(MAX(position), 0) + 1 FROM raid_participants "
                    "WHERE raid_id=?", (raid_id,),
                ).fetchone()[0]
                connection.execute("""
                    INSERT INTO raid_participants
                        (raid_id, position, user_id, friendship, zacian_effect,
                         party_group, team_ids_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    raid_id, position, user, friendship, int(zacian_effect),
                    party_group, json.dumps(team_ids) if team_ids else None,
                ))
            row = connection.execute(
                "SELECT * FROM raid_participants WHERE raid_id=? AND user_id=?",
                (raid_id, user),
            ).fetchone()
        assert row is not None
        return self._participant(row)

    def remove_participant(self, raid_id: int, user_id: int | str) -> bool:
        user = str(user_id)
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT position FROM raid_participants WHERE raid_id=? AND user_id=?",
                (raid_id, user),
            ).fetchone()
            if row is None:
                return False
            position = row[0]
            connection.execute(
                "DELETE FROM raid_participants WHERE raid_id=? AND user_id=?",
                (raid_id, user),
            )
            connection.execute(
                "UPDATE raid_participants SET position=position-1 "
                "WHERE raid_id=? AND position>?", (raid_id, position),
            )
        return True


def validate_difficulty(difficulty: str) -> None:
    if difficulty not in RAID_DIFFICULTIES:
        raise PokemonInputError(f"Unknown raid difficulty {difficulty!r}.")


def validate_raid_settings(
    difficulty: str, weather: str | None, dodge_strategy: str, trials: int,
) -> None:
    validate_difficulty(difficulty)
    if weather is not None and weather not in WEATHERS[1:]:
        raise PokemonInputError(f"Unknown weather {weather!r}.")
    if dodge_strategy not in DODGE_STRATEGIES:
        raise PokemonInputError(f"Unknown dodge strategy {dodge_strategy!r}.")
    if isinstance(trials, bool) or not 1 <= trials <= MAX_TRIALS:
        raise PokemonInputError(f"Trials must be from 1 through {MAX_TRIALS:,}.")


def validate_participant_settings(
    friendship: float, party_group: int, team_ids: tuple[int, ...] | None,
) -> None:
    if not 1.0 <= friendship <= 1.2:
        raise PokemonInputError("Friendship multiplier must be from 1.0 through 1.2.")
    if isinstance(party_group, bool) or not 0 <= party_group <= 20:
        raise PokemonInputError("Party group must be 0 (none) or a positive number.")
    if team_ids is not None:
        if not 1 <= len(team_ids) <= MAX_TEAM_SIZE:
            raise PokemonInputError("Select from one through six Pokémon IDs.")
        if len(team_ids) != len(set(team_ids)) or any(value <= 0 for value in team_ids):
            raise PokemonInputError("Team IDs must be unique positive numbers.")


def parse_team_ids(raw: str | None) -> tuple[int, ...] | None:
    if raw is None or not raw.strip():
        return None
    tokens = raw.replace(",", " ").split()
    if any(not token.isdecimal() for token in tokens):
        raise PokemonInputError("Team IDs must be numbers separated by commas or spaces.")
    result = tuple(map(int, tokens))
    validate_participant_settings(1.0, 0, result)
    return result


def build_simulator_config(
    draft: RaidDraft, participants: list[RaidParticipant],
    pokemon_store: PokemonStore,
) -> tuple[dict, list[list[str]]]:
    if not participants:
        raise PokemonInputError("Add at least one player before running the raid.")
    if draft.difficulty == "Super Mega" and len(participants) < 3:
        raise PokemonInputError("Super Mega raids require at least three players.")

    player_teams: list[list[list[object]]] = []
    team_labels: list[list[str]] = []
    for participant in participants:
        collection = pokemon_store.list_for_user(participant.user_id)
        if not collection:
            raise PokemonInputError(f"<@{participant.user_id}>'s Pokébox is empty.")
        ids = participant.team_ids or tuple(range(1, min(6, len(collection)) + 1))
        by_slot = {record.slot: record for record in collection}
        missing = [slot for slot in ids if slot not in by_slot]
        if missing:
            raise PokemonInputError(
                f"<@{participant.user_id}> no longer has Pokébox IDs {missing}."
            )
        chosen = [by_slot[slot] for slot in ids]
        player_teams.append([
            [
                record.species_name, record.fast_move, record.charged_move,
                record.level, record.attack_iv, record.defense_iv,
                record.stamina_iv,
            ]
            for record in chosen
        ])
        team_labels.append([f"#{record.slot} {record.species_name}" for record in chosen])

    groups: dict[int, list[int]] = {}
    for index, participant in enumerate(participants):
        if participant.party_group:
            groups.setdefault(participant.party_group, []).append(index)
    invalid_groups = {
        group: len(members) for group, members in groups.items()
        if len(members) not in (2, 3, 4)
    }
    if invalid_groups:
        details = ", ".join(f"group {key}: {size}" for key, size in invalid_groups.items())
        raise PokemonInputError(f"Party Power groups must contain 2–4 players ({details}).")

    config = {
        "trials": draft.trials,
        "raid_difficulty": draft.difficulty,
        "player_teams": player_teams,
        "party_power_groups": list(groups.values()),
        "boosted_party_power": draft.boosted_party_power,
        "friendship_multipliers": [p.friendship for p in participants],
        "zacian_adventure_effect": [p.zacian_effect for p in participants],
        "weather": draft.weather,
        "boss_form_id": draft.boss_form_id,
        "boss_manual_profile": draft.manual_profile,
        "boss_fast_move_names": [],
        "boss_charged_move_names": [],
        "boss_move_display_names": {},
        "dodge_strategy": draft.dodge_strategy,
    }
    return config, team_labels
