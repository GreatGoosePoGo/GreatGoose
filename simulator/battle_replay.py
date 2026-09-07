"""Parser for Great Goose's compact, hand-written battle replay format.

Timestamps become integer half-second ticks. Combat reconstruction lives in
battle_playback.py, which reuses the simulation engine's battle mechanics.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
import re
from typing import Any


EVENT_RE = re.compile(
    r"^(?P<time>t\d+(?:\.\d+)?|\+\d+(?:\.\d+)?)"
    r"(?P<actor>b|p\d+(?:,\d+)*):"
    r"(?P<action>[A-Za-z][A-Za-z0-9_+\-]*)$"
)
PLAYER_LINE_RE = re.compile(r"^p(?P<player>\d+)\s*:\s*(?P<team>.+)$", re.I)
ASSIGNMENT_RE = re.compile(r"^p(?P<player>\d+)\s*=\s*(?P<value>.+)$", re.I)
MOVE_CODE_RE = re.compile(r"^[a-z][a-z0-9_+\-]*$")


class ReplayParseError(ValueError):
    """A replay file contains a line that cannot be interpreted safely."""

    def __init__(self, line_number: int, message: str):
        self.line_number = line_number
        self.message = message
        super().__init__(f"Line {line_number}: {message}")


@dataclass
class ReplayPlayer:
    player_id: int
    team_text: str = ""
    team: list[dict[str, Any]] = field(default_factory=list)
    friendship_multiplier: float = 1.0
    zacian_adventure_effect: bool = False
    behemoth_bash_adventure_effect: bool = False
    dynamic_punch_adventure_effect: bool = False
    catch_tank_slots: list[int] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.player_id,
            "label": f"p{self.player_id}",
            "team_text": self.team_text,
            "team": self.team,
            "friendship_multiplier": self.friendship_multiplier,
            "zacian_adventure_effect": self.zacian_adventure_effect,
            "behemoth_bash_adventure_effect": self.behemoth_bash_adventure_effect,
            "dynamic_punch_adventure_effect": self.dynamic_punch_adventure_effect,
            "catch_tank_slots": self.catch_tank_slots,
        }


@dataclass
class ReplayEvent:
    tick: int
    players: tuple[int, ...]
    action_kind: str
    action_code: str
    source_line: int
    slot: int | None = None
    actor_kind: str = "players"

    @property
    def seconds(self) -> float:
        return self.tick / 2

    def to_dict(self) -> dict[str, Any]:
        if self.actor_kind == "boss":
            player_label = "Boss"
        else:
            player_label = f"p{self.players[0]}" + "".join(
                f",{player}" for player in self.players[1:]
            )
        if self.action_kind == "boss_fast":
            description = "Boss starts its fast move"
        elif self.action_kind == "boss_charged":
            description = "Boss starts its charged move"
        elif self.action_kind == "move":
            description = f"Move {self.action_code}"
        elif self.action_kind == "dodge":
            description = "Dodge"
        elif self.action_kind == "switch":
            description = f"Switch to slot {self.slot}"
        elif self.action_kind == "quit":
            description = "Quit to the lobby"
        else:
            description = "Rejoin with the same team"
        return {
            "tick": self.tick,
            "seconds": self.seconds,
            "time_label": format_tick(self.tick),
            "players": list(self.players),
            "player_label": player_label,
            "actor_kind": self.actor_kind,
            "kind": self.action_kind,
            "code": self.action_code,
            "slot": self.slot,
            "description": description,
            "source_line": self.source_line,
        }


def format_tick(tick: int) -> str:
    whole, half = divmod(tick, 2)
    return f"{whole}.5s" if half else f"{whole}s"


def seconds_to_tick(value: str, line_number: int) -> int:
    try:
        doubled = Decimal(value) * 2
    except InvalidOperation as error:
        raise ReplayParseError(line_number, f'Invalid time "{value}".') from error
    if doubled != doubled.to_integral_value():
        raise ReplayParseError(
            line_number,
            "Times must use whole or half seconds because one game tick is 0.5s.",
        )
    tick = int(doubled)
    if tick < 0:
        raise ReplayParseError(line_number, "Times cannot be negative.")
    return tick


def parse_bool(value: str, line_number: int) -> bool:
    normalized = value.strip().lower()
    if normalized in {"true", "yes", "1", "on"}:
        return True
    if normalized in {"false", "no", "0", "off"}:
        return False
    raise ReplayParseError(line_number, f'Expected true or false, not "{value.strip()}".')


def parse_player_assignments(value: str, line_number: int) -> dict[int, str]:
    assignments: dict[int, str] = {}
    for part in value.split(";"):
        part = part.strip()
        if not part:
            continue
        match = ASSIGNMENT_RE.fullmatch(part)
        if not match:
            raise ReplayParseError(
                line_number,
                f'Expected a player assignment such as "p1=value", not "{part}".',
            )
        player_id = int(match.group("player"))
        if player_id < 1:
            raise ReplayParseError(line_number, "Player numbers start at 1.")
        if player_id in assignments:
            raise ReplayParseError(line_number, f"p{player_id} is assigned twice.")
        assignments[player_id] = match.group("value").strip()
    return assignments


def parse_player_group(value: str, line_number: int) -> list[int]:
    value = value.strip()
    if not re.fullmatch(r"p\d+(?:,\d+)*", value, re.I):
        raise ReplayParseError(
            line_number,
            f'Expected a group such as "p1,2", not "{value}".',
        )
    players = [int(piece) for piece in value[1:].split(",")]
    if any(player < 1 for player in players):
        raise ReplayParseError(line_number, "Player numbers start at 1.")
    if len(set(players)) != len(players):
        raise ReplayParseError(line_number, "A player cannot appear twice in one group.")
    return players


def parse_move_code_assignments(value: str, line_number: int) -> dict[str, str]:
    assignments: dict[str, str] = {}
    for part in value.split(";"):
        part = part.strip()
        if not part:
            continue
        if "=" not in part:
            raise ReplayParseError(
                line_number,
                f'Expected a move-code assignment such as "sc=Shadow Claw", not "{part}".',
            )
        code, move_name = (piece.strip() for piece in part.split("=", 1))
        code = code.lower()
        if not MOVE_CODE_RE.fullmatch(code):
            raise ReplayParseError(line_number, f'Invalid move code "{code}".')
        if code in {"d", "q", "r"} or re.fullmatch(r"s\d+", code):
            raise ReplayParseError(line_number, f'Move code "{code}" is reserved for an action.')
        if not move_name:
            raise ReplayParseError(line_number, f'Move code "{code}" has no move name.')
        if code in assignments:
            raise ReplayParseError(line_number, f'Move code "{code}" is assigned twice.')
        assignments[code] = move_name
    if not assignments:
        raise ReplayParseError(line_number, "Move codes cannot be empty.")
    return assignments


def parse_short_boss(value: str, line_number: int) -> dict[str, Any]:
    parts = [part.strip() for part in value.split(";") if part.strip()]
    if not parts:
        raise ReplayParseError(line_number, "Boss is missing a form ID.")
    boss: dict[str, Any] = {"form_id": parts[0], "name": None}
    for part in parts[1:]:
        if "=" not in part:
            raise ReplayParseError(
                line_number,
                f'Expected a boss setting such as "fast=Water Gun", not "{part}".',
            )
        key, setting = (piece.strip() for piece in part.split("=", 1))
        if key.lower() == "fast":
            boss["fast_move"] = setting
        elif key.lower() == "charged":
            boss["charged_move"] = setting
        else:
            raise ReplayParseError(line_number, f'Unknown boss setting "{key}".')
    return boss


def pokemon_from_verbose_tuple(value: Any, line_number: int) -> dict[str, Any]:
    if not isinstance(value, (tuple, list)) or len(value) < 4:
        raise ReplayParseError(line_number, "Each verbose team member must have at least four values.")
    pokemon = {
        "name": value[0],
        "fast_move": value[1],
        "charged_move": value[2],
        "level": value[3],
    }
    if len(value) >= 7:
        pokemon.update({
            "attack_iv": value[4],
            "defense_iv": value[5],
            "stamina_iv": value[6],
        })
    if len(value) >= 8:
        pokemon["shadow"] = bool(value[7])
    if len(value) >= 9:
        pokemon["mega_level"] = value[8]
    return pokemon


def parse_verbose_teams(value: str, line_number: int) -> dict[int, ReplayPlayer]:
    try:
        teams = ast.literal_eval(value)
    except (ValueError, SyntaxError) as error:
        raise ReplayParseError(line_number, "The verbose Player teams list is invalid.") from error
    if not isinstance(teams, list) or not teams:
        raise ReplayParseError(line_number, "Player teams must be a non-empty list.")
    players: dict[int, ReplayPlayer] = {}
    for index, team in enumerate(teams, start=1):
        if not isinstance(team, list) or not team:
            raise ReplayParseError(line_number, f"p{index} has an empty or invalid team.")
        players[index] = ReplayPlayer(
            player_id=index,
            team_text=repr(team),
            team=[pokemon_from_verbose_tuple(member, line_number) for member in team],
        )
    return players


def parse_readable_team(text: str) -> list[dict[str, Any]]:
    """Readable member fields use /; separate multiple team members with ;."""
    result = []
    for member in text.split(";"):
        parts = [part.strip() for part in member.split("/")]
        if len(parts) < 4:
            return []  # Structural-only drafts remain supported by the parser.
        try:
            level = float(parts[3].lstrip("Ll"))
            ivs = [int(iv) for iv in parts[4].split("-")] if len(parts) > 4 else [15]*3
            if len(ivs) != 3:
                return []
            result.append(dict(zip(
                ("name", "fast_move", "charged_move", "level", "attack_iv", "defense_iv", "stamina_iv"),
                [*parts[:3], level, *ivs],
            )))
        except ValueError:
            return []
    return result


def parse_literal_list(value: str, line_number: int, label: str) -> list[Any]:
    try:
        parsed = ast.literal_eval(value)
    except (ValueError, SyntaxError) as error:
        raise ReplayParseError(line_number, f"The verbose {label} list is invalid.") from error
    if not isinstance(parsed, list):
        raise ReplayParseError(line_number, f"{label} must be a list.")
    return parsed


def parse_event(line: str, line_number: int, previous_tick: int | None) -> ReplayEvent:
    match = EVENT_RE.fullmatch(line)
    if not match:
        raise ReplayParseError(
            line_number,
            "Expected an event such as t9p1:db, +1.5p1,2:s3, t12b:c, t30p1:q, or +4p1:r.",
        )

    time_code = match.group("time")
    if time_code.startswith("+"):
        if previous_tick is None:
            raise ReplayParseError(line_number, "The first event needs an absolute t timestamp.")
        tick = previous_tick + seconds_to_tick(time_code[1:], line_number)
    else:
        tick = seconds_to_tick(time_code[1:], line_number)
        if previous_tick is not None and tick < previous_tick:
            raise ReplayParseError(line_number, "Absolute event times cannot move backwards.")

    actor = match.group("actor").lower()
    action = match.group("action").lower()
    if actor == "b":
        if action == "f":
            return ReplayEvent(
                tick, (), "boss_fast", action, line_number, actor_kind="boss"
            )
        if action == "c":
            return ReplayEvent(
                tick, (), "boss_charged", action, line_number, actor_kind="boss"
            )
        raise ReplayParseError(
            line_number,
            'Boss actions are "b:f" for its fast move or "b:c" for its charged move.',
        )

    players = tuple(int(piece) for piece in actor[1:].split(","))
    if any(player < 1 for player in players):
        raise ReplayParseError(line_number, "Player numbers start at 1.")
    if len(set(players)) != len(players):
        raise ReplayParseError(line_number, "A player cannot appear twice in one event.")

    if re.fullmatch(r"r\d+", action):
        raise ReplayParseError(
            line_number,
            'Rejoin is written as "r". Party presets such as "r2" do not exist yet.',
        )
    if action == "q":
        return ReplayEvent(tick, players, "quit", action, line_number)
    if action == "r":
        return ReplayEvent(tick, players, "rejoin", action, line_number)
    if action == "d":
        return ReplayEvent(tick, players, "dodge", action, line_number)
    switch_match = re.fullmatch(r"s(\d+)", action)
    if switch_match:
        slot = int(switch_match.group(1))
        if slot < 1:
            raise ReplayParseError(line_number, "Team slots start at 1.")
        return ReplayEvent(tick, players, "switch", action, line_number, slot)
    return ReplayEvent(tick, players, "move", action, line_number)


def parse_replay_text(text: str) -> dict[str, Any]:
    """Parse replay text into a JSON-ready normalized document."""
    if not isinstance(text, str) or not text.strip():
        raise ReplayParseError(1, "Replay text is empty.")

    text = text.lstrip("\ufeff")
    # Accept a complete detailed Python trial as well as its compact section.
    # This also makes plain PowerShell redirection a supported export route.
    lines = text.splitlines()
    if "Battle replay:" in lines:
        start = lines.index("Battle replay:") + 1
        try:
            end = lines.index("End battle replay", start)
        except ValueError as error:
            raise ReplayParseError(start, 'The Battle replay section is incomplete.') from error
        text = "\n".join(lines[start:end])

    raid: dict[str, Any] = {}
    boss: dict[str, Any] = {}
    players: dict[int, ReplayPlayer] = {}
    settings: dict[str, Any] = {
        "weather": None,
        "dodge_strategy": None,
        "player_strategy": None,
        "party_power": {"mode": "normal", "groups": []},
    }
    warnings: list[str] = []
    move_codes: dict[str, str] = {}
    events: list[ReplayEvent] = []
    in_events = False
    in_teams = False
    previous_tick: int | None = None

    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.lower() == "events:":
            in_events = True
            in_teams = False
            continue
        if in_events:
            event = parse_event(line, line_number, previous_tick)
            events.append(event)
            previous_tick = event.tick
            continue

        if line.lower() == "teams:":
            in_teams = True
            continue
        player_line = PLAYER_LINE_RE.fullmatch(line) if in_teams else None
        if player_line:
            player_id = int(player_line.group("player"))
            if player_id < 1:
                raise ReplayParseError(line_number, "Player numbers start at 1.")
            if player_id in players:
                raise ReplayParseError(line_number, f"p{player_id} has two team lines.")
            team_text = player_line.group("team").strip()
            structured_team = []
            if team_text.startswith("["):
                members = parse_literal_list(team_text, line_number, f"p{player_id} team")
                if not members:
                    raise ReplayParseError(line_number, f"p{player_id} has an empty team.")
                structured_team = [
                    pokemon_from_verbose_tuple(member, line_number)
                    for member in members
                ]
            else:
                structured_team = parse_readable_team(team_text)
            players[player_id] = ReplayPlayer(
                player_id, team_text, structured_team
            )
            continue
        in_teams = False

        if line.startswith("Raid: "):
            raid["difficulty"] = line.removeprefix("Raid: ").strip()
        elif line.startswith("Raid difficulty: "):
            match = re.fullmatch(
                r"Raid difficulty:\s*(?P<difficulty>[^;]+);\s*boss HP\s*(?P<hp>[\d,]+);\s*"
                r"boss CPM\s*(?P<cpm>[\d.]+);\s*timer\s*(?P<timer>[\d.]+)s",
                line,
                re.I,
            )
            if not match:
                raise ReplayParseError(line_number, "The verbose raid difficulty line is invalid.")
            raid.update({
                "difficulty": match.group("difficulty").strip(),
                "boss_hp": int(match.group("hp").replace(",", "")),
                "boss_cpm": float(match.group("cpm")),
                "timer_seconds": float(match.group("timer")),
            })
        elif line.startswith("Boss: "):
            verbose = re.fullmatch(
                r"Boss:\s*(?P<name>.+?)\s*\((?P<form>[^;()]+);\s*(?P<source>[^)]+)\);\s*"
                r"types:\s*(?P<types>[^;]+);\s*base attack/defense:\s*(?P<attack>\d+)/(?P<defense>\d+)",
                line,
                re.I,
            )
            if verbose:
                boss.update({
                    "name": verbose.group("name").strip(),
                    "form_id": verbose.group("form").strip(),
                    "source": verbose.group("source").strip(),
                    "types": [piece.strip() for piece in verbose.group("types").split("/")],
                    "base_attack": int(verbose.group("attack")),
                    "base_defense": int(verbose.group("defense")),
                })
            else:
                boss.update(parse_short_boss(line.removeprefix("Boss: "), line_number))
        elif line.startswith("Boss moves: "):
            current_form = boss.get("form_id", "unknown")
            boss.update(parse_short_boss(
                f'{current_form}; {line.removeprefix("Boss moves: ")}',
                line_number,
            ))
        elif line.startswith("Player teams: "):
            players = parse_verbose_teams(line.removeprefix("Player teams: "), line_number)
        elif line.startswith("Friendship: "):
            value = line.removeprefix("Friendship: ").strip()
            if value.startswith("["):
                entries = parse_literal_list(value, line_number, "Friendship")
                for index, entry in enumerate(entries, start=1):
                    players.setdefault(index, ReplayPlayer(index)).friendship_multiplier = float(entry)
            else:
                for player_id, entry in parse_player_assignments(value, line_number).items():
                    players.setdefault(player_id, ReplayPlayer(player_id)).friendship_multiplier = float(entry)
        elif line.startswith("Zacian effects: "):
            value = line.removeprefix("Zacian effects: ").strip()
            weather_match = re.fullmatch(r"(?P<effects>\[.*\]);\s*weather:\s*(?P<weather>.+)", value, re.I)
            if weather_match:
                entries = parse_literal_list(weather_match.group("effects"), line_number, "Zacian effects")
                for index, entry in enumerate(entries, start=1):
                    players.setdefault(index, ReplayPlayer(index)).zacian_adventure_effect = bool(entry)
                weather = weather_match.group("weather").strip()
                settings["weather"] = None if weather.lower() == "none" else weather
            else:
                for player_id, entry in parse_player_assignments(value, line_number).items():
                    players.setdefault(player_id, ReplayPlayer(player_id)).zacian_adventure_effect = parse_bool(entry, line_number)
        elif line.startswith("Behemoth Bash effects: "):
            value = line.removeprefix("Behemoth Bash effects: ").strip()
            if value.startswith("["):
                entries = parse_literal_list(
                    value, line_number, "Behemoth Bash effects"
                )
                for index, entry in enumerate(entries, start=1):
                    players.setdefault(
                        index, ReplayPlayer(index)
                    ).behemoth_bash_adventure_effect = bool(entry)
            else:
                for player_id, entry in parse_player_assignments(
                    value, line_number
                ).items():
                    players.setdefault(
                        player_id, ReplayPlayer(player_id)
                    ).behemoth_bash_adventure_effect = parse_bool(
                        entry, line_number
                    )
        elif line.startswith(("Dynamic Punch+ effects: ", "Dynamic Punch effects: ")):
            prefix = (
                "Dynamic Punch+ effects: "
                if line.startswith("Dynamic Punch+ effects: ")
                else "Dynamic Punch effects: "
            )
            value = line.removeprefix(prefix).strip()
            if value.startswith("["):
                entries = parse_literal_list(
                    value, line_number, "Dynamic Punch effects"
                )
                for index, entry in enumerate(entries, start=1):
                    players.setdefault(
                        index, ReplayPlayer(index)
                    ).dynamic_punch_adventure_effect = bool(entry)
            else:
                for player_id, entry in parse_player_assignments(
                    value, line_number
                ).items():
                    players.setdefault(
                        player_id, ReplayPlayer(player_id)
                    ).dynamic_punch_adventure_effect = parse_bool(
                        entry, line_number
                    )
        elif line.startswith("Weather: "):
            weather = line.removeprefix("Weather: ").strip()
            settings["weather"] = None if weather.lower() == "none" else weather
        elif line.startswith("Seed: "):
            try:
                settings["random_seed"] = int(line.removeprefix("Seed: ").strip())
            except ValueError as error:
                raise ReplayParseError(line_number, "Seed must be a whole number.") from error
        elif line.startswith("Dodge: "):
            settings["dodge_strategy"] = line.removeprefix("Dodge: ").strip()
        elif line.startswith("Dodge strategy: "):
            settings["dodge_strategy"] = line.removeprefix("Dodge strategy: ").strip()
        elif line.startswith("Swap: "):
            settings["player_strategy"] = line.removeprefix("Swap: ").strip()
        elif line.startswith("Player strategy: "):
            settings["player_strategy"] = line.removeprefix("Player strategy: ").strip()
        elif line.startswith("Catch tanks: "):
            value = line.removeprefix("Catch tanks: ").strip()
            for player_id, entry in parse_player_assignments(value, line_number).items():
                slots = [] if entry == "-" else [int(piece.strip()) for piece in entry.split(",")]
                if any(slot < 1 for slot in slots):
                    raise ReplayParseError(line_number, "Catch-tank slots start at 1.")
                players.setdefault(player_id, ReplayPlayer(player_id)).catch_tank_slots = slots
        elif line.startswith("Catch-tank team indexes: "):
            entries = parse_literal_list(
                line.removeprefix("Catch-tank team indexes: "), line_number, "Catch-tank team indexes"
            )
            for index, entry in enumerate(entries, start=1):
                if not isinstance(entry, list):
                    raise ReplayParseError(line_number, "Each catch-tank entry must be a list.")
                players.setdefault(index, ReplayPlayer(index)).catch_tank_slots = [int(slot) + 1 for slot in entry]
        elif line.startswith("Party Power: "):
            value = line.removeprefix("Party Power: ").strip()
            match = re.fullmatch(r"(?P<mode>[^;]+);\s*groups\s*[=:]\s*(?P<groups>.+)", value, re.I)
            if not match:
                raise ReplayParseError(line_number, "Party Power needs a mode and groups setting.")
            settings["party_power"]["mode"] = match.group("mode").strip()
            group_text = match.group("groups").strip()
            if group_text.startswith("["):
                raw_groups = parse_literal_list(group_text, line_number, "Party Power groups")
                settings["party_power"]["groups"] = [
                    [int(player) + 1 for player in group] for group in raw_groups
                ]
            elif group_text in {"", "-"}:
                settings["party_power"]["groups"] = []
            else:
                settings["party_power"]["groups"] = [
                    parse_player_group(group, line_number)
                    for group in group_text.split("|")
                ]
        elif line.startswith("Move codes: "):
            value = line.removeprefix("Move codes: ").strip()
            for code, move_name in parse_move_code_assignments(value, line_number).items():
                if code in move_codes:
                    raise ReplayParseError(line_number, f'Move code "{code}" is assigned twice.')
                move_codes[code] = move_name
        elif line.startswith("Recording: "):
            match = re.fullmatch(r"Recording: manual; through=([\d.]+); status=(in_progress|stopped|finished)", line)
            if not match:
                raise ReplayParseError(line_number, "Invalid manual recording header.")
            settings["recording"] = {"mode": "manual", "through_tick": seconds_to_tick(match[1], line_number),
                                     "status": match[2]}
        elif line.startswith("Result: "):
            match = re.fullmatch(
                r"Result:\s*(?P<outcome>win|loss);\s*time=(?P<time>[\d.]+);\s*boss_hp=(?P<hp>\d+)",
                line,
                re.I,
            )
            if not match:
                raise ReplayParseError(line_number, "The replay Result line is invalid.")
            settings["expected_result"] = {
                "won": match.group("outcome").lower() == "win",
                "finish_time": float(match.group("time")),
                "boss_hp": int(match.group("hp")),
            }
        elif line.lower().startswith("clock="):
            warnings.append(
                f"Line {line_number}: clock is unnecessary; all t values already mean elapsed battle time."
            )
        else:
            warnings.append(f"Line {line_number}: unrecognized preamble line was ignored: {line}")

    if not raid.get("difficulty"):
        raise ReplayParseError(1, 'Missing a "Raid:" line.')
    if not boss.get("form_id"):
        raise ReplayParseError(1, 'Missing a "Boss:" line.')
    if not players:
        raise ReplayParseError(1, 'Missing player teams under "Teams:" or "Player teams:".')
    teamless = [player.player_id for player in players.values() if not player.team_text]
    if teamless:
        labels = ", ".join(f"p{player}" for player in sorted(teamless))
        raise ReplayParseError(1, f"Missing team definition for {labels}.")
    if not events:
        raise ReplayParseError(1, 'Missing events after an "Events:" line.')

    player_ids = set(players)
    for event in events:
        unknown = [player for player in event.players if player not in player_ids]
        if unknown:
            labels = ", ".join(f"p{player}" for player in unknown)
            raise ReplayParseError(event.source_line, f"Event refers to undefined {labels}.")
        if event.action_kind == "switch":
            for player_id in event.players:
                team = players[player_id].team
                if team and event.slot is not None and event.slot > len(team):
                    raise ReplayParseError(
                        event.source_line,
                        f"p{player_id} only has {len(team)} team slots; cannot switch to slot {event.slot}.",
                    )
        if move_codes and event.action_kind == "move" and event.action_code not in move_codes:
            raise ReplayParseError(
                event.source_line,
                f'Move code "{event.action_code}" is not declared by Move codes.',
            )

    known_settings_players = set(players)
    for group in settings["party_power"]["groups"]:
        unknown = [player for player in group if player not in known_settings_players]
        if unknown:
            labels = ", ".join(f"p{player}" for player in unknown)
            raise ReplayParseError(1, f"Party Power group refers to undefined {labels}.")

    if not boss.get("fast_move") or not boss.get("charged_move"):
        warnings.append(
            "Boss fast and charged moves are not specified; they will be required for damage reconstruction."
        )

    ordered_players = [players[player_id] for player_id in sorted(players)]
    event_dicts = []
    for event in events:
        event_dict = event.to_dict()
        if event.action_kind == "move" and event.action_code in move_codes:
            move_name = move_codes[event.action_code]
            event_dict["move_name"] = move_name
            event_dict["description"] = f"Move {event.action_code} — {move_name}"
        elif event.action_kind == "boss_fast" and boss.get("fast_move"):
            event_dict["move_name"] = boss["fast_move"]
            event_dict["description"] = f'Boss starts {boss["fast_move"]}'
        elif event.action_kind == "boss_charged" and boss.get("charged_move"):
            event_dict["move_name"] = boss["charged_move"]
            event_dict["description"] = f'Boss starts {boss["charged_move"]}'
        event_dicts.append(event_dict)
    return {
        "format": "Great Goose replay text v1",
        "time_unit": "seconds",
        "tick_seconds": 0.5,
        "raid": raid,
        "boss": boss,
        "players": [player.to_dict() for player in ordered_players],
        "settings": settings,
        "move_codes": move_codes,
        "events": event_dicts,
        "warnings": warnings,
        "summary": {
            "player_count": len(ordered_players),
            "event_count": len(events),
            "last_tick": events[-1].tick,
            "last_time_label": format_tick(events[-1].tick),
        },
    }


__all__ = ["ReplayParseError", "parse_replay_text"]
