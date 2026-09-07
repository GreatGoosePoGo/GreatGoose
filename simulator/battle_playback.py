"""Reconstruct compact raid replays using the canonical Python battle engine.

Each request runs in an isolated process because the engine has module settings.
Generated replays can recover the engine's original same-tick event ordering:
the recorded actions AND result must match before accepting a seeded trace.
Edited and hand-written timelines instead execute their recorded actions, with
completed hits resolved before new actions on the same half-second tick.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import random
import subprocess
import sys
import tempfile
from heapq import heappush, heappop

from battle_replay import parse_replay_text


def replay_config(document):
    players = document['players']
    if not 1 <= len(players) <= 40:
        raise ValueError('Playback supports 1–40 players.')
    mapping = {p['id']: i for i, p in enumerate(players)}
    teams = []
    for player in players:
        if not 1 <= len(player['team']) <= 6:
            raise ValueError(f"p{player['id']}: define 1–6 Pokémon with species, moves and level. "
                             'Example: Mewtwo / Confusion / Psystrike / L50 / 15-15-15')
        team = []
        for member in player['team']:
            name = str(member['name']).replace('Armoured', 'Armored').replace('armoured', 'armored')
            shadow = member.get('shadow', False)
            if name.casefold().startswith('shadow '):
                name, shadow = name[7:].strip(), True
            team.append([name, member['fast_move'], member['charged_move'], member['level'],
                         member.get('attack_iv', 15), member.get('defense_iv', 15),
                         member.get('stamina_iv', 15), shadow, member.get('mega_level', 1)])
        teams.append(team)
    boss, settings = document['boss'], document['settings']
    if not boss.get('fast_move') or not boss.get('charged_move'):
        raise ValueError('Playback needs boss moves: Boss: FORM_ID; fast=Move; charged=Move')
    if document['summary']['last_tick'] > 7200 or len(document['events']) > 20000:
        raise ValueError('Replay exceeds the playback limit (3600 seconds or 20,000 events).')
    return {
        'trials': 1, 'random_seed': settings.get('random_seed', 0),
        'raid_difficulty': document['raid']['difficulty'], 'boss_form_id': boss['form_id'],
        'boss_fast_move_names': [boss['fast_move']], 'boss_charged_move_names': [boss['charged_move']],
        'player_teams': teams,
        'friendship_multipliers': [p['friendship_multiplier'] for p in players],
        'zacian_adventure_effect': [p['zacian_adventure_effect'] for p in players],
        'behemoth_bash_adventure_effect': [
            p['behemoth_bash_adventure_effect'] for p in players
        ],
        'dynamic_punch_adventure_effect': [
            p['dynamic_punch_adventure_effect'] for p in players
        ],
        'weather': settings['weather'], 'dodge_strategy': settings['dodge_strategy'] or 'none',
        'player_strategy': settings['player_strategy'] or 'no_strategy',
        'catch_tank_team_indices': [[slot-1 for slot in p['catch_tank_slots']] for p in players],
        'party_power_groups': [[mapping[p] for p in group] for group in settings['party_power']['groups']],
        'boosted_party_power': settings['party_power']['mode'] == 'boosted',
        'use_purified_gems': settings.get('use_purified_gems', False),
        'battle_log_mode': 'none',
    }


def build_playback(text):
    document = parse_replay_text(text)
    config = replay_config(document)
    with tempfile.TemporaryDirectory(prefix='raid-replay-') as folder:
        config_path = Path(folder) / 'config.json'
        config_path.write_text(json.dumps(config), encoding='utf-8')
        env = os.environ.copy()
        env['RAID_SIM_CONFIG_PATH'] = str(config_path)
        env['PYTHONIOENCODING'] = 'utf-8'
        result = subprocess.run(
            [sys.executable, str(Path(__file__).resolve()), '--worker'],
            input=json.dumps(document), text=True, encoding='utf-8', capture_output=True,
            env=env, timeout=30,
        )
    if result.returncode:
        raise ValueError(result.stderr.strip().splitlines()[-1] if result.stderr else 'Replay failed.')
    return json.loads(result.stdout)


def reconstruct(document):
    import super_mega_raid_simulator as engine

    # Detailed preambles can describe overrides; do not silently discard them.
    raid, boss = document['raid'], document['boss']
    for key, attr in [('boss_hp', 'BOSS_HP'), ('boss_cpm', 'BOSS_CPM'), ('timer_seconds', 'RAID_SECONDS')]:
        if key in raid:
            value = raid[key]
            if not 0 < value <= (1 if key == 'boss_cpm' else 1000000):
                raise ValueError(f'Invalid {key}.')
            setattr(engine, attr, value)
    if engine.RAID_SECONDS > 3600:
        raise ValueError('Replay timer must be at most 3600 seconds.')
    if 'base_attack' in boss:
        engine.BOSS_ATTACK_BASE = boss['base_attack']
        engine.BOSS_DEFENSE_BASE = boss['base_defense']
        engine.BOSS_ATTACK = boss['base_attack'] + 15
        engine.BOSS_DEFENSE = boss['base_defense'] + 15
        engine.BOSS_TYPES = tuple(t.title() for t in boss['types'])
        engine.BOSS_NAME = boss.get('name') or engine.BOSS_NAME
    engine.ENRAGE_HP = int(engine.BOSS_HP * (0.6 if engine.SHADOW_RAID else 0.8)) \
        if engine.SHADOW_RAID or engine.SUPER_MEGA_ENRAGE else -1
    engine.SHADOW_UNENRAGE_HP = int(engine.BOSS_HP * 0.15) if engine.SHADOW_RAID else -1
    engine.validate_settings()
    if document['summary']['last_tick'] > round(engine.RAID_SECONDS*2):
        raise ValueError('A recorded action occurs after the raid timer expires.')
    player_ids = [p['id'] for p in document['players']]
    id_to_index = {p: i for i, p in enumerate(player_ids)}
    fast = next(iter(engine.BOSS_FAST_MOVES.values()))
    charged = next(iter(engine.BOSS_CHARGED_MOVES.values()))

    class ObservedSimulation(engine.Simulation):
        def __post_init__(self):
            super().__post_init__()
            self.frames = {}
            self.messages = []

        def notice(self, target, text, kind='action', slot=None):
            self.messages.append({'tick': round(self.current_time*2), 'target': target,
                                  'text': text, 'kind': kind, 'slot': slot})

        def record_replay_action(self, time, actor_kind, actor_id, action_kind, value=None):
            super().record_replay_action(time, actor_kind, actor_id, action_kind, value)
            target = 'boss' if actor_kind == 'boss' else f'p{player_ids[actor_id]}'
            label = {'fast': fast.name, 'charged': charged.name, 'move': str(value),
                     'switch': f'Switch to slot {value}', 'dodge': 'Dodge',
                     'gem': 'Purified Gem', 'quit': 'In lobby',
                     'rejoin': 'Rejoined'}.get(action_kind, action_kind)
            self.notice(target, label)

        def effectiveness_notice(self, move, types, target, slot=None):
            multiplier = engine.type_effectiveness(move.move_type, types)
            if multiplier > 1.00001:
                self.notice(target, 'Super effective', 'super', slot)
            elif multiplier < 0.99999:
                self.notice(target, 'Not very effective', 'resisted', slot)

        def apply_player_hit(self, player_id, generation, move):
            player = self.players[player_id]
            if not player.on_field or player.generation != generation:
                return
            hp = self.boss_hp
            super().apply_player_hit(player_id, generation, move)
            if self.boss_hp < hp:
                self.effectiveness_notice(move, engine.BOSS_TYPES, 'boss')

        def apply_boss_hit(self, move, dodgers):
            for i, player in enumerate(self.players):
                if player.on_field:
                    self.effectiveness_notice(move, player.species.types, f'p{player_ids[i]}', player.pokemon_index+1)
                    if self.incoming_damage(
                        move, i, player, i in dodgers,
                    ) >= player.hp:
                        self.notice(f'p{player_ids[i]}', f'{player.species.name} fainted', 'faint')
            super().apply_boss_hit(move, dodgers)

        def capture_replay_state(self):
            tick = round(self.current_time*2)
            self.frames[tick] = {
                'tick': tick, 'boss_hp': max(0, self.boss_hp),
                'boss_energy': self.boss_energy, 'enraged': self.enraged,
                'purified_gems_used': self.purified_gems_used,
                'players': [{
                    'id': player_ids[i], 'slot': p.pokemon_index+1,
                    'on_field': p.on_field, 'hp': max(0, p.hp), 'energy': p.energy,
                    'party_power': p.party_power_active,
                    'party_power_progress': p.party_power_progress,
                    'party_power_threshold': p.party_power_threshold,
                    'faints': p.faints, 'rejoins': p.rejoins,
                    'purified_gems_used': p.purified_gems_used,
                    'team': [{'hp': max(0, m.hp), 'energy': m.energy} for m in p.team],
                } for i, p in enumerate(self.players)],
            }

    def make_sim(cls=ObservedSimulation):
        return cls(fast, charged, random.Random(document['settings'].get('random_seed', 0)),
                   boss_hp=engine.BOSS_HP, detailed=True)

    def signature(doc):
        # Grouped player actions are equivalent to their individual events.
        result = []
        for event in doc['events']:
            actors = ['boss'] if event['actor_kind'] == 'boss' else [f'p{p}' for p in event['players']]
            for actor in actors:
                result.append((event['tick'], actor, event['kind'], event.get('move_name'), event.get('slot')))
        return result

    sim = None
    warnings = list(document['warnings'])
    expected = document['settings'].get('expected_result')
    recording = document['settings'].get('recording')
    if 'random_seed' in document['settings'] and expected and not recording:
        candidate = make_sim()
        result = candidate.run()
        generated = parse_replay_text(engine.render_battle_replay(candidate, result, document['settings']['random_seed']))
        # Internal engine indexes are contiguous; file player labels need not be.
        for event in generated['events']:
            event['players'] = [player_ids[p-1] for p in event['players']]
        if signature(generated) == signature(document) and generated['settings']['expected_result'] == expected:
            sim = candidate
            finish_tick = round(result.finish_time*2)
            source = 'verified_simulation'

    if sim is None:
        class TimelineSimulation(ObservedSimulation):
            def switch(self, time, player_id, tactical):
                # Resolve a faint; the file may explicitly choose the next slot.
                player = self.players[player_id]
                player.generation += 1
                player.on_field = False
                player.action_end = time
                player.action_is_charged = False
                if recording:
                    # In manual mode the trainer selects the next slot, possibly
                    # several turns later. Do not fill that choice automatically.
                    return
                explicit = any(e['tick'] == round(time*2) and player_ids[player_id] in e['players']
                               and e['kind'] in {'switch', 'quit'} for e in document['events'])
                if not explicit:
                    next_index = next((i for i in range(player.pokemon_index+1, len(player.team))
                                       if player.team[i].hp > 0), None)
                    if next_index is not None:
                        player.pokemon_index = next_index
                        player.on_field = True
                        player.action_end = time + engine.SWITCH_SECONDS
                        self.record_replay_action(time, 'player', player_id, 'switch', next_index+1)
                    else:
                        in_lobby[player_id] = True
                        self.record_replay_action(time, 'player', player_id, 'quit')

        sim = make_sim(TimelineSimulation)
        sim.capture_replay_state()
        queue = []
        sequence = 0
        pending_boss = None
        boss_ready_tick = 0
        in_lobby = [False] * len(sim.players)
        def push(tick, kind, data):
            nonlocal sequence
            sequence += 1
            heappush(queue, (tick, 0 if kind.endswith('_hit') else 1, sequence, kind, data))
        for event in document['events']:
            push(event['tick'], 'action', event)
        if any(e['kind'] == 'move' and not e.get('move_name') for e in document['events']):
            raise ValueError('Declare each move code in the preamble, for example Move codes: sc=Shadow Claw.')
        limit = round(engine.RAID_SECONDS*2)
        if recording:
            limit = recording['through_tick']
            if not document['summary']['last_tick'] <= limit <= round(engine.RAID_SECONDS*2):
                raise ValueError('Manual recording endpoint must include all actions and fit the raid timer.')
        finish_tick = 0
        while queue:
            tick, _, _, kind, data = heappop(queue)
            if tick > limit or sim.boss_hp <= 0:
                break
            sim.current_time = tick/2
            finish_tick = tick
            if kind == 'player_hit':
                sim.apply_player_hit(*data)
            elif kind == 'boss_hit':
                move, dodgers = data
                sim.apply_boss_hit(move, frozenset(dodgers))
                pending_boss = None
            else:
                event = data
                action = event['kind']
                def fail(message):
                    raise ValueError(f"Line {event['source_line']} ({tick/2:g}s): {message}")
                if event['actor_kind'] == 'boss':
                    if pending_boss is not None:
                        fail('Boss starts a move before its previous move finishes.')
                    if tick < boss_ready_tick:
                        fail(f'Boss is recovering until {boss_ready_tick/2:g}s.')
                    move = fast if action == 'boss_fast' else charged
                    if move is charged:
                        if sim.boss_energy < move.energy:
                            fail(f'Boss needs {move.energy} energy but has {sim.boss_energy:g}.')
                        sim.boss_energy -= move.energy
                    else:
                        sim.boss_energy = min(engine.BOSS_MAX_ENERGY, sim.boss_energy+move.energy)
                    hit_tick = tick+round(move.duration*2)
                    boss_ready_tick = hit_tick + (round(engine.FAST_MOVE_DELAY*2) if move is fast else 0)
                    dodgers = set()
                    pending_boss = (hit_tick, move, dodgers)
                    sim.record_replay_action(tick/2, 'boss', None, 'fast' if move is fast else 'charged')
                    push(hit_tick, 'boss_hit', (move, dodgers))
                else:
                    for external_id in event['players']:
                        i = id_to_index[external_id]
                        player = sim.players[i]
                        if action == 'rejoin':
                            if player.on_field:
                                fail(f'p{external_id} is already on field; use q before r.')
                            for pokemon in player.team:
                                pokemon.reset()
                            player.pokemon_index = sim.first_normal_index(player)
                            player.on_field = True
                            player.generation += 1
                            player.rejoins += 1
                            player.action_end = tick/2
                            player.action_is_charged = False
                            in_lobby[i] = False
                        elif action == 'quit':
                            player.on_field = False
                            player.generation += 1
                            player.action_end = tick/2
                            in_lobby[i] = True
                            if pending_boss:
                                pending_boss[2].discard(i)
                        elif action == 'switch':
                            if in_lobby[i]:
                                fail(f'p{external_id} must rejoin with r before switching.')
                            slot = event['slot']-1
                            if player.team[slot].hp <= 0:
                                fail(f'p{external_id} slot {slot+1} has fainted.')
                            player.generation += 1
                            player.pokemon_index = slot
                            player.on_field = True
                            player.action_end = tick/2+engine.SWITCH_SECONDS
                            player.action_is_charged = False
                            if pending_boss:
                                pending_boss[2].discard(i)
                        elif action == 'dodge':
                            if not player.on_field or pending_boss is None:
                                fail(f'p{external_id} has no incoming boss move to dodge.')
                            if i in pending_boss[2]:
                                fail(f'p{external_id} already dodged this move.')
                            hit_tick, move, dodgers = pending_boss
                            if player.action_is_charged and player.action_start < hit_tick/2 < player.action_end:
                                fail(f'p{external_id} cannot dodge during its charged-move animation.')
                            dodgers.add(i)
                            player.action_end = max(tick/2, player.action_end)+engine.DODGE_SECONDS
                        elif action == 'gem':
                            try:
                                sim.use_purified_gem(tick/2, i, strict=True)
                            except ValueError as error:
                                fail(str(error))
                        elif action == 'move':
                            if not player.on_field or player.hp <= 0:
                                fail(f'p{external_id} cannot attack from the lobby or with a fainted Pokémon.')
                            if tick/2 < player.action_end:
                                fail(f'p{external_id} is busy until {player.action_end:g}s.')
                            pokemon = player.pokemon
                            candidates = (pokemon.fast_move, pokemon.charged_move)
                            move = next((m for m in candidates if event['move_name'].casefold() in {
                                m.name.casefold(), engine.displayed_player_move_name(m, pokemon).casefold()}), None)
                            if move is None:
                                fail(f"{pokemon.species.name} is not configured with {event['move_name']}.")
                            if move is pokemon.charged_move:
                                if player.energy < move.energy:
                                    fail(f'p{external_id} needs {move.energy} energy but has {player.energy}.')
                                player.energy -= move.energy
                            player.action_start = tick/2
                            player.action_end = tick/2+move.duration
                            player.action_is_charged = move is pokemon.charged_move
                            push(tick+round(move.duration*2), 'player_hit', (i, player.generation, move))
                        if action != 'gem':
                            sim.record_replay_action(tick/2, 'player', i, action,
                                                    event.get('move_name') if action == 'move' else event.get('slot'))
            sim.capture_replay_state()
        source = 'recorded_timeline'
        if recording and sim.boss_hp > 0:
            finish_tick = limit
        if expected:
            finish_tick = min(limit, max(finish_tick, round(expected['finish_time']*2))) if sim.boss_hp > 0 else finish_tick
            matches = (max(0, sim.boss_hp) == expected['boss_hp'] and (sim.boss_hp <= 0) == expected['won']
                       and finish_tick == round(expected['finish_time']*2))
            if not matches:
                warnings.append('The reconstructed result differs from the Result preamble. The bars show calculated HP; '
                                'check edited events, data versions and the order of actions on the same tick.')

    final = dict(sim.frames[max(sim.frames)])
    final['tick'] = finish_tick
    sim.frames[finish_tick] = final
    metadata = []
    for i, player in enumerate(sim.players):
        metadata.append({
            'id': player_ids[i],
            'zacian_adventure_effect': engine.ZACIAN_ADVENTURE_EFFECT[i],
            'behemoth_bash_adventure_effect': (
                engine.BEHEMOTH_BASH_ADVENTURE_EFFECT[i]
            ),
            'dynamic_punch_adventure_effect': (
                engine.DYNAMIC_PUNCH_ADVENTURE_EFFECT[i]
            ),
            'team': [
            {'name': ('Shadow ' if m.is_shadow and not m.species.name.startswith('Shadow ') else '')+m.species.name,
             'max_hp': m.max_hp, 'types': m.species.types, 'level': m.level,
             'charged_energy': m.charged_move.energy}
            for m in player.team],
        })
    return {
        'replay': document, 'source': source, 'warnings': warnings, 'tick_seconds': 0.5,
        'duration_ticks': finish_tick, 'raid_ticks': round(engine.RAID_SECONDS*2),
        'boss': {'name': engine.BOSS_NAME, 'types': engine.BOSS_TYPES,
                 'max_hp': engine.BOSS_HP, 'max_energy': engine.BOSS_MAX_ENERGY},
        'players': metadata, 'frames': [sim.frames[t] for t in sorted(sim.frames)],
        'messages': sim.messages,
        'result': {'won': sim.boss_hp <= 0, 'boss_hp': max(0, sim.boss_hp), 'finish_time': finish_tick/2},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('replay', nargs='?', help='Compact battle .txt file')
    parser.add_argument('--output', help='Write playback states as JSON')
    parser.add_argument('--worker', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args()
    try:
        if args.worker:
            result = reconstruct(json.load(sys.stdin))
        else:
            if not args.replay:
                parser.error('provide a battle replay .txt file')
            result = build_playback(Path(args.replay).read_text(encoding='utf-8-sig'))
        serialized = json.dumps(result, ensure_ascii=True)
        if args.output:
            Path(args.output).write_text(serialized, encoding='utf-8')
        else:
            print(serialized)
    except (ValueError, KeyError, TypeError, OSError, subprocess.TimeoutExpired) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
