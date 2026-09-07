"""Small local web server for the Pokémon GO raid simulator."""

from __future__ import annotations

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tempfile
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
WEB_ROOT = ROOT / "web"
SIM_ROOT = ROOT / "simulator"
DATA_PATH = SIM_ROOT / "calculator_data.json"
SIMULATOR_PATH = SIM_ROOT / "super_mega_raid_simulator.py"
MAX_GAMES_PER_MOVESET = 100
MAX_GAMES_PER_REQUEST = 500

if str(SIM_ROOT) not in sys.path:
    sys.path.insert(0, str(SIM_ROOT))

from battle_replay import ReplayParseError, parse_replay_text
from battle_playback import build_playback
from turn_sessions import TurnSessions

TURN_SESSIONS = TurnSessions(ROOT / "recordings")

RESULT_PATTERN = re.compile(
    r"Result: (?P<outcome>win|loss) at (?P<time>[\d.]+)s; "
    r"boss HP (?P<hp>\d+); faints (?P<faints>\d+); "
    r"retreats (?P<retreats>\d+); rejoins (?P<rejoins>\d+); "
    r"catch tanks (?P<catch_tanks>\d+)"
)


def load_catalog() -> list[dict]:
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


CATALOG = load_catalog()


def player_moves(entry: dict, *keys: str) -> list[dict]:
    """Return every move a player-owned Pokémon can actually use."""
    return [move for key in keys for move in entry.get(key, ())]


def boss_moves(entry: dict, key: str) -> list[dict]:
    """Raid bosses only use their ordinary, non-Elite move pool."""
    return [
        move for move in entry.get(key, ())
        if not move.get("elite", False)
    ]


def public_entry(entry: dict) -> dict:
    player_fast_moves = player_moves(
        entry, "fast_moves", "exclusive_fast_moves"
    )
    player_charged_moves = player_moves(
        entry,
        "charged_moves",
        "exclusive_charged_moves",
        "mega_charged_moves",
    )
    mega_charged_moves = entry.get("mega_charged_moves", ())
    boss_fast_moves = boss_moves(entry, "fast_moves")
    boss_charged_moves = boss_moves(entry, "charged_moves")
    return {
        "form_id": entry["form_id"],
        "dex_number": entry["dex_number"],
        "name": entry["name"],
        "types": entry["types"],
        "fast_moves": [move["name"] for move in player_fast_moves],
        "charged_moves": [move["name"] for move in player_charged_moves],
        "mega_charged_moves": [move["name"] for move in mega_charged_moves],
        "boss_fast_moves": [move["name"] for move in boss_fast_moves],
        "boss_charged_moves": [move["name"] for move in boss_charged_moves],
        "fast_move_data": [
            {"id": move["id"], "name": move["name"]}
            for move in player_fast_moves
        ],
        "charged_move_data": [
            {"id": move["id"], "name": move["name"]}
            for move in player_charged_moves
        ],
    }


PUBLIC_CATALOG = [public_entry(entry) for entry in CATALOG]
PUBLIC_BY_ID = {entry["form_id"]: entry for entry in PUBLIC_CATALOG}


class RaidRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def end_headers(self) -> None:
        # This is a local development server. Do not let the browser keep an
        # older catalog or JavaScript file after the project is updated.
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def send_json(self, value: object, status: int = 200) -> None:
        payload = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:
        if urlparse(self.path).path == "/api/catalog":
            self.send_json({"pokemon": PUBLIC_CATALOG})
            return
        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path not in {"/api/simulate", "/api/replay/parse", "/api/replay/playback",
                        "/api/turn/start", "/api/turn/step", "/api/turn/stop"}:
            self.send_json({"error": "Not found"}, 404)
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 2_000_000:
                raise ValueError("Request is too large.")
            request = json.loads(self.rfile.read(length))
            if not isinstance(request, dict):
                raise ValueError("Request must be an object.")
            if path == "/api/turn/start":
                manual_request = dict(request, player_strategy="no_strategy", dodge_strategy="none",
                                      battle_log_mode="full", simulation_count=1,
                                      boss_moveset_mode="selected")
                result = TURN_SESSIONS.start(battle_config(manual_request))
            elif path in {"/api/turn/step", "/api/turn/stop"}:
                result = TURN_SESSIONS.update(request, stop=path.endswith("/stop"))
            elif path in {"/api/replay/parse", "/api/replay/playback"}:
                replay_text = request.get("text")
                if not isinstance(replay_text, str):
                    raise ValueError("Replay text must be a string.")
                result = (build_playback(replay_text) if path.endswith("/playback")
                          else parse_replay_text(replay_text))
            else:
                result = run_simulations(request)
        except (ReplayParseError, ValueError, KeyError, json.JSONDecodeError) as error:
            self.send_json({"error": str(error)}, 400)
            return
        except subprocess.TimeoutExpired:
            self.send_json({"error": "The simulation took too long."}, 504)
            return

        self.send_json(result)


def battle_config(request: dict) -> dict:
    boss = request["boss"]
    fast_move = request["boss_fast_move"]
    charged_move = request["boss_charged_move"]
    boss_entry = PUBLIC_BY_ID.get(boss)
    if boss_entry is None:
        raise ValueError("Choose a valid raid boss.")
    moveset_mode = str(request.get("boss_moveset_mode", "selected"))
    if moveset_mode not in {"selected", "all"}:
        raise ValueError("Boss movesets must be 'selected' or 'all'.")
    raw_simulation_count = request.get("simulation_count", 1)
    try:
        numeric_simulation_count = float(raw_simulation_count)
    except (TypeError, ValueError) as error:
        raise ValueError("Games per moveset must be a whole number.") from error
    if (isinstance(raw_simulation_count, bool) or not numeric_simulation_count.is_integer()
            or not 1 <= numeric_simulation_count <= MAX_GAMES_PER_MOVESET):
        raise ValueError(f"Games per moveset must be from 1 to {MAX_GAMES_PER_MOVESET}.")
    simulation_count = int(numeric_simulation_count)
    if fast_move not in boss_entry["boss_fast_moves"] or charged_move not in boss_entry["boss_charged_moves"]:
        raise ValueError("Choose legal ordinary moves for the raid boss.")
    fast_moves = [fast_move] if moveset_mode == "selected" else list(boss_entry["boss_fast_moves"])
    charged_moves = [charged_move] if moveset_mode == "selected" else list(boss_entry["boss_charged_moves"])
    total_games = simulation_count * len(fast_moves) * len(charged_moves)
    if total_games > MAX_GAMES_PER_REQUEST:
        raise ValueError(
            f"This would run {total_games} battles. The limit is {MAX_GAMES_PER_REQUEST}; "
            "reduce games per moveset or use the selected moveset."
        )
    team = request["team"]
    if not isinstance(team, list) or not 1 <= len(team) <= 6:
        raise ValueError("Choose between 1 and 6 Pokémon.")

    player_team = []
    catch_tank_indices = []
    for index, pokemon in enumerate(team):
        level = float(pokemon["level"])
        if not 1 <= level <= 55 or not (level * 2).is_integer():
            raise ValueError("Pokémon levels must be from 1 to 55 in half-level steps.")
        raw_ivs = [
            float(pokemon.get("attack_iv", 15)),
            float(pokemon.get("defense_iv", 15)),
            float(pokemon.get("stamina_iv", 15)),
        ]
        if any(not iv.is_integer() or iv < 0 or iv > 15 for iv in raw_ivs):
            raise ValueError("Pokémon IVs must be integers from 0 to 15.")
        ivs = [int(iv) for iv in raw_ivs]
        raw_mega_level = float(pokemon.get("mega_level", 1))
        if not raw_mega_level.is_integer() or not 1 <= raw_mega_level <= 4:
            raise ValueError("Mega Level must be an integer from 1 to 4.")
        mega_level = int(raw_mega_level)
        player_team.append([
            pokemon["name"],
            pokemon["fast_move"],
            pokemon["charged_move"],
            level,
            *ivs,
            pokemon.get("shadow") is True,
            mega_level,
        ])
        if pokemon.get("catch_tank") is True:
            catch_tank_indices.append(index)

    player_strategy = request.get("player_strategy", "no_strategy")
    if player_strategy != "catch_tank":
        catch_tank_indices = []
    elif len(catch_tank_indices) >= len(player_team):
        raise ValueError("Leave at least one Pokémon as a normal attacker.")

    seed_value = request.get("random_seed")
    if seed_value in (None, ""):
        random_seed = secrets.randbelow(2**63)
    else:
        try:
            random_seed = int(seed_value)
        except (TypeError, ValueError) as error:
            raise ValueError("Random seed must be a whole number.") from error
        if not 0 <= random_seed < 2**63:
            raise ValueError(
                f"Random seed must be from 0 through {2**63 - 1}."
            )

    battle_log_mode = str(request.get("battle_log_mode", "moves"))
    if battle_log_mode not in {"none", "moves", "full"}:
        raise ValueError("Unknown battle-log detail setting.")

    config = {
        "trials": simulation_count,
        "random_seed": random_seed,
        "raid_difficulty": request["raid_difficulty"],
        "boss_form_id": boss,
        "boss_fast_move_names": fast_moves,
        "boss_charged_move_names": charged_moves,
        "player_teams": [player_team],
        "friendship_multipliers": [float(request.get("friendship", 1.0))],
        "zacian_adventure_effect": [
            request.get("zacian_adventure_effect") is True
        ],
        "behemoth_bash_adventure_effect": [
            request.get("behemoth_bash_adventure_effect") is True
        ],
        "dynamic_punch_adventure_effect": [
            request.get("dynamic_punch_adventure_effect") is True
        ],
        "party_power_groups": [],
        "weather": request.get("weather") or None,
        "dodge_strategy": request.get("dodge_strategy", "none"),
        "player_strategy": player_strategy,
        "catch_tank_team_indices": [catch_tank_indices],
        "battle_log_mode": battle_log_mode,
    }
    return config


def run_simulations(request: dict) -> dict:
    config = battle_config(request)
    if (config["trials"] == 1 and len(config["boss_fast_move_names"]) == 1
            and len(config["boss_charged_move_names"]) == 1):
        return run_one_battle(request, config)
    return run_batch(config)


def run_batch(config: dict) -> dict:
    config_file = tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", encoding="utf-8", delete=False
    )
    try:
        with config_file:
            json.dump(config, config_file)
        environment = os.environ.copy()
        environment["RAID_SIM_CONFIG_PATH"] = config_file.name
        completed = subprocess.run(
            [sys.executable, str(SIMULATOR_PATH), "--json-summary"],
            cwd=SIM_ROOT,
            env=environment,
            text=True,
            capture_output=True,
            timeout=60,
        )
    finally:
        Path(config_file.name).unlink(missing_ok=True)
    if completed.returncode:
        message = completed.stderr.strip().splitlines()
        raise ValueError(message[-1] if message else "Batch simulation failed.")
    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise ValueError("The simulator returned an unreadable batch result.") from error


def run_one_battle(request: dict, config: dict | None = None) -> dict:
    config = config or battle_config(request)
    fast_move = config["boss_fast_move_names"][0]
    charged_move = config["boss_charged_move_names"][0]
    random_seed = config["random_seed"]
    battle_log_mode = config["battle_log_mode"]

    config_file = tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", encoding="utf-8", delete=False
    )
    try:
        with config_file:
            json.dump(config, config_file)
        environment = os.environ.copy()
        environment["RAID_SIM_CONFIG_PATH"] = config_file.name
        completed = subprocess.run(
            [
                sys.executable,
                str(SIMULATOR_PATH),
                "--detail",
                fast_move,
                charged_move,
                "--trial",
                "0",
            ],
            cwd=SIM_ROOT,
            env=environment,
            text=True,
            capture_output=True,
            timeout=30,
        )
    finally:
        Path(config_file.name).unlink(missing_ok=True)

    if completed.returncode:
        message = completed.stderr.strip().splitlines()
        raise ValueError(message[-1] if message else "Simulation failed.")

    lines = completed.stdout.splitlines()
    result_line = next((line for line in reversed(lines) if line.startswith("Result:")), "")
    match = RESULT_PATTERN.fullmatch(result_line)
    if not match:
        raise ValueError("The simulator returned an unreadable result.")

    values = match.groupdict()
    fast_type_line = next((line for line in lines if line.startswith("Boss fast move type: ")), "")
    boss_fast_type = fast_type_line.removeprefix("Boss fast move type: ") or None
    log_start = lines.index("Battle log:") + 1
    log_end = lines.index("End battle log", log_start)
    replay_start = lines.index("Battle replay:") + 1
    replay_end = lines.index("End battle replay", replay_start)
    return {
        "mode": "single",
        "won": values["outcome"] == "win",
        "finish_time": float(values["time"]),
        "boss_hp": int(values["hp"]),
        "faints": int(values["faints"]),
        "retreats": int(values["retreats"]),
        "rejoins": int(values["rejoins"]),
        "catch_tanks": int(values["catch_tanks"]),
        # Return this as text so JavaScript never rounds a 63-bit integer.
        "random_seed": str(random_seed),
        "boss_fast_type": boss_fast_type if fast_move == "Hidden Power" else None,
        "battle_log_mode": battle_log_mode,
        "log": lines[log_start:log_end],
        "replay_text": "\n".join(lines[replay_start:replay_end]),
    }


def main() -> None:
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), RaidRequestHandler)
    print(f"Raid simulator ready at http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
