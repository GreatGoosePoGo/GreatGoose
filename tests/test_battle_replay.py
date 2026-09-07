from __future__ import annotations

import sys
from pathlib import Path
import json
from http.server import ThreadingHTTPServer
from threading import Thread
import unittest
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "simulator"))

from battle_replay import ReplayParseError, parse_replay_text
from local_server import CATALOG, PUBLIC_CATALOG, RaidRequestHandler, run_one_battle


SHORT_REPLAY = """Raid: Tier 4
Boss: STARMIE_MEGA; fast=Water Gun; charged=Hydro Pump
Teams:
p1: team one
p2: team two
p10: team ten
Friendship: p1=1.10; p2=1.10; p10=1.07
Zacian effects: p1=false; p2=true; p10=false
Behemoth Bash effects: p1=true; p2=false; p10=true
Dynamic Punch+ effects: p1=false; p2=true; p10=false
Weather: none
Dodge: downtime_saver
Swap: hot_swap_greedy
Catch tanks: p1=-; p2=3; p10=-
Party Power: normal; groups=p1,2
Events:
t9p1,2:db
+0p10:s3
+1.5p1:q
+4p1:r
"""


class BattleReplayTests(unittest.TestCase):
    def test_accepts_windows_bom_and_complete_trial_output(self):
        output = '\ufeffPython detailed trial\nBattle log:\nold log\nEnd battle log\nBattle replay:\n'
        output += SHORT_REPLAY + '\nEnd battle replay\nPlayer totals:\nsummary'
        self.assertEqual(parse_replay_text(output), parse_replay_text(SHORT_REPLAY))

    def test_short_format_normalizes_ticks_and_actions(self):
        replay = parse_replay_text(SHORT_REPLAY)
        self.assertEqual(replay["summary"]["player_count"], 3)
        self.assertEqual([event["tick"] for event in replay["events"]], [18, 18, 21, 29])
        self.assertEqual(replay["events"][0]["players"], [1, 2])
        self.assertEqual(replay["events"][1]["kind"], "switch")
        self.assertEqual(replay["events"][1]["slot"], 3)
        self.assertEqual(replay["events"][2]["kind"], "quit")
        self.assertEqual(replay["events"][3]["kind"], "rejoin")
        self.assertEqual(replay["summary"]["last_time_label"], "14.5s")
        self.assertTrue(replay["players"][0]["behemoth_bash_adventure_effect"])
        self.assertTrue(replay["players"][1]["dynamic_punch_adventure_effect"])

    def test_rejects_quarter_second_time(self):
        with self.assertRaisesRegex(ReplayParseError, "whole or half seconds"):
            parse_replay_text(SHORT_REPLAY.replace("+1.5p1:q", "+1.25p1:q"))

    def test_rejects_relative_first_event(self):
        with self.assertRaisesRegex(ReplayParseError, "first event needs an absolute"):
            parse_replay_text(SHORT_REPLAY.replace("t9p1,2:db", "+9p1,2:db"))

    def test_rejects_undefined_player(self):
        with self.assertRaisesRegex(ReplayParseError, "undefined p3"):
            parse_replay_text(SHORT_REPLAY.replace("+0p10:s3", "+0p3:s3"))

    def test_rejects_party_preset_rejoin(self):
        with self.assertRaisesRegex(ReplayParseError, "Party presets"):
            parse_replay_text(SHORT_REPLAY.replace("+4p1:r", "+4p1:r2"))

    def test_boss_dodge_and_declared_move_codes(self):
        text = SHORT_REPLAY.replace(
            "Events:\nt9p1,2:db",
            "Move codes: db=Dragon Breath\nEvents:\nt9p1,2:db\n+0b:c\n+0p1:d",
        )
        replay = parse_replay_text(text)
        self.assertEqual(replay["move_codes"]["db"], "Dragon Breath")
        self.assertEqual(replay["events"][1]["kind"], "boss_charged")
        self.assertEqual(replay["events"][1]["description"], "Boss starts Hydro Pump")
        self.assertEqual(replay["events"][2]["kind"], "dodge")

    def test_reads_current_verbose_preamble(self):
        text = """Raid difficulty: Tier 4; boss HP 9,000; boss CPM 0.79; timer 300s
Boss: Mega Starmie (STARMIE_MEGA; calculator data); types: Water/Psychic; base attack/defense: 276/229
Player teams: [[('Necrozma Dawn Wings', 'Shadow Claw', 'Moongeist Beam', 50, 15, 15, 15)]]
Friendship: [1.1]
Zacian effects: [False]; weather: None
Dodge strategy: downtime_saver
Player strategy: hot_swap_greedy
Catch-tank team indexes: [[]]
Party Power: normal; groups: []
Events:
t0p1:sc
"""
        replay = parse_replay_text(text)
        self.assertEqual(replay["raid"]["timer_seconds"], 300.0)
        self.assertEqual(replay["boss"]["form_id"], "STARMIE_MEGA")
        self.assertEqual(replay["players"][0]["friendship_multiplier"], 1.1)
        self.assertEqual(replay["players"][0]["team"][0]["charged_move"], "Moongeist Beam")
        self.assertTrue(replay["warnings"])

    def test_website_parse_endpoint(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), RaidRequestHandler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            request = Request(
                f"http://127.0.0.1:{server.server_port}/api/replay/parse",
                data=json.dumps({"text": SHORT_REPLAY}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(request, timeout=5) as response:
                replay = json.load(response)
            self.assertEqual(replay["summary"]["event_count"], 4)
            self.assertEqual(replay["events"][0]["player_label"], "p1,2")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)

    def test_simulation_generates_parseable_replay(self):
        boss = next(entry for entry in PUBLIC_CATALOG if entry["form_id"] == "KYOGRE")
        attacker = next(
            entry for entry in PUBLIC_CATALOG
            if entry["form_id"] == "MEWTWO_ARMORED"
        )
        result = run_one_battle({
            "raid_difficulty": "Tier 5",
            "boss": boss["form_id"],
            "boss_fast_move": boss["boss_fast_moves"][0],
            "boss_charged_move": boss["boss_charged_moves"][0],
            "team": [{
                "name": attacker["form_id"],
                "fast_move": "Confusion",
                "charged_move": "Psystrike",
                "level": 50,
                "attack_iv": 15,
                "defense_iv": 15,
                "stamina_iv": 15,
                "mega_level": 1,
                "shadow": False,
                "catch_tank": False,
            }],
            "dodge_strategy": "lethal_only",
            "player_strategy": "no_strategy",
            "friendship": 1.0,
            "zacian_adventure_effect": False,
            "battle_log_mode": "none",
            "random_seed": 123456,
        })
        replay = parse_replay_text(result["replay_text"])
        self.assertEqual(replay["settings"]["random_seed"], 123456)
        self.assertEqual(replay["players"][0]["team"][0]["name"], "MEWTWO_ARMORED")
        self.assertEqual(replay["players"][0]["team"][0]["charged_move"], "Psystrike")
        self.assertTrue(any(event["actor_kind"] == "boss" for event in replay["events"]))
        self.assertTrue(replay["move_codes"])
        self.assertFalse(replay["warnings"])

    def test_armored_mewtwo_catalog_entry(self):
        entry = next(item for item in CATALOG if item["form_id"] == "MEWTWO_ARMORED")
        self.assertEqual(entry["stats"], {"stamina": 214, "attack": 182, "defense": 278})
        self.assertEqual([move["name"] for move in entry["fast_moves"]], ["Confusion", "Iron Tail"])
        public = next(item for item in PUBLIC_CATALOG if item["form_id"] == "MEWTWO_ARMORED")
        self.assertIn("Psystrike", public["charged_moves"])
        self.assertNotIn("Psystrike", public["boss_charged_moves"])


if __name__ == "__main__":
    unittest.main()
