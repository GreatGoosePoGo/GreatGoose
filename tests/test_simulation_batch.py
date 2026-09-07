import unittest

import local_server


def request(**updates):
    value = {
        "boss": "STARMIE",
        "boss_fast_move": "Hidden Power",
        "boss_charged_move": "Hydro Pump",
        "raid_difficulty": "Tier 3",
        "team": [{
            "name": "MEWTWO", "fast_move": "Confusion",
            "charged_move": "Psystrike", "level": 50,
        }],
        "simulation_count": 1,
        "boss_moveset_mode": "selected",
        "random_seed": 42,
    }
    value.update(updates)
    return value


class SimulationBatchTests(unittest.TestCase):
    def test_hidden_power_is_legal_fixed_and_reproducible(self):
        first = local_server.run_simulations(request())
        repeated = local_server.run_simulations(request())
        self.assertEqual(first["boss_fast_type"], repeated["boss_fast_type"])
        self.assertIn(first["boss_fast_type"], {
            "Fire", "Water", "Electric", "Grass", "Ice", "Fighting",
            "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock",
            "Ghost", "Dragon", "Dark", "Steel",
        })
        self.assertNotIn(first["boss_fast_type"], {"Normal", "Fairy"})
        playback = local_server.build_playback(first["replay_text"])
        self.assertEqual(playback["warnings"], [])

    def test_multiple_games_and_hidden_power_rerolls(self):
        result = local_server.run_simulations(request(simulation_count=16))
        self.assertEqual(result["mode"], "batch")
        self.assertEqual(result["total_battles"], 16)
        self.assertEqual(len(result["movesets"]), 1)
        type_counts = result["movesets"][0]["hidden_power_types"]
        self.assertEqual(sum(type_counts.values()), 16)
        self.assertGreater(len(type_counts), 1)
        self.assertFalse({"Normal", "Fairy"} & set(type_counts))

    def test_every_moveset_and_request_limit(self):
        result = local_server.run_simulations(request(
            boss="TOGEPI", boss_charged_move="Ancient Power",
            boss_moveset_mode="all", simulation_count=2,
        ))
        self.assertEqual(result["total_battles"], 12)
        self.assertEqual(len(result["movesets"]), 6)
        with self.assertRaisesRegex(ValueError, "limit is 500"):
            local_server.battle_config(request(
                boss="MEW", boss_fast_move="Pound", boss_charged_move="Psychic",
                boss_moveset_mode="all", simulation_count=2,
            ))


if __name__ == "__main__":
    unittest.main()
