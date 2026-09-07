import json
from pathlib import Path
import sys
import tempfile
from threading import Thread
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "simulator"))
import local_server
from local_server import battle_config
from turn_sessions import TurnSessions
from battle_playback import build_playback


def setup_request(level=50, boss="KYOGRE", difficulty="Tier 5"):
    return {"boss": boss, "boss_fast_move": "Waterfall", "boss_charged_move": "Surf",
            "raid_difficulty": difficulty, "random_seed": "42", "battle_log_mode": "full",
            "team": [{"name": "MEWTWO", "fast_move": "Confusion", "charged_move": "Psystrike", "level": level},
                     {"name": "MEWTWO", "fast_move": "Confusion", "charged_move": "Psystrike", "level": level}]}


class TurnBattleTests(unittest.TestCase):
    def assert_replay(self, state):
        replay = build_playback(state["replay_text"])
        self.assertEqual(replay["warnings"], [])
        self.assertEqual(replay["duration_ticks"], state["tick"])
        frame = replay["frames"][-1]
        self.assertEqual(frame["boss_hp"], state["boss"]["hp"])
        self.assertEqual(frame["boss_energy"], state["boss"]["energy"])
        self.assertEqual(frame["players"][0]["hp"], state["player"]["hp"])
        self.assertEqual(frame["players"][0]["energy"], state["player"]["energy"])
        self.assertEqual(frame["players"][0]["on_field"], state["player"]["on_field"])
        return replay

    def test_partial_fast_and_charged_moves(self):
        config = battle_config(setup_request())
        commands = [{"tick": 0, "action": "fast"}]
        partial = TurnSessions.run(config, commands, 1)
        self.assertEqual(partial["tick"], 1)
        self.assertEqual(partial["player"]["types"], ["Psychic"])
        self.assertEqual(partial["player"]["fast_type"], "Psychic")
        self.assertEqual(partial["boss"]["types"], ["Water"])
        self.assertEqual(partial["boss"]["hp"], 15000)
        self.assertFalse(partial["available"]["fast"])
        self.assert_replay(partial)
        landed = TurnSessions.run(config, commands, 3)
        self.assertLess(landed["boss"]["hp"], 15000)
        self.assertTrue(landed["available"]["fast"])
        self.assert_replay(landed)
        commands += [{"tick": t, "action": "fast"} for t in [3, 6, 9]]
        ready = TurnSessions.run(config, commands, 12)
        self.assertTrue(ready["available"]["charged"])
        commands += [{"tick": 12, "action": "charged"}]
        partial_charge = TurnSessions.run(config, commands, 13)
        self.assertEqual(partial_charge["player"]["energy"], ready["player"]["energy"] - 50)
        self.assertEqual(partial_charge["available"]["switch_slots"], [])
        self.assert_replay(partial_charge)
        self.assert_replay(TurnSessions.run(config, commands, 17))

    def test_dodge_and_animation_lock(self):
        config = battle_config(setup_request())
        ordinary = TurnSessions.run(config, [], 2)
        dodged = TurnSessions.run(config, [{"tick": 0, "action": "dodge"}], 2)
        self.assertGreater(dodged["player"]["hp"], ordinary["player"]["hp"])
        self.assert_replay(dodged)
        partial = TurnSessions.run(config, [{"tick": 0, "action": "fast"}], 1)
        self.assertFalse(partial["available"]["fast"])
        self.assertFalse(partial["available"]["charged"])
        self.assertFalse(partial["available"]["dodge"])
        self.assertEqual(partial["available"]["switch_slots"], [])
        self.assertTrue(partial["available"]["quit"])
        with self.assertRaises(ValueError):
            TurnSessions.run(config, [{"tick": 0, "action": "fast"},
                                      {"tick": 1, "action": "switch", "slot": 2}], 3)
        switched = TurnSessions.run(config, [{"tick": 0, "action": "fast"},
                                             {"tick": 3, "action": "switch", "slot": 2}], 4)
        self.assertLess(switched["boss"]["hp"], 15000)
        self.assertEqual(switched["player"]["slot"], 2)
        self.assert_replay(switched)

    def test_faint_wait_switch_and_rejoin(self):
        config = battle_config(setup_request(level=1))
        faint = TurnSessions.run(config, [], 2)
        self.assertFalse(faint["player"]["on_field"])
        self.assertFalse(faint["player"]["in_lobby"])
        self.assert_replay(faint)
        commands = [{"tick": 3, "action": "switch", "slot": 2}]
        self.assert_replay(TurnSessions.run(config, commands, 4))
        lobby = TurnSessions.run(config, commands, 9)
        self.assertTrue(lobby["player"]["in_lobby"])
        self.assert_replay(lobby)
        ready_tick = round(lobby["player"]["rejoin_at"]*2)
        commands += [{"tick": ready_tick, "action": "rejoin"}]
        rejoined = TurnSessions.run(config, commands, ready_tick+1)
        self.assertEqual(rejoined["player"]["rejoins"], 1)
        self.assert_replay(rejoined)

    def test_saved_file_invalid_turn_and_stop(self):
        with tempfile.TemporaryDirectory() as directory:
            sessions = TurnSessions(directory)
            state = sessions.start(battle_config(setup_request()))
            path = Path(directory)/state["filename"]
            self.assertEqual(path.read_text(), state["replay_text"])
            request = {"session_id": state["session_id"], "expected_tick": 0, "action": "charged"}
            with self.assertRaises(ValueError):
                sessions.update(request)
            self.assertEqual(path.read_text(), state["replay_text"])
            request["action"] = "fast"
            state = sessions.update(request)
            with self.assertRaises(ValueError):
                sessions.update(request)  # Same tick must not execute twice.
            self.assertEqual(path.read_text(), state["replay_text"])
            request["expected_tick"] = 1
            stopped = sessions.update(request, stop=True)
            self.assertEqual(stopped["status"], "stopped")
            self.assertEqual(stopped["tick"], 1)
            self.assert_replay(stopped)

    def test_timeout_and_session_isolation(self):
        config = battle_config(setup_request())
        timed_out = TurnSessions.run(config, [], 600)
        self.assertEqual(timed_out["status"], "time_expired")
        self.assertEqual(timed_out["remaining"], 0)
        self.assert_replay(timed_out)
        first = TurnSessions.run(config, [{"tick": 0, "action": "fast"}], 3)
        other_config = battle_config(setup_request(level=1))
        TurnSessions.run(other_config, [], 4)
        self.assertEqual(first, TurnSessions.run(config, [{"tick": 0, "action": "fast"}], 3))

    def test_http_start_step_and_export(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(local_server, "TURN_SESSIONS", TurnSessions(folder)):
            server = local_server.ThreadingHTTPServer(("127.0.0.1", 0), local_server.RaidRequestHandler)
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            def post(route, body):
                req = Request(f"http://127.0.0.1:{server.server_port}{route}", data=json.dumps(body).encode(),
                              headers={"Content-Type": "application/json"})
                with urlopen(req) as response:
                    return json.load(response)
            try:
                request = setup_request()
                request.update(dodge_strategy="all", player_strategy="hot_swap_greedy")
                state = post("/api/turn/start", request)
                self.assertIn("Dodge: none", state["replay_text"])
                state = post("/api/turn/step", {"session_id": state["session_id"], "expected_tick": 0, "action": "fast"})
                self.assertEqual(state["tick"], 1)
                replay = post("/api/replay/playback", {"text": state["replay_text"]})
                self.assertEqual(replay["duration_ticks"], 1)
                self.assertEqual(Path(folder, state["filename"]).read_text(), state["replay_text"])
            finally:
                server.shutdown()
                server.server_close()
                thread.join()


if __name__ == "__main__":
    unittest.main()
