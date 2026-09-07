"""Bounded local turn sessions; accepted turns are saved to replay text on disk.

Rebuilds use isolated Python workers and the same seed plus manual inputs.
Neither a browser tab nor another simulation can mutate a session's settings.
"""
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import threading
import time


class TurnSessions:
    def __init__(self, folder):
        self.folder = Path(folder)
        self.sessions = {}
        self.lock = threading.RLock()

    @staticmethod
    def run(config, commands, tick, stopped=False):
        with tempfile.TemporaryDirectory(prefix="raid-turn-") as folder:
            config_path = Path(folder) / "config.json"
            config_path.write_text(json.dumps(config), encoding="utf-8")
            env = dict(os.environ, RAID_SIM_CONFIG_PATH=str(config_path), PYTHONIOENCODING="utf-8")
            done = subprocess.run([sys.executable, str(Path(__file__).with_name("turn_battle.py"))],
                                  input=json.dumps({"commands": commands, "tick": tick, "stopped": stopped}),
                                  text=True, encoding="utf-8", capture_output=True, env=env, timeout=30)
        if done.returncode:
            raise ValueError(done.stderr.strip().splitlines()[-1] if done.stderr else "Turn failed.")
        return json.loads(done.stdout)

    def save(self, identity, result):
        name = f"turn-battle-{identity}.txt"
        destination = self.folder / name
        temporary = self.folder / (name + ".tmp")
        try:
            self.folder.mkdir(parents=True, exist_ok=True)
            temporary.write_text(result["replay_text"], encoding="utf-8")
            os.replace(temporary, destination)
        except OSError as error:
            raise ValueError("Could not save the recording. Check that the recordings folder is writable.") from error
        result.update(session_id=identity, recording_file=f"recordings/{name}", filename=name)

    def start(self, config):
        with self.lock:
            now = time.monotonic()
            self.sessions = {key: value for key, value in self.sessions.items() if now-value["touched"] < 7200}
            if len(self.sessions) >= 32:
                raise ValueError("Too many open turn battles. Restart the local server; saved recordings remain on disk.")
            result = self.run(config, [], 0)
            identity = secrets.token_hex(12)
            self.save(identity, result)
            self.sessions[identity] = {"config": config, "commands": [], "result": result, "touched": now}
            return result

    def update(self, request, stop=False):
        with self.lock:
            identity = request.get("session_id")
            if not isinstance(identity, str) or identity not in self.sessions:
                raise ValueError("Battle session expired or the server restarted. Your saved replay remains in recordings.")
            session = self.sessions[identity]
            previous = session["result"]
            if request.get("expected_tick") != previous["tick"]:
                raise ValueError("This turn was already advanced. Start a new battle if this tab is out of date.")
            if previous["status"] != "in_progress":
                raise ValueError("Battle has already ended; you can still export its recording.")
            commands = list(session["commands"])
            if not stop:
                commands.append({"tick": previous["tick"], "action": request.get("action", "wait"),
                                 "slot": request.get("slot")})
            result = self.run(session["config"], commands, previous["tick"] + (0 if stop else 1), stop)
            self.save(identity, result)
            session.update(commands=commands, result=result, touched=time.monotonic())
            return result
