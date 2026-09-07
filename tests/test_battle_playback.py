import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from threading import Thread
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'simulator'))
from battle_playback import build_playback
from local_server import RaidRequestHandler, ThreadingHTTPServer

PREAMBLE = '''Raid: Tier 4
Boss: STARMIE_MEGA; fast=Water Gun; charged=Hydro Pump
Teams:
p1: Armored Mewtwo / Confusion / Psystrike / L50 / 15-15-15
Move codes: co=Confusion; ps=Psystrike
Events:
'''


def generate(config):
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder)/'config.json'
        path.write_text(json.dumps(config))
        env = dict(os.environ, RAID_SIM_CONFIG_PATH=str(path))
        process = subprocess.run([sys.executable, '-c', '''
import super_mega_raid_simulator as e
e.validate_settings()
s=e.Simulation(next(iter(e.BOSS_FAST_MOVES.values())),next(iter(e.BOSS_CHARGED_MOVES.values())),e.random.Random(42),detailed=True)
r=s.run()
print(e.render_battle_replay(s,r,42))
'''], cwd=ROOT/'simulator', env=env, text=True, capture_output=True, check=True)
        return process.stdout


class PlaybackTests(unittest.TestCase):
    def test_damage_lands_at_move_end_and_updates_energy(self):
        result = build_playback(PREAMBLE+'t0p1:co\n+0b:f')
        frames = result['frames']
        self.assertEqual([f['tick'] for f in frames], [0, 1, 3])
        self.assertEqual([f['boss_hp'] for f in frames], [9000, 9000, 8993])
        self.assertEqual(frames[-1]['boss_energy'], 8)
        self.assertEqual([f['players'][0]['hp'] for f in frames], [192, 189, 189])
        self.assertEqual(frames[-1]['players'][0]['energy'], 15)
        self.assertIn('Not very effective', [m['text'] for m in result['messages']])

    def test_dodge_reduces_hit(self):
        result = build_playback(PREAMBLE+'t0b:f\n+0p1:d')
        self.assertEqual(result['frames'][-1]['players'][0]['hp'], 191)

    def test_switch_preserves_bench_energy_and_cancels_inflight_move(self):
        text = PREAMBLE.replace(' / 15-15-15\n', ' / 15-15-15; Armored Mewtwo / Confusion / Psystrike / L50 / 15-15-15\n')
        result = build_playback(text+'t0p1:co\n+1.5p1:co\n+0.5p1:s2\n+1p1:co\n+2p1:s1')
        final = result['frames'][-1]
        self.assertEqual(final['boss_hp'], 9000-14)
        self.assertEqual(final['players'][0]['slot'], 1)
        self.assertEqual([p['energy'] for p in final['players'][0]['team']], [14, 14])

    def test_faint_infers_switch_and_cancels_departing_hit(self):
        text = PREAMBLE.replace('L50', 'L1').replace(' / 15-15-15\n', ' / 15-15-15; Armored Mewtwo / Confusion / Psystrike / L50 / 15-15-15\n')
        result = build_playback(text+'t0p1:co\n+0b:f\n+1.5p1:co')
        final = result['frames'][-1]
        self.assertEqual(final['boss_hp'], 8993)
        self.assertEqual(final['players'][0]['faints'], 1)
        self.assertEqual(final['players'][0]['slot'], 2)
        self.assertEqual(final['players'][0]['team'][0]['hp'], 0)

    def test_rejoin_resets_team_at_recorded_time(self):
        result = build_playback(PREAMBLE+'t0p1:co\n+0b:f\n+2p1:q\n+3.5p1:r')
        self.assertFalse(result['frames'][-2]['players'][0]['on_field'])
        self.assertEqual(result['frames'][-1]['tick'], 11)
        self.assertEqual(result['frames'][-1]['players'][0]['hp'], 192)
        self.assertEqual(result['frames'][-1]['players'][0]['energy'], 0)

    def test_rejects_unearned_charge_and_lobby_switch(self):
        with self.assertRaisesRegex(ValueError, 'needs 50 energy'):
            build_playback(PREAMBLE+'t0p1:ps')
        with self.assertRaisesRegex(ValueError, 'must rejoin'):
            build_playback(PREAMBLE+'t0p1:q\n+2p1:s1')

    def test_example_supports_multiple_players_effects_and_readable_teams(self):
        example = re.search(r'const replayExample = `(.*?)`;', (ROOT/'web/replay.js').read_text(), re.S)[1]
        result = build_playback(example.replace('p2', 'p10').replace('groups=p1,2', 'groups=p1,10'))
        self.assertEqual([p['id'] for p in result['players']], [1, 10])
        self.assertEqual(result['source'], 'recorded_timeline')
        self.assertTrue({'super', 'resisted'} <= {m['kind'] for m in result['messages']})

    def test_generated_replays_match_for_strategies_shadow_party_power(self):
        team = [['NECROZMA_DAWN_WINGS','Shadow Claw','Moongeist Beam',50,15,15,15,False,1],
                ['MEWTWO_ARMORED','Confusion','Psystrike',50,15,15,15,True,1]]
        for strategy in ('no_strategy','hot_swap_greedy','hot_swap_cautious','hot_swap_very_cautious','catch_tank'):
            with self.subTest(strategy=strategy):
                config = dict(raid_difficulty='Tier 4',boss_form_id='STARMIE_MEGA',
                              boss_fast_move_names=['Water Gun'],boss_charged_move_names=['Hydro Pump'],
                              player_teams=[team,team],friendship_multipliers=[1.1,1.07],
                              zacian_adventure_effect=[False,False],party_power_groups=[[0,1]],
                              behemoth_bash_adventure_effect=[True,False],
                              dynamic_punch_adventure_effect=[False,True],
                              catch_tank_team_indices=[[1],[1]],player_strategy=strategy,
                              dodge_strategy='all_survivable',weather='Rainy')
                result = build_playback(generate(config))
                self.assertEqual(result['source'], 'verified_simulation')
                self.assertEqual(result['warnings'], [])
                self.assertEqual(result['result'], result['replay']['settings']['expected_result'])
                self.assertIn('Shadow',result['players'][0]['team'][1]['name'])
                self.assertTrue(result['players'][0]['behemoth_bash_adventure_effect'])
                self.assertTrue(result['players'][1]['dynamic_punch_adventure_effect'])
                self.assertTrue(any(p['party_power'] for f in result['frames'] for p in f['players']))
                self.assertTrue(all('party_power_progress' in p and 'party_power_threshold' in p
                                    for f in result['frames'] for p in f['players']))

    def test_playback_endpoint_and_invalid_request(self):
        server = ThreadingHTTPServer(('127.0.0.1',0),RaidRequestHandler)
        thread = Thread(target=server.serve_forever,daemon=True)
        thread.start()
        try:
            address=f'http://127.0.0.1:{server.server_port}/api/replay/playback'
            request=Request(address,data=json.dumps({'text':PREAMBLE+'t0p1:co'}).encode(),
                            headers={'Content-Type':'application/json'})
            with urlopen(request,timeout=10) as response:
                result=json.load(response)
                self.assertEqual(response.headers['Cache-Control'],'no-store, max-age=0')
            self.assertEqual(result['frames'][-1]['boss_hp'],8993)
            request=Request(address,data=json.dumps({'text':PREAMBLE+'t0p1:ps'}).encode(),
                            headers={'Content-Type':'application/json'})
            with self.assertRaises(HTTPError) as error:
                urlopen(request,timeout=10)
            self.assertEqual(error.exception.code,400)
        finally:
            server.shutdown(); server.server_close(); thread.join(timeout=5)


if __name__ == '__main__':
    unittest.main()
