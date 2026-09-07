from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class AdventureEffectTests(unittest.TestCase):
    def test_damage_modifiers_and_dynamic_punch_eligibility(self):
        config = {
            "trials": 1,
            "random_seed": 7,
            "raid_difficulty": "Tier 4",
            "boss_form_id": "STARMIE_MEGA",
            "boss_fast_move_names": ["Water Gun"],
            "boss_charged_move_names": ["Hydro Pump"],
            "player_teams": [[
                ["NECROZMA_DAWN_WINGS", "Shadow Claw", "Moongeist Beam",
                 50, 15, 15, 15, False, 1]
            ]],
            "friendship_multipliers": [1.0],
            "zacian_adventure_effect": [False],
            "behemoth_bash_adventure_effect": [False],
            "dynamic_punch_adventure_effect": [False],
            "catch_tank_team_indices": [[]],
        }
        script = """
import json
import random
import super_mega_raid_simulator as engine

simulation = engine.Simulation(
    next(iter(engine.BOSS_FAST_MOVES.values())),
    next(iter(engine.BOSS_CHARGED_MOVES.values())),
    random.Random(7),
)
player = simulation.players[0]
move = player.pokemon.fast_move
base_outgoing = simulation.outgoing_damage(move, 0)
engine.DYNAMIC_PUNCH_ADVENTURE_EFFECT[0] = True
mega_outgoing = simulation.outgoing_damage(move, 0)
engine.RAID_DIFFICULTY = 'Tier 5'
wrong_mode_outgoing = simulation.outgoing_damage(move, 0)
engine.RAID_DIFFICULTY = 'Primal'
engine.BOSS_FORM_ID = 'GROUDON_PRIMAL'
primal_outgoing = simulation.outgoing_damage(move, 0)

engine.BEHEMOTH_BASH_ADVENTURE_EFFECT[0] = False
base_incoming = simulation.incoming_damage(
    simulation.boss_charged, 0, player, False,
)
engine.BEHEMOTH_BASH_ADVENTURE_EFFECT[0] = True
boosted_incoming = simulation.incoming_damage(
    simulation.boss_charged, 0, player, False,
)
print(json.dumps({
    'base_outgoing': base_outgoing,
    'mega_outgoing': mega_outgoing,
    'wrong_mode_outgoing': wrong_mode_outgoing,
    'primal_outgoing': primal_outgoing,
    'base_incoming': base_incoming,
    'boosted_incoming': boosted_incoming,
}))
"""
        with tempfile.TemporaryDirectory() as folder:
            config_path = Path(folder) / "config.json"
            config_path.write_text(json.dumps(config), encoding="utf-8")
            env = dict(os.environ, RAID_SIM_CONFIG_PATH=str(config_path))
            result = subprocess.run(
                [sys.executable, "-c", script],
                cwd=ROOT / "simulator",
                env=env,
                text=True,
                capture_output=True,
                check=True,
            )
        values = json.loads(result.stdout)
        self.assertGreater(values["mega_outgoing"], values["base_outgoing"])
        self.assertEqual(values["wrong_mode_outgoing"], values["base_outgoing"])
        self.assertEqual(values["primal_outgoing"], values["base_outgoing"])
        self.assertLess(values["boosted_incoming"], values["base_incoming"])


if __name__ == "__main__":
    unittest.main()
