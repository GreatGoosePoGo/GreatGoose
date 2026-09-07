"""Manually controlled half-second battles using the canonical raid engine.

Import after RAID_SIM_CONFIG_PATH has been set. The web worker is isolated so
different battles cannot share the engine's module-level configuration.
"""
from __future__ import annotations

from heapq import heappop, heappush
import json
import sys
import super_mega_raid_simulator as engine


class ManualSimulation(engine.Simulation):
    def __post_init__(self):
        super().__post_init__()
        self.detailed = True
        self.tick = 0
        self.pending_boss = None
        self.lobby = False
        self.rejoin_at = 0.0
        self.stopped = False
        self.push(0, "boss_decision")
        self.resolve_until(0)

    def schedule_player(self, player_id, time):
        # Manual battles never enqueue an automatic player action.
        self.players[player_id].next_action_time = time

    def push(self, time, kind, data=()):
        self.sequence += 1
        if kind == "boss_hit":
            move, _ = data
            dodgers = set()
            data = (move, dodgers)
            self.pending_boss = (time, move, dodgers)
        priority = 0 if kind.endswith("_hit") else 1
        heappush(self.events, (time, priority, self.sequence, kind, data))

    def resolve_until(self, target):
        while self.events and self.events[0][0] <= target and self.boss_hp > 0:
            time, _, _, kind, data = heappop(self.events)
            self.current_time = time
            if kind == "boss_decision":
                # No new moves may begin when the raid timer has expired.
                if time < engine.RAID_SECONDS:
                    super().boss_decision(time)
            elif kind == "boss_hit":
                self.pending_boss = None
                super().apply_boss_hit(*data)
            elif kind == "player_hit":
                super().apply_player_hit(*data)
            elif kind == "gem_use":
                self.use_purified_gem(time, *data)
        if self.boss_hp > 0:
            self.current_time = target
        self.tick = round(self.current_time * 2)

    def enter_lobby(self):
        player = self.players[0]
        player.on_field = False
        player.generation += 1
        player.action_end = self.current_time
        player.action_is_charged = False
        self.lobby = True
        self.rejoin_at = self.current_time + self.rng.choice(engine.REJOIN_TIMES)
        self.record_replay_action(self.current_time, "player", 0, "quit")
        self.log(self.current_time, f"P1 enters lobby; ready to rejoin at {self.rejoin_at:.1f}s")
        if self.pending_boss:
            self.pending_boss[2].discard(0)

    def switch(self, time, player_id, tactical):
        # Faints pause the player's actions, not the boss or the raid clock.
        player = self.players[player_id]
        player.on_field = False
        player.generation += 1
        player.action_end = time
        player.action_is_charged = False
        self.log(time, f"P1 {player.species.name} fainted; choose a surviving slot")
        if not any(member.hp > 0 for member in player.team):
            self.enter_lobby()

    @property
    def finished(self):
        return self.stopped or self.boss_hp <= 0 or self.current_time >= engine.RAID_SECONDS

    def availability(self):
        p = self.players[0]
        alive = p.on_field and p.hp > 0
        animation_busy = alive and self.current_time < p.action_end
        ready = alive and not animation_busy
        dodge = ready and self.pending_boss is not None and 0 not in self.pending_boss[2]
        if dodge:
            hit_time = self.pending_boss[0]
            dodge = not (p.action_is_charged and p.action_start < hit_time < p.action_end)
        return {
            "fast": ready, "charged": ready and p.energy >= p.pokemon.charged_move.energy,
            "dodge": bool(dodge), "quit": not self.lobby,
            "rejoin": self.lobby and self.current_time >= self.rejoin_at,
            "switch_slots": [i+1 for i, m in enumerate(p.team)
                             if m.hp > 0 and (i != p.pokemon_index or not p.on_field)
                             and not self.lobby and not animation_busy],
        }

    def act(self, action, slot=None):
        if self.finished:
            raise ValueError("This battle has ended. Start a new battle to play again.")
        if action == "wait":
            return
        allowed = self.availability()
        if action == "switch":
            if type(slot) is not int or slot not in allowed["switch_slots"]:
                raise ValueError("That slot cannot switch in now.")
        elif action not in {"fast", "charged", "dodge", "quit", "rejoin"}:
            raise ValueError("Unknown player action.")
        elif not allowed[action]:
            raise ValueError(f"Cannot {action} now. Advance a turn or choose an available action.")
        p = self.players[0]
        time = self.current_time
        if action in {"fast", "charged"}:
            move = p.pokemon.fast_move if action == "fast" else p.pokemon.charged_move
            if action == "charged":
                p.energy -= move.energy
            p.action_start = time
            p.action_end = time + move.duration
            p.action_is_charged = action == "charged"
            name = engine.displayed_player_move_name(move, p.pokemon)
            self.record_replay_action(time, "player", 0, "move", name)
            self.log(time, f"P1 starts {name}; lands at {p.action_end:.1f}s", "move_start")
            self.push(p.action_end, "player_hit", (0, p.generation, move))
        elif action == "dodge":
            self.pending_boss[2].add(0)
            p.action_end = max(time, p.action_end) + engine.DODGE_SECONDS
            self.record_replay_action(time, "player", 0, "dodge")
            self.log(time, f"P1 dodges incoming {self.pending_boss[1].name}")
        elif action == "switch":
            p.generation += 1  # Cancel any departing Pokémon's unresolved hit.
            p.pokemon_index = slot - 1
            p.on_field = True
            p.switches += 1
            p.action_start = time
            p.action_end = time + engine.SWITCH_SECONDS
            p.action_is_charged = False
            if self.pending_boss:
                self.pending_boss[2].discard(0)
            self.record_replay_action(time, "player", 0, "switch", slot)
            self.log(time, f"P1 switches to slot {slot}: {p.species.name}")
        elif action == "quit":
            self.enter_lobby()
        elif action == "rejoin":
            p.rejoins += 1
            self.lobby = False
            super().rejoin(time, 0)

    def advance(self, action="wait", slot=None, *, snapshot=True):
        self.act(action, slot)
        self.resolve_until(min(engine.RAID_SECONDS, (self.tick+1)/2))
        return self.snapshot() if snapshot else None

    def recording(self):
        p = self.players[0]
        result = engine.TrialResult(self.boss_hp <= 0, self.current_time, max(0, self.boss_hp),
                                    p.switches, p.faints, 0, p.rejoins, 0,
                                    self.purified_gems_used)
        text = engine.render_battle_replay(self, result, engine.RANDOM_SEED)
        status = "stopped" if self.stopped else "finished" if self.finished else "in_progress"
        text = text.replace("\nEvents:",
                            f"\nRecording: manual; through={self.current_time:g}; status={status}\n\nEvents:")
        return text + "\n\n# Full event log (comments; compact actions above drive playback)\n" + \
            "\n".join("# " + line for line in self.event_log) + "\n"

    def snapshot(self):
        p = self.players[0]
        def member(m, i):
            return {"slot": i+1, "name": ("Shadow " if m.is_shadow and not m.species.name.startswith("Shadow ") else "") + m.species.name,
                    "types": list(m.species.types),
                    "hp": max(0, m.hp), "max_hp": m.max_hp, "energy": m.energy, "max_energy": 100,
                    "fast": engine.displayed_player_move_name(m.fast_move, m),
                    "fast_type": m.fast_move.move_type, "fast_seconds": m.fast_move.duration, "fast_energy": m.fast_move.energy,
                    "charged": engine.displayed_player_move_name(m.charged_move, m),
                    "charged_type": m.charged_move.move_type,
                    "charged_seconds": m.charged_move.duration, "charged_energy": m.charged_move.energy}
        status = "stopped" if self.stopped else "victory" if self.boss_hp <= 0 else \
            "time_expired" if self.current_time >= engine.RAID_SECONDS else "in_progress"
        current_action = next((engine.displayed_player_move_name(event[4][2], p.pokemon)
                               for event in self.events if event[3] == "player_hit"
                               and event[4][1] == p.generation), "Recovering")
        return {"tick": self.tick, "elapsed": self.current_time,
                "remaining": max(0, engine.RAID_SECONDS-self.current_time), "status": status,
                "seed": str(engine.RANDOM_SEED),
                "boss": {"name": engine.BOSS_NAME, "types": list(engine.BOSS_TYPES),
                         "hp": max(0, self.boss_hp), "max_hp": engine.BOSS_HP,
                         "energy": self.boss_energy, "max_energy": engine.BOSS_MAX_ENERGY,
                         "incoming": self.pending_boss[1].name if self.pending_boss else None,
                         "hits_at": self.pending_boss[0] if self.pending_boss else None,
                         "enraged": self.enraged,
                         "purified_gems_used": self.purified_gems_used,
                         "subdued": self.shadow_subdued},
                "player": dict(member(p.pokemon, p.pokemon_index), on_field=p.on_field,
                               current_action=current_action,
                               busy_until=p.action_end, in_lobby=self.lobby, rejoin_at=self.rejoin_at,
                               faints=p.faints, rejoins=p.rejoins,
                               purified_gems_used=p.purified_gems_used),
                "team": [member(m, i) for i, m in enumerate(p.team)],
                "available": self.availability(), "log": self.event_log,
                "replay_text": self.recording()}


def rebuild(request):
    engine.validate_settings()
    sim = ManualSimulation(next(iter(engine.BOSS_FAST_MOVES.values())),
                           next(iter(engine.BOSS_CHARGED_MOVES.values())),
                           engine.random.Random(engine.RANDOM_SEED), detailed=True)
    commands = {c["tick"]: c for c in request["commands"]}
    while sim.tick < request["tick"] and not sim.finished:
        command = commands.get(sim.tick, {})
        sim.advance(command.get("action", "wait"), command.get("slot"), snapshot=False)
    sim.stopped = request.get("stopped", False)
    return sim.snapshot()


if __name__ == "__main__":
    try:
        print(json.dumps(rebuild(json.load(sys.stdin))))
    except (ValueError, KeyError, TypeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
