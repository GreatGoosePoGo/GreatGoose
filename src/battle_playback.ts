/** Native TypeScript port of the supplied Python reference. No Python runtime is used. */
import * as py from "./compatibility.js";
import { PythonRandom } from "./random.js";
import { re } from "./text.js";
import { parse_replay_text } from "./battle_replay.js";
import { createRaidEngine } from "./super_mega_raid_simulator.js";
import type { CalculatorEntry } from "./types.js";
/** Reconstruct compact raid replays with a private TypeScript battle engine.
 * Generated replays recover original event ordering only when both actions and
 * result verify against the seed. Edited timelines execute their recorded actions
 * with completed hits resolved before new actions on the same game tick.
 */
function replay_config(document: any): any {
    let players: any;
    let mapping: any;
    let i: any;
    let p: any;
    let teams: any;
    let player: any;
    let team: any;
    let member: any;
    let name: any;
    let shadow: any;
    let boss: any;
    let settings: any;
    let slot: any;
    let group: any;
    players = py.at(document, "players");
    if (py.truth(!py.truth(((1 <= py.len(players)) && (py.len(players) <= 40))))) {
        throw new Error("Playback supports 1–40 players.");
    }
    mapping = py.dict(py.iter(py.enumerate(players)).map(([i, p]: any) => ([py.at(p, "id"), i])));
    teams = [];
    for (const __item of py.iter(players)) {
        player = __item;
        if (py.truth(!py.truth(((1 <= py.len(py.at(player, "team"))) && (py.len(py.at(player, "team")) <= 6))))) {
            throw new Error(`p${py.str(py.at(player, "id"))}: define 1–6 Pokémon with species, moves and level. Example: Mewtwo / Confusion / Psystrike / L50 / 15-15-15`);
        }
        team = [];
        for (const __item of py.iter(py.at(player, "team"))) {
            member = __item;
            name = py.replaceString(py.replaceString(py.str(py.at(member, "name")), "Armoured", "Armored"), "armoured", "armored");
            shadow = py.get(member, "shadow", false);
            if (py.truth(py.startswith(py.lower(name), "shadow "))) {
                [name, shadow] = [py.strip(py.slice(name, 7, undefined)), true];
            }
            py.append(team, [name, py.at(member, "fast_move"), py.at(member, "charged_move"), py.at(member, "level"), py.get(member, "attack_iv", 15), py.get(member, "defense_iv", 15), py.get(member, "stamina_iv", 15), shadow, py.get(member, "mega_level", 1)]);
        }
        py.append(teams, team);
    }
    [boss, settings] = [py.at(document, "boss"), py.at(document, "settings")];
    if (py.truth(py.or(!py.truth(py.get(boss, "fast_move")), () => !py.truth(py.get(boss, "charged_move"))))) {
        throw new Error("Playback needs boss moves: Boss: FORM_ID; fast=Move; charged=Move");
    }
    if (py.truth(py.or(((py.at(py.at(document, "summary"), "last_tick") > 7200)), () => ((py.len(py.at(document, "events")) > 20000))))) {
        throw new Error("Replay exceeds the playback limit (3600 seconds or 20,000 events).");
    }
    return py.dict([["trials", 1], ["random_seed", py.get(settings, "random_seed", 0)], ["raid_difficulty", py.at(py.at(document, "raid"), "difficulty")], ["boss_form_id", py.at(boss, "form_id")], ["boss_fast_move_names", [py.at(boss, "fast_move")]], ["boss_charged_move_names", [py.at(boss, "charged_move")]], ["player_teams", teams], ["friendship_multipliers", py.iter(players).map((p: any) => (py.at(p, "friendship_multiplier")))], ["zacian_adventure_effect", py.iter(players).map((p: any) => (py.at(p, "zacian_adventure_effect")))], ["behemoth_bash_adventure_effect", py.iter(players).map((p: any) => (py.at(p, "behemoth_bash_adventure_effect")))], ["dynamic_punch_adventure_effect", py.iter(players).map((p: any) => (py.at(p, "dynamic_punch_adventure_effect")))], ["weather", py.at(settings, "weather")], ["dodge_strategy", py.or(py.at(settings, "dodge_strategy"), () => "none")], ["player_strategy", py.or(py.at(settings, "player_strategy"), () => "no_strategy")], ["catch_tank_team_indices", py.iter(players).map((p: any) => (py.iter(py.at(p, "catch_tank_slots")).map((slot: any) => (py.sub(slot, 1)))))], ["party_power_groups", py.iter(py.at(py.at(settings, "party_power"), "groups")).map((group: any) => (py.iter(group).map((p: any) => (py.at(mapping, p)))))], ["boosted_party_power", ((py.equal(py.at(py.at(settings, "party_power"), "mode"), "boosted")))], ["battle_log_mode", "none"]]);
}
function reconstruct(document: any, engine: any): any {
    let player_ids: any;
    let p: any;
    let id_to_index: any;
    let i: any;
    let fast: any;
    let charged: any;
    let sim: any;
    let warnings: any;
    let expected: any;
    let recording: any;
    let candidate: any;
    let result: any;
    let generated: any;
    let event: any;
    let finish_tick: any;
    let source: any;
    let queue: any;
    let sequence: any;
    let pending_boss: any;
    let boss_ready_tick: any;
    let in_lobby: any;
    let e: any;
    let limit: any;
    let tick: any;
    let _: any;
    let kind: any;
    let data: any;
    let move: any;
    let dodgers: any;
    let action: any;
    let hit_tick: any;
    let external_id: any;
    let player: any;
    let pokemon: any;
    let slot: any;
    let candidates: any;
    let m: any;
    let matches: any;
    let final: any;
    let metadata: any;
    let t: any;
    player_ids = py.iter(py.at(document, "players")).map((p: any) => (py.at(p, "id")));
    id_to_index = py.dict(py.iter(py.enumerate(player_ids)).map(([i, p]: any) => ([p, i])));
    fast = py.next(py.iter(py.values(engine.BOSS_FAST_MOVES)));
    charged = py.next(py.iter(py.values(engine.BOSS_CHARGED_MOVES)));
    class ObservedSimulation extends engine.Simulation {
        declare frames: any;
        declare messages: any;
        __post_init__(): any {
            super.__post_init__();
            this.frames = py.dict([]);
            this.messages = [];
        }
        notice(target: any, text: any, kind: any = "action", slot: any = null): any {
            py.append(this.messages, py.dict([["tick", py.round(py.mul(this.current_time, 2))], ["target", target], ["text", text], ["kind", kind], ["slot", slot]]));
        }
        record_replay_action(time: any, actor_kind: any, actor_id: any, action_kind: any, value: any = null): any {
            let target: any;
            let label: any;
            super.record_replay_action(time, actor_kind, actor_id, action_kind, value);
            target = (py.truth(((py.equal(actor_kind, "boss")))) ? "boss" : `p${py.str(py.at(player_ids, actor_id))}`);
            label = py.get(py.dict([["fast", fast.name], ["charged", charged.name], ["move", py.str(value)], ["switch", `Switch to slot ${py.str(value)}`], ["dodge", "Dodge"], ["quit", "In lobby"], ["rejoin", "Rejoined"]]), action_kind, action_kind);
            this.notice(target, label);
        }
        effectiveness_notice(move: any, types: any, target: any, slot: any = null): any {
            let multiplier: any;
            multiplier = engine.type_effectiveness(move.move_type, types);
            if (py.truth(((multiplier > 1.00001)))) {
                this.notice(target, "Super effective", "super", slot);
            }
            else {
                if (py.truth(((multiplier < 0.99999)))) {
                    this.notice(target, "Not very effective", "resisted", slot);
                }
            }
        }
        apply_player_hit(player_id: any, generation: any, move: any): any {
            let player: any;
            let hp: any;
            player = py.at(this.players, player_id);
            if (py.truth(py.or(!py.truth(player.on_field), () => ((!py.equal(player.generation, generation)))))) {
                return;
            }
            hp = this.boss_hp;
            super.apply_player_hit(player_id, generation, move);
            if (py.truth(((this.boss_hp < hp)))) {
                this.effectiveness_notice(move, engine.BOSS_TYPES, "boss");
            }
        }
        apply_boss_hit(move: any, dodgers: any): any {
            let i: any;
            let player: any;
            for (const __item of py.iter(py.enumerate(this.players))) {
                [i, player] = __item;
                if (py.truth(player.on_field)) {
                    this.effectiveness_notice(move, player.species.types, `p${py.str(py.at(player_ids, i))}`, py.add(player.pokemon_index, 1));
                    if (py.truth(((this.incoming_damage(move, i, player, ((py.has(dodgers, i)))) >= player.hp)))) {
                        this.notice(`p${py.str(py.at(player_ids, i))}`, `${py.str(player.species.name)} fainted`, "faint");
                    }
                }
            }
            super.apply_boss_hit(move, dodgers);
        }
        capture_replay_state(): any {
            let tick: any;
            let m: any;
            let i: any;
            let p: any;
            tick = py.round(py.mul(this.current_time, 2));
            this.frames[py.key(tick)] = py.dict([["tick", tick], ["boss_hp", py.max(0, this.boss_hp)], ["boss_energy", this.boss_energy], ["enraged", this.enraged], ["players", py.iter(py.enumerate(this.players)).map(([i, p]: any) => (py.dict([["id", py.at(player_ids, i)], ["slot", py.add(p.pokemon_index, 1)], ["on_field", p.on_field], ["hp", py.max(0, p.hp)], ["energy", p.energy], ["party_power", p.party_power_active], ["party_power_progress", p.party_power_progress], ["party_power_threshold", p.party_power_threshold], ["faints", p.faints], ["rejoins", p.rejoins], ["team", py.iter(p.team).map((m: any) => (py.dict([["hp", py.max(0, m.hp)], ["energy", m.energy]])))]])))]]);
        }
    }
    function make_sim(cls: any = ObservedSimulation): any {
        return new cls(fast, charged, new PythonRandom(py.get(py.at(document, "settings"), "random_seed", 0)), undefined, engine.BOSS_HP, undefined, undefined, undefined, undefined, undefined, true);
    }
    function signature(doc: any): any {
        let result: any;
        let event: any;
        let actors: any;
        let p: any;
        let actor: any;
        result = [];
        for (const __item of py.iter(py.at(doc, "events"))) {
            event = __item;
            actors = (py.truth(((py.equal(py.at(event, "actor_kind"), "boss")))) ? ["boss"] : py.iter(py.at(event, "players")).map((p: any) => (`p${py.str(p)}`)));
            for (const __item of py.iter(actors)) {
                actor = __item;
                py.append(result, [py.at(event, "tick"), actor, py.at(event, "kind"), py.get(event, "move_name"), py.get(event, "slot")]);
            }
        }
        return result;
    }
    sim = null;
    warnings = py.iter(py.at(document, "warnings"));
    expected = py.get(py.at(document, "settings"), "expected_result");
    recording = py.get(py.at(document, "settings"), "recording");
    if (py.truth(py.and(((py.has(py.at(document, "settings"), "random_seed"))), () => py.and(expected, () => !py.truth(recording))))) {
        candidate = make_sim();
        result = candidate.run();
        generated = parse_replay_text(engine.render_battle_replay(candidate, result, py.at(py.at(document, "settings"), "random_seed")));
        for (const __item of py.iter(py.at(generated, "events"))) {
            event = __item;
            event[py.key("players")] = py.iter(py.at(event, "players")).map((p: any) => (py.at(player_ids, py.sub(p, 1))));
        }
        if (py.truth(py.and(((py.equal(signature(generated), signature(document)))), () => ((py.equal(py.at(py.at(generated, "settings"), "expected_result"), expected)))))) {
            sim = candidate;
            finish_tick = py.round(py.mul(result.finish_time, 2));
            source = "verified_simulation";
        }
    }
    if (py.truth(((sim === null)))) {
        class TimelineSimulation extends ObservedSimulation {
            switch(time: any, player_id: any, tactical: any): any {
                let player: any;
                let explicit: any;
                let e: any;
                let next_index: any;
                let i: any;
                player = py.at(this.players, player_id);
                player.generation = py.add(player.generation, 1);
                player.on_field = false;
                player.action_end = time;
                player.action_is_charged = false;
                if (py.truth(recording)) {
                    return;
                }
                explicit = py.iter(py.iter(py.at(document, "events")).map((e: any) => (py.and(((py.equal(py.at(e, "tick"), py.round(py.mul(time, 2))))), () => py.and(((py.has(py.at(e, "players"), py.at(player_ids, player_id)))), () => ((py.has(new Set<any>(["switch", "quit"]), py.at(e, "kind"))))))))).some(py.truth);
                if (py.truth(!py.truth(explicit))) {
                    next_index = py.next(py.iter(py.range(py.add(player.pokemon_index, 1), py.len(player.team))).filter((i: any) => py.truth(((py.at(player.team, i).hp > 0)))).map((i: any) => (i)), null);
                    if (py.truth(((next_index !== null)))) {
                        player.pokemon_index = next_index;
                        player.on_field = true;
                        player.action_end = py.add(time, engine.SWITCH_SECONDS);
                        this.record_replay_action(time, "player", player_id, "switch", py.add(next_index, 1));
                    }
                    else {
                        in_lobby[py.key(player_id)] = true;
                        this.record_replay_action(time, "player", player_id, "quit");
                    }
                }
            }
        }
        sim = make_sim(TimelineSimulation);
        sim.capture_replay_state();
        queue = [];
        sequence = 0;
        pending_boss = null;
        boss_ready_tick = 0;
        in_lobby = py.mul([false], py.len(sim.players));
        function push(tick: any, kind: any, data: any): any {
            sequence = py.add(sequence, 1);
            py.heappush(queue, [tick, (py.truth(py.endswith(kind, "_hit")) ? 0 : 1), sequence, kind, data]);
        }
        for (const __item of py.iter(py.at(document, "events"))) {
            event = __item;
            push(py.at(event, "tick"), "action", event);
        }
        if (py.truth(py.iter(py.iter(py.at(document, "events")).map((e: any) => (py.and(((py.equal(py.at(e, "kind"), "move"))), () => !py.truth(py.get(e, "move_name")))))).some(py.truth))) {
            throw new Error("Declare each move code in the preamble, for example Move codes: sc=Shadow Claw.");
        }
        limit = py.round(py.mul(engine.RAID_SECONDS, 2));
        if (py.truth(recording)) {
            limit = py.at(recording, "through_tick");
            if (py.truth(!py.truth(((py.at(py.at(document, "summary"), "last_tick") <= limit) && (limit <= py.round(py.mul(engine.RAID_SECONDS, 2))))))) {
                throw new Error("Manual recording endpoint must include all actions and fit the raid timer.");
            }
        }
        finish_tick = 0;
        while (py.truth(queue)) {
            [tick, , , kind, data] = py.heappop(queue);
            if (py.truth(py.or(((tick > limit)), () => ((sim.boss_hp <= 0))))) {
                break;
            }
            sim.current_time = (tick / 2);
            finish_tick = tick;
            if (py.truth(((py.equal(kind, "player_hit"))))) {
                sim.apply_player_hit(...(data as [
                    any,
                    any,
                    any
                ]));
            }
            else {
                if (py.truth(((py.equal(kind, "boss_hit"))))) {
                    [move, dodgers] = data;
                    sim.apply_boss_hit(move, py.set(dodgers));
                    pending_boss = null;
                }
                else {
                    event = data;
                    action = py.at(event, "kind");
                    function fail(message: any): any {
                        throw new Error(`Line ${py.str(py.at(event, "source_line"))} (${py.format((tick / 2), `g`)}s): ${py.str(message)}`);
                    }
                    if (py.truth(((py.equal(py.at(event, "actor_kind"), "boss"))))) {
                        if (py.truth(((pending_boss !== null)))) {
                            fail("Boss starts a move before its previous move finishes.");
                        }
                        if (py.truth(((tick < boss_ready_tick)))) {
                            fail(`Boss is recovering until ${py.format((boss_ready_tick / 2), `g`)}s.`);
                        }
                        move = (py.truth(((py.equal(action, "boss_fast")))) ? fast : charged);
                        if (py.truth(((move === charged)))) {
                            if (py.truth(((sim.boss_energy < move.energy)))) {
                                fail(`Boss needs ${py.str(move.energy)} energy but has ${py.format(sim.boss_energy, `g`)}.`);
                            }
                            sim.boss_energy = py.sub(sim.boss_energy, move.energy);
                        }
                        else {
                            sim.boss_energy = py.min(engine.BOSS_MAX_ENERGY, py.add(sim.boss_energy, move.energy));
                        }
                        hit_tick = py.add(tick, py.round(py.mul(move.duration, 2)));
                        boss_ready_tick = py.add(hit_tick, (py.truth(((move === fast))) ? py.round(py.mul(engine.FAST_MOVE_DELAY, 2)) : 0));
                        dodgers = py.set();
                        pending_boss = [hit_tick, move, dodgers];
                        sim.record_replay_action((tick / 2), "boss", null, (py.truth(((move === fast))) ? "fast" : "charged"));
                        push(hit_tick, "boss_hit", [move, dodgers]);
                    }
                    else {
                        for (const __item of py.iter(py.at(event, "players"))) {
                            external_id = __item;
                            i = py.at(id_to_index, external_id);
                            player = py.at(sim.players, i);
                            if (py.truth(((py.equal(action, "rejoin"))))) {
                                if (py.truth(player.on_field)) {
                                    fail(`p${py.str(external_id)} is already on field; use q before r.`);
                                }
                                for (const __item of py.iter(player.team)) {
                                    pokemon = __item;
                                    pokemon.reset();
                                }
                                player.pokemon_index = sim.first_normal_index(player);
                                player.on_field = true;
                                player.generation = py.add(player.generation, 1);
                                player.rejoins = py.add(player.rejoins, 1);
                                player.action_end = (tick / 2);
                                player.action_is_charged = false;
                                in_lobby[py.key(i)] = false;
                            }
                            else {
                                if (py.truth(((py.equal(action, "quit"))))) {
                                    player.on_field = false;
                                    player.generation = py.add(player.generation, 1);
                                    player.action_end = (tick / 2);
                                    in_lobby[py.key(i)] = true;
                                    if (py.truth(pending_boss)) {
                                        py.discard(py.at(pending_boss, 2), i);
                                    }
                                }
                                else {
                                    if (py.truth(((py.equal(action, "switch"))))) {
                                        if (py.truth(py.at(in_lobby, i))) {
                                            fail(`p${py.str(external_id)} must rejoin with r before switching.`);
                                        }
                                        slot = py.sub(py.at(event, "slot"), 1);
                                        if (py.truth(((py.at(player.team, slot).hp <= 0)))) {
                                            fail(`p${py.str(external_id)} slot ${py.str(py.add(slot, 1))} has fainted.`);
                                        }
                                        player.generation = py.add(player.generation, 1);
                                        player.pokemon_index = slot;
                                        player.on_field = true;
                                        player.action_end = py.add((tick / 2), engine.SWITCH_SECONDS);
                                        player.action_is_charged = false;
                                        if (py.truth(pending_boss)) {
                                            py.discard(py.at(pending_boss, 2), i);
                                        }
                                    }
                                    else {
                                        if (py.truth(((py.equal(action, "dodge"))))) {
                                            if (py.truth(py.or(!py.truth(player.on_field), () => ((pending_boss === null))))) {
                                                fail(`p${py.str(external_id)} has no incoming boss move to dodge.`);
                                            }
                                            if (py.truth(((py.has(py.at(pending_boss, 2), i))))) {
                                                fail(`p${py.str(external_id)} already dodged this move.`);
                                            }
                                            [hit_tick, move, dodgers] = pending_boss;
                                            if (py.truth(py.and(player.action_is_charged, () => ((player.action_start < (hit_tick / 2)) && ((hit_tick / 2) < player.action_end))))) {
                                                fail(`p${py.str(external_id)} cannot dodge during its charged-move animation.`);
                                            }
                                            dodgers.add(i);
                                            player.action_end = py.add(py.max((tick / 2), player.action_end), engine.DODGE_SECONDS);
                                        }
                                        else {
                                            if (py.truth(((py.equal(action, "move"))))) {
                                                if (py.truth(py.or(!py.truth(player.on_field), () => ((player.hp <= 0))))) {
                                                    fail(`p${py.str(external_id)} cannot attack from the lobby or with a fainted Pokémon.`);
                                                }
                                                if (py.truth((((tick / 2) < player.action_end)))) {
                                                    fail(`p${py.str(external_id)} is busy until ${py.format(player.action_end, `g`)}s.`);
                                                }
                                                pokemon = player.pokemon;
                                                candidates = [pokemon.fast_move, pokemon.charged_move];
                                                move = py.next(py.iter(candidates).filter((m: any) => py.truth(((py.has(new Set<any>([py.lower(m.name), py.lower(engine.displayed_player_move_name(m, pokemon))]), py.lower(py.at(event, "move_name"))))))).map((m: any) => (m)), null);
                                                if (py.truth(((move === null)))) {
                                                    fail(`${py.str(pokemon.species.name)} is not configured with ${py.str(py.at(event, "move_name"))}.`);
                                                }
                                                if (py.truth(((move === pokemon.charged_move)))) {
                                                    if (py.truth(((player.energy < move.energy)))) {
                                                        fail(`p${py.str(external_id)} needs ${py.str(move.energy)} energy but has ${py.str(player.energy)}.`);
                                                    }
                                                    player.energy = py.sub(player.energy, move.energy);
                                                }
                                                player.action_start = (tick / 2);
                                                player.action_end = py.add((tick / 2), move.duration);
                                                player.action_is_charged = ((move === pokemon.charged_move));
                                                push(py.add(tick, py.round(py.mul(move.duration, 2))), "player_hit", [i, player.generation, move]);
                                            }
                                        }
                                    }
                                }
                            }
                            sim.record_replay_action((tick / 2), "player", i, action, (py.truth(((py.equal(action, "move")))) ? py.get(event, "move_name") : py.get(event, "slot")));
                        }
                    }
                }
            }
            sim.capture_replay_state();
        }
        source = "recorded_timeline";
        if (py.truth(py.and(recording, () => ((sim.boss_hp > 0))))) {
            finish_tick = limit;
        }
        if (py.truth(expected)) {
            finish_tick = (py.truth(((sim.boss_hp > 0))) ? py.min(limit, py.max(finish_tick, py.round(py.mul(py.at(expected, "finish_time"), 2)))) : finish_tick);
            matches = py.and(((py.equal(py.max(0, sim.boss_hp), py.at(expected, "boss_hp")))), () => py.and(((py.equal(((sim.boss_hp <= 0)), py.at(expected, "won")))), () => ((py.equal(finish_tick, py.round(py.mul(py.at(expected, "finish_time"), 2)))))));
            if (py.truth(!py.truth(matches))) {
                py.append(warnings, "The reconstructed result differs from the Result preamble. The bars show calculated HP; check edited events, data versions and the order of actions on the same tick.");
            }
        }
    }
    final = py.dict(py.at(sim.frames, py.max(sim.frames)));
    final[py.key("tick")] = finish_tick;
    sim.frames[py.key(finish_tick)] = final;
    metadata = [];
    for (const __item of py.iter(py.enumerate(sim.players))) {
        [i, player] = __item;
        py.append(metadata, py.dict([["id", py.at(player_ids, i)], ["zacian_adventure_effect", py.at(engine.ZACIAN_ADVENTURE_EFFECT, i)], ["behemoth_bash_adventure_effect", py.at(engine.BEHEMOTH_BASH_ADVENTURE_EFFECT, i)], ["dynamic_punch_adventure_effect", py.at(engine.DYNAMIC_PUNCH_ADVENTURE_EFFECT, i)], ["team", py.iter(player.team).map((m: any) => (py.dict([["name", py.add((py.truth(py.and(m.is_shadow, () => !py.truth(py.startswith(m.species.name, "Shadow ")))) ? "Shadow " : ""), m.species.name)], ["max_hp", m.max_hp], ["types", m.species.types], ["level", m.level], ["charged_energy", m.charged_move.energy]])))]]));
    }
    return py.dict([["replay", document], ["source", source], ["warnings", warnings], ["tick_seconds", 0.5], ["duration_ticks", finish_tick], ["raid_ticks", py.round(py.mul(engine.RAID_SECONDS, 2))], ["boss", py.dict([["name", engine.BOSS_NAME], ["types", engine.BOSS_TYPES], ["max_hp", engine.BOSS_HP], ["max_energy", engine.BOSS_MAX_ENERGY]])], ["players", metadata], ["frames", py.iter(py.sorted(sim.frames)).map((t: any) => (py.at(sim.frames, t)))], ["messages", sim.messages], ["result", py.dict([["won", ((sim.boss_hp <= 0))], ["boss_hp", py.max(0, sim.boss_hp)], ["finish_time", (finish_tick / 2)]])]]);
}
export { replay_config, reconstruct };
/** Parse and reconstruct with an isolated native engine and the static catalog. */
export function build_playback(text: string, catalog: CalculatorEntry[]): Record<string, any> {
    if (text.length > 2000000)
        throw new Error('Replay text is too large.');
    const document = parse_replay_text(text);
    const config = replay_config(document);
    const { raid, boss } = document;
    for (const [key, field] of [['boss_hp', 'boss_hp'], ['boss_cpm', 'boss_cpm'], ['timer_seconds', 'raid_seconds']]) {
        if (Object.hasOwn(raid, key)) {
            const value = raid[key];
            if (!(value > 0 && value <= (key === 'boss_cpm' ? 1 : 1000000)))
                throw new Error(`Invalid ${key}.`);
            config[field] = value;
        }
    }
    if (Object.hasOwn(boss, 'base_attack'))
        config.boss_manual_profile = {
            ...(boss.name ? { name: boss.name } : {}), attack: boss.base_attack, defense: boss.base_defense,
            types: boss.types,
        };
    const engine = createRaidEngine(config, catalog);
    if (engine.RAID_SECONDS > 3600)
        throw new Error('Replay timer must be at most 3600 seconds.');
    engine.validate_settings();
    if (document.summary.last_tick > Math.round(engine.RAID_SECONDS * 2))
        throw new Error('A recorded action occurs after the raid timer expires.');
    return reconstruct(document, engine);
}
