from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ShadowGemTests(unittest.TestCase):
    def test_exact_enrage_stats_and_gem_limits(self):
        team = [["Mewtwo", "Confusion", "Psystrike", 50, 15, 15, 15, False, 1]]
        config = {
            "trials": 1,
            "random_seed": 42,
            "raid_difficulty": "Tier 5 Shadow",
            "boss_form_id": "STARMIE",
            "boss_manual_profile": {
                "name": "Test Shadow Boss", "attack": 100,
                "defense": 100, "types": ["Normal"],
            },
            "boss_fast_move_names": ["Water Gun"],
            "boss_charged_move_names": ["Hydro Pump"],
            "player_teams": [team, team],
            "friendship_multipliers": [1.0, 1.0],
            "zacian_adventure_effect": [False, False],
            "behemoth_bash_adventure_effect": [False, False],
            "dynamic_punch_adventure_effect": [False, False],
            "catch_tank_team_indices": [[], []],
            "use_purified_gems": False,
            "battle_log_mode": "full",
        }
        script = r'''
import json
import random
import super_mega_raid_simulator as e

s = e.Simulation(next(iter(e.BOSS_FAST_MOVES.values())),
                 next(iter(e.BOSS_CHARGED_MOVES.values())), random.Random(42),
                 detailed=True)
p = s.players[0]
move = p.pokemon.fast_move
normal_out = s.outgoing_damage(move, 0)
s.enraged = True
enraged_out = s.outgoing_damage(move, 0)
incoming = s.incoming_damage(s.boss_fast, 0, p, False)
s.enraged = False
s.boss_hp = e.ENRAGE_HP
s.current_time = 10
s.update_enrage_state()
cooldown_rejected = False
for player_id in (0, 1):
    s.use_purified_gem(10, player_id, strict=True)
try:
    s.use_purified_gem(14.5, 0, strict=True)
except ValueError:
    cooldown_rejected = True
for time in (15, 20, 25):
    for player_id in (0, 1):
        s.use_purified_gem(time, player_id, strict=True)
print(json.dumps({
    'normal_out': normal_out, 'enraged_out': enraged_out,
    'incoming': incoming, 'cooldown_rejected': cooldown_rejected,
    'gems': s.purified_gems_used,
    'per_player': [p.purified_gems_used for p in s.players],
    'enraged': s.enraged, 'subdued': s.shadow_subdued,
    'gem_actions': sum(action[4] == 'gem' for action in s.replay_actions),
}))
'''
        with tempfile.TemporaryDirectory() as folder:
            config_path = Path(folder) / "config.json"
            config_path.write_text(json.dumps(config), encoding="utf-8")
            env = dict(os.environ, RAID_SIM_CONFIG_PATH=str(config_path))
            result = subprocess.run(
                [sys.executable, "-c", script], cwd=ROOT / "simulator",
                env=env, text=True, capture_output=True, check=True,
            )
        values = json.loads(result.stdout)
        self.assertLess(values["enraged_out"], values["normal_out"])
        self.assertGreater(values["incoming"], 1)
        self.assertTrue(values["cooldown_rejected"])
        self.assertEqual(values["gems"], 8)
        self.assertEqual(values["per_player"], [4, 4])
        self.assertEqual(values["gem_actions"], 8)
        self.assertFalse(values["enraged"])
        self.assertTrue(values["subdued"])


if __name__ == "__main__":
    unittest.main()
