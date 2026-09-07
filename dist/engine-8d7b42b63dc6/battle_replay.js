/** Native TypeScript port of the supplied Python reference. No Python runtime is used. */
import * as py from "./compatibility.js";
import { re } from "./text.js";
import { seconds_to_tick } from "./text.js";
let EVENT_RE;
let PLAYER_LINE_RE;
let ASSIGNMENT_RE;
let MOVE_CODE_RE;
/** Parser for Great Goose's compact, hand-written battle replay format.
 *
 * Timestamps become integer half-second ticks. Combat reconstruction lives in
 * battle_playback.ts, which reuses the simulation engine's battle mechanics.
 *  */
EVENT_RE = re.compile("^(?P<time>t\\d+(?:\\.\\d+)?|\\+\\d+(?:\\.\\d+)?)(?P<actor>b|p\\d+(?:,\\d+)*):(?P<action>[A-Za-z][A-Za-z0-9_+\\-]*)$");
PLAYER_LINE_RE = re.compile("^p(?P<player>\\d+)\\s*:\\s*(?P<team>.+)$", re.I);
ASSIGNMENT_RE = re.compile("^p(?P<player>\\d+)\\s*=\\s*(?P<value>.+)$", re.I);
MOVE_CODE_RE = re.compile("^[a-z][a-z0-9_+\\-]*$");
class ReplayParseError extends Error {
    line_number;
    constructor(line_number, message) {
        super(`Line ${line_number}: ${message}`);
        this.line_number = line_number;
        this.name = "ReplayParseError";
    }
}
class ReplayPlayer {
    player_id;
    team_text;
    team;
    friendship_multiplier;
    zacian_adventure_effect;
    behemoth_bash_adventure_effect;
    dynamic_punch_adventure_effect;
    catch_tank_slots;
    constructor(player_id, team_text = "", team = [], friendship_multiplier = 1.0, zacian_adventure_effect = false, behemoth_bash_adventure_effect = false, dynamic_punch_adventure_effect = false, catch_tank_slots = []) {
        this.player_id = player_id;
        this.team_text = team_text;
        this.team = team;
        this.friendship_multiplier = friendship_multiplier;
        this.zacian_adventure_effect = zacian_adventure_effect;
        this.behemoth_bash_adventure_effect = behemoth_bash_adventure_effect;
        this.dynamic_punch_adventure_effect = dynamic_punch_adventure_effect;
        this.catch_tank_slots = catch_tank_slots;
    }
    to_dict() {
        return py.dict([["id", this.player_id], ["label", `p${py.str(this.player_id)}`], ["team_text", this.team_text], ["team", this.team], ["friendship_multiplier", this.friendship_multiplier], ["zacian_adventure_effect", this.zacian_adventure_effect], ["behemoth_bash_adventure_effect", this.behemoth_bash_adventure_effect], ["dynamic_punch_adventure_effect", this.dynamic_punch_adventure_effect], ["catch_tank_slots", this.catch_tank_slots]]);
    }
}
class ReplayEvent {
    tick;
    players;
    action_kind;
    action_code;
    source_line;
    slot;
    actor_kind;
    constructor(tick, players, action_kind, action_code, source_line, slot = null, actor_kind = "players") {
        this.tick = tick;
        this.players = players;
        this.action_kind = action_kind;
        this.action_code = action_code;
        this.source_line = source_line;
        this.slot = slot;
        this.actor_kind = actor_kind;
    }
    get seconds() {
        return (this.tick / 2);
    }
    to_dict() {
        let player_label;
        let player;
        let description;
        if (py.truth(((py.equal(this.actor_kind, "boss"))))) {
            player_label = "Boss";
        }
        else {
            player_label = py.add(`p${py.str(py.at(this.players, 0))}`, py.join("", py.iter(py.slice(this.players, 1, undefined)).map((player) => (`,${py.str(player)}`))));
        }
        if (py.truth(((py.equal(this.action_kind, "boss_fast"))))) {
            description = "Boss starts its fast move";
        }
        else {
            if (py.truth(((py.equal(this.action_kind, "boss_charged"))))) {
                description = "Boss starts its charged move";
            }
            else {
                if (py.truth(((py.equal(this.action_kind, "move"))))) {
                    description = `Move ${py.str(this.action_code)}`;
                }
                else {
                    if (py.truth(((py.equal(this.action_kind, "dodge"))))) {
                        description = "Dodge";
                    }
                    else {
                        if (py.truth(((py.equal(this.action_kind, "switch"))))) {
                            description = `Switch to slot ${py.str(this.slot)}`;
                        }
                        else {
                            if (py.truth(((py.equal(this.action_kind, "quit"))))) {
                                description = "Quit to the lobby";
                            }
                            else {
                                description = "Rejoin with the same team";
                            }
                        }
                    }
                }
            }
        }
        return py.dict([["tick", this.tick], ["seconds", this.seconds], ["time_label", format_tick(this.tick)], ["players", py.iter(this.players)], ["player_label", player_label], ["actor_kind", this.actor_kind], ["kind", this.action_kind], ["code", this.action_code], ["slot", this.slot], ["description", description], ["source_line", this.source_line]]);
    }
}
function format_tick(tick) {
    let whole;
    let half;
    [whole, half] = py.divmod(tick, 2);
    return (py.truth(half) ? `${py.str(whole)}.5s` : `${py.str(whole)}s`);
}
function parse_bool(value, line_number) {
    let normalized;
    normalized = py.lower(py.strip(value));
    if (py.truth(((py.has(new Set(["true", "yes", "1", "on"]), normalized))))) {
        return true;
    }
    if (py.truth(((py.has(new Set(["false", "no", "0", "off"]), normalized))))) {
        return false;
    }
    throw new ReplayParseError(line_number, `Expected true or false, not "${py.str(py.strip(value))}".`);
}
function parse_player_assignments(value, line_number) {
    let assignments;
    let part;
    let match;
    let player_id;
    assignments = py.dict([]);
    for (const __item of py.iter(py.split(value, ";"))) {
        part = __item;
        part = py.strip(part);
        if (py.truth(!py.truth(part))) {
            continue;
        }
        match = ASSIGNMENT_RE.fullmatch(part);
        if (py.truth(!py.truth(match))) {
            throw new ReplayParseError(line_number, `Expected a player assignment such as "p1=value", not "${py.str(part)}".`);
        }
        player_id = py.int(match.group("player"));
        if (py.truth(((player_id < 1)))) {
            throw new ReplayParseError(line_number, "Player numbers start at 1.");
        }
        if (py.truth(((py.has(assignments, player_id))))) {
            throw new ReplayParseError(line_number, `p${py.str(player_id)} is assigned twice.`);
        }
        assignments[py.key(player_id)] = py.strip(match.group("value"));
    }
    return assignments;
}
function parse_player_group(value, line_number) {
    let players;
    let piece;
    let player;
    value = py.strip(value);
    if (py.truth(!py.truth(re.fullmatch("p\\d+(?:,\\d+)*", value, re.I)))) {
        throw new ReplayParseError(line_number, `Expected a group such as "p1,2", not "${py.str(value)}".`);
    }
    players = py.iter(py.split(py.slice(value, 1, undefined), ",")).map((piece) => (py.int(piece)));
    if (py.truth(py.iter(py.iter(players).map((player) => (((player < 1))))).some(py.truth))) {
        throw new ReplayParseError(line_number, "Player numbers start at 1.");
    }
    if (py.truth(((!py.equal(py.len(py.set(players)), py.len(players)))))) {
        throw new ReplayParseError(line_number, "A player cannot appear twice in one group.");
    }
    return players;
}
function parse_move_code_assignments(value, line_number) {
    let assignments;
    let part;
    let code;
    let move_name;
    let piece;
    assignments = py.dict([]);
    for (const __item of py.iter(py.split(value, ";"))) {
        part = __item;
        part = py.strip(part);
        if (py.truth(!py.truth(part))) {
            continue;
        }
        if (py.truth(((!py.has(part, "="))))) {
            throw new ReplayParseError(line_number, `Expected a move-code assignment such as "sc=Shadow Claw", not "${py.str(part)}".`);
        }
        [code, move_name] = py.iter(py.split(part, "=", 1)).map((piece) => (py.strip(piece)));
        code = py.lower(code);
        if (py.truth(!py.truth(MOVE_CODE_RE.fullmatch(code)))) {
            throw new ReplayParseError(line_number, `Invalid move code "${py.str(code)}".`);
        }
        if (py.truth(py.or(((py.has(new Set(["d", "q", "r"]), code))), () => re.fullmatch("s\\d+", code)))) {
            throw new ReplayParseError(line_number, `Move code "${py.str(code)}" is reserved for an action.`);
        }
        if (py.truth(!py.truth(move_name))) {
            throw new ReplayParseError(line_number, `Move code "${py.str(code)}" has no move name.`);
        }
        if (py.truth(((py.has(assignments, code))))) {
            throw new ReplayParseError(line_number, `Move code "${py.str(code)}" is assigned twice.`);
        }
        assignments[py.key(code)] = move_name;
    }
    if (py.truth(!py.truth(assignments))) {
        throw new ReplayParseError(line_number, "Move codes cannot be empty.");
    }
    return assignments;
}
function parse_short_boss(value, line_number) {
    let parts;
    let part;
    let boss;
    let key;
    let setting;
    let piece;
    parts = py.iter(py.split(value, ";")).filter((part) => py.truth(py.strip(part))).map((part) => (py.strip(part)));
    if (py.truth(!py.truth(parts))) {
        throw new ReplayParseError(line_number, "Boss is missing a form ID.");
    }
    boss = py.dict([["form_id", py.at(parts, 0)], ["name", null]]);
    for (const __item of py.iter(py.slice(parts, 1, undefined))) {
        part = __item;
        if (py.truth(((!py.has(part, "="))))) {
            throw new ReplayParseError(line_number, `Expected a boss setting such as "fast=Water Gun", not "${py.str(part)}".`);
        }
        [key, setting] = py.iter(py.split(part, "=", 1)).map((piece) => (py.strip(piece)));
        if (py.truth(((py.equal(py.lower(key), "fast"))))) {
            boss[py.key("fast_move")] = setting;
        }
        else {
            if (py.truth(((py.equal(py.lower(key), "charged"))))) {
                boss[py.key("charged_move")] = setting;
            }
            else {
                throw new ReplayParseError(line_number, `Unknown boss setting "${py.str(key)}".`);
            }
        }
    }
    return boss;
}
function pokemon_from_verbose_tuple(value, line_number) {
    let pokemon;
    if (py.truth(py.or(!py.truth(py.isinstance(value, "(tuple, list)")), () => ((py.len(value) < 4))))) {
        throw new ReplayParseError(line_number, "Each verbose team member must have at least four values.");
    }
    pokemon = py.dict([["name", py.at(value, 0)], ["fast_move", py.at(value, 1)], ["charged_move", py.at(value, 2)], ["level", py.at(value, 3)]]);
    if (py.truth(((py.len(value) >= 7)))) {
        py.update(pokemon, py.dict([["attack_iv", py.at(value, 4)], ["defense_iv", py.at(value, 5)], ["stamina_iv", py.at(value, 6)]]));
    }
    if (py.truth(((py.len(value) >= 8)))) {
        pokemon[py.key("shadow")] = py.truth(py.at(value, 7));
    }
    if (py.truth(((py.len(value) >= 9)))) {
        pokemon[py.key("mega_level")] = py.at(value, 8);
    }
    return pokemon;
}
function parse_verbose_teams(value, line_number) {
    let teams;
    let players;
    let index;
    let team;
    let member;
    try {
        teams = py.literal(value);
    }
    catch (error) {
        throw new ReplayParseError(line_number, "The verbose Player teams list is invalid.");
    }
    if (py.truth(py.or(!py.truth(py.isinstance(teams, "list")), () => !py.truth(teams)))) {
        throw new ReplayParseError(line_number, "Player teams must be a non-empty list.");
    }
    players = py.dict([]);
    for (const __item of py.iter(py.enumerate(teams, 1))) {
        [index, team] = __item;
        if (py.truth(py.or(!py.truth(py.isinstance(team, "list")), () => !py.truth(team)))) {
            throw new ReplayParseError(line_number, `p${py.str(index)} has an empty or invalid team.`);
        }
        players[py.key(index)] = new ReplayPlayer(index, py.repr(team), py.iter(team).map((member) => (pokemon_from_verbose_tuple(member, line_number))));
    }
    return players;
}
function parse_readable_team(text) {
    let result;
    let member;
    let parts;
    let part;
    let level;
    let ivs;
    let iv;
    /** Readable member fields use /; separate multiple team members with ;. */
    result = [];
    for (const __item of py.iter(py.split(text, ";"))) {
        member = __item;
        parts = py.iter(py.split(member, "/")).map((part) => (py.strip(part)));
        if (py.truth(((py.len(parts) < 4)))) {
            return [];
        }
        try {
            level = py.float(py.lstrip(py.at(parts, 3), "Ll"));
            ivs = (py.truth(((py.len(parts) > 4))) ? py.iter(py.split(py.at(parts, 4), "-")).map((iv) => (py.int(iv))) : py.mul([15], 3));
            if (py.truth(((!py.equal(py.len(ivs), 3))))) {
                return [];
            }
            py.append(result, py.dict(py.zip(["name", "fast_move", "charged_move", "level", "attack_iv", "defense_iv", "stamina_iv"], [...py.iter(py.slice(parts, undefined, 3)), level, ...py.iter(ivs)])));
        }
        catch (error) {
            return [];
        }
    }
    return result;
}
function parse_literal_list(value, line_number, label) {
    let parsed;
    try {
        parsed = py.literal(value);
    }
    catch (error) {
        throw new ReplayParseError(line_number, `The verbose ${py.str(label)} list is invalid.`);
    }
    if (py.truth(!py.truth(py.isinstance(parsed, "list")))) {
        throw new ReplayParseError(line_number, `${py.str(label)} must be a list.`);
    }
    return parsed;
}
function parse_event(line, line_number, previous_tick) {
    let match;
    let time_code;
    let tick;
    let actor;
    let action;
    let players;
    let piece;
    let player;
    let switch_match;
    let slot;
    match = EVENT_RE.fullmatch(line);
    if (py.truth(!py.truth(match))) {
        throw new ReplayParseError(line_number, "Expected an event such as t9p1:db, +1.5p1,2:s3, t12b:c, t30p1:q, or +4p1:r.");
    }
    time_code = match.group("time");
    if (py.truth(py.startswith(time_code, "+"))) {
        if (py.truth(((previous_tick === null)))) {
            throw new ReplayParseError(line_number, "The first event needs an absolute t timestamp.");
        }
        tick = py.add(previous_tick, seconds_to_tick(py.slice(time_code, 1, undefined), line_number));
    }
    else {
        tick = seconds_to_tick(py.slice(time_code, 1, undefined), line_number);
        if (py.truth(py.and(((previous_tick !== null)), () => ((tick < previous_tick))))) {
            throw new ReplayParseError(line_number, "Absolute event times cannot move backwards.");
        }
    }
    actor = py.lower(match.group("actor"));
    action = py.lower(match.group("action"));
    if (py.truth(((py.equal(actor, "b"))))) {
        if (py.truth(((py.equal(action, "f"))))) {
            return new ReplayEvent(tick, [], "boss_fast", action, line_number, undefined, "boss");
        }
        if (py.truth(((py.equal(action, "c"))))) {
            return new ReplayEvent(tick, [], "boss_charged", action, line_number, undefined, "boss");
        }
        throw new ReplayParseError(line_number, "Boss actions are \"b:f\" for its fast move or \"b:c\" for its charged move.");
    }
    players = py.iter(py.iter(py.split(py.slice(actor, 1, undefined), ",")).map((piece) => (py.int(piece))));
    if (py.truth(py.iter(py.iter(players).map((player) => (((player < 1))))).some(py.truth))) {
        throw new ReplayParseError(line_number, "Player numbers start at 1.");
    }
    if (py.truth(((!py.equal(py.len(py.set(players)), py.len(players)))))) {
        throw new ReplayParseError(line_number, "A player cannot appear twice in one event.");
    }
    if (py.truth(re.fullmatch("r\\d+", action))) {
        throw new ReplayParseError(line_number, "Rejoin is written as \"r\". Party presets such as \"r2\" do not exist yet.");
    }
    if (py.truth(((py.equal(action, "q"))))) {
        return new ReplayEvent(tick, players, "quit", action, line_number);
    }
    if (py.truth(((py.equal(action, "r"))))) {
        return new ReplayEvent(tick, players, "rejoin", action, line_number);
    }
    if (py.truth(((py.equal(action, "d"))))) {
        return new ReplayEvent(tick, players, "dodge", action, line_number);
    }
    switch_match = re.fullmatch("s(\\d+)", action);
    if (py.truth(switch_match)) {
        slot = py.int(switch_match.group(1));
        if (py.truth(((slot < 1)))) {
            throw new ReplayParseError(line_number, "Team slots start at 1.");
        }
        return new ReplayEvent(tick, players, "switch", action, line_number, slot);
    }
    return new ReplayEvent(tick, players, "move", action, line_number);
}
function parse_replay_text(text) {
    let lines;
    let start;
    let end;
    let raid;
    let boss;
    let players;
    let settings;
    let warnings;
    let move_codes;
    let events;
    let in_events;
    let in_teams;
    let previous_tick;
    let line_number;
    let raw_line;
    let line;
    let event;
    let player_line;
    let player_id;
    let team_text;
    let structured_team;
    let members;
    let member;
    let match;
    let verbose;
    let piece;
    let current_form;
    let value;
    let entries;
    let index;
    let entry;
    let weather_match;
    let weather;
    let prefix;
    let slots;
    let slot;
    let group_text;
    let raw_groups;
    let player;
    let group;
    let code;
    let move_name;
    let teamless;
    let labels;
    let player_ids;
    let unknown;
    let team;
    let known_settings_players;
    let ordered_players;
    let event_dicts;
    let event_dict;
    /** Parse replay text into a JSON-ready normalized document. */
    if (py.truth(py.or(!py.truth(py.isinstance(text, "str")), () => !py.truth(py.strip(text))))) {
        throw new ReplayParseError(1, "Replay text is empty.");
    }
    text = py.lstrip(text, "﻿");
    lines = py.splitlines(text);
    if (py.truth(((py.has(lines, "Battle replay:"))))) {
        start = py.add(py.index(lines, "Battle replay:"), 1);
        try {
            end = py.index(lines, "End battle replay", start);
        }
        catch (error) {
            throw new ReplayParseError(start, "The Battle replay section is incomplete.");
        }
        text = py.join("\n", py.slice(lines, start, end));
    }
    raid = py.dict([]);
    boss = py.dict([]);
    players = py.dict([]);
    settings = py.dict([["weather", null], ["dodge_strategy", null], ["player_strategy", null], ["party_power", py.dict([["mode", "normal"], ["groups", []]])]]);
    warnings = [];
    move_codes = py.dict([]);
    events = [];
    in_events = false;
    in_teams = false;
    previous_tick = null;
    for (const __item of py.iter(py.enumerate(py.splitlines(text), 1))) {
        [line_number, raw_line] = __item;
        line = py.strip(raw_line);
        if (py.truth(py.or(!py.truth(line), () => py.startswith(line, "#")))) {
            continue;
        }
        if (py.truth(((py.equal(py.lower(line), "events:"))))) {
            in_events = true;
            in_teams = false;
            continue;
        }
        if (py.truth(in_events)) {
            event = parse_event(line, line_number, previous_tick);
            py.append(events, event);
            previous_tick = event.tick;
            continue;
        }
        if (py.truth(((py.equal(py.lower(line), "teams:"))))) {
            in_teams = true;
            continue;
        }
        player_line = (py.truth(in_teams) ? PLAYER_LINE_RE.fullmatch(line) : null);
        if (py.truth(player_line)) {
            player_id = py.int(player_line.group("player"));
            if (py.truth(((player_id < 1)))) {
                throw new ReplayParseError(line_number, "Player numbers start at 1.");
            }
            if (py.truth(((py.has(players, player_id))))) {
                throw new ReplayParseError(line_number, `p${py.str(player_id)} has two team lines.`);
            }
            team_text = py.strip(player_line.group("team"));
            structured_team = [];
            if (py.truth(py.startswith(team_text, "["))) {
                members = parse_literal_list(team_text, line_number, `p${py.str(player_id)} team`);
                if (py.truth(!py.truth(members))) {
                    throw new ReplayParseError(line_number, `p${py.str(player_id)} has an empty team.`);
                }
                structured_team = py.iter(members).map((member) => (pokemon_from_verbose_tuple(member, line_number)));
            }
            else {
                structured_team = parse_readable_team(team_text);
            }
            players[py.key(player_id)] = new ReplayPlayer(player_id, team_text, structured_team);
            continue;
        }
        in_teams = false;
        if (py.truth(py.startswith(line, "Raid: "))) {
            raid[py.key("difficulty")] = py.strip(py.removeprefix(line, "Raid: "));
        }
        else {
            if (py.truth(py.startswith(line, "Raid difficulty: "))) {
                match = re.fullmatch("Raid difficulty:\\s*(?P<difficulty>[^;]+);\\s*boss HP\\s*(?P<hp>[\\d,]+);\\s*boss CPM\\s*(?P<cpm>[\\d.]+);\\s*timer\\s*(?P<timer>[\\d.]+)s", line, re.I);
                if (py.truth(!py.truth(match))) {
                    throw new ReplayParseError(line_number, "The verbose raid difficulty line is invalid.");
                }
                py.update(raid, py.dict([["difficulty", py.strip(match.group("difficulty"))], ["boss_hp", py.int(py.replaceString(match.group("hp"), ",", ""))], ["boss_cpm", py.float(match.group("cpm"))], ["timer_seconds", py.float(match.group("timer"))]]));
            }
            else {
                if (py.truth(py.startswith(line, "Boss: "))) {
                    verbose = re.fullmatch("Boss:\\s*(?P<name>.+?)\\s*\\((?P<form>[^;()]+);\\s*(?P<source>[^)]+)\\);\\s*types:\\s*(?P<types>[^;]+);\\s*base attack/defense:\\s*(?P<attack>\\d+)/(?P<defense>\\d+)", line, re.I);
                    if (py.truth(verbose)) {
                        py.update(boss, py.dict([["name", py.strip(verbose.group("name"))], ["form_id", py.strip(verbose.group("form"))], ["source", py.strip(verbose.group("source"))], ["types", py.iter(py.split(verbose.group("types"), "/")).map((piece) => (py.strip(piece)))], ["base_attack", py.int(verbose.group("attack"))], ["base_defense", py.int(verbose.group("defense"))]]));
                    }
                    else {
                        py.update(boss, parse_short_boss(py.removeprefix(line, "Boss: "), line_number));
                    }
                }
                else {
                    if (py.truth(py.startswith(line, "Boss moves: "))) {
                        current_form = py.get(boss, "form_id", "unknown");
                        py.update(boss, parse_short_boss(`${py.str(current_form)}; ${py.str(py.removeprefix(line, "Boss moves: "))}`, line_number));
                    }
                    else {
                        if (py.truth(py.startswith(line, "Player teams: "))) {
                            players = parse_verbose_teams(py.removeprefix(line, "Player teams: "), line_number);
                        }
                        else {
                            if (py.truth(py.startswith(line, "Friendship: "))) {
                                value = py.strip(py.removeprefix(line, "Friendship: "));
                                if (py.truth(py.startswith(value, "["))) {
                                    entries = parse_literal_list(value, line_number, "Friendship");
                                    for (const __item of py.iter(py.enumerate(entries, 1))) {
                                        [index, entry] = __item;
                                        py.setdefault(players, index, new ReplayPlayer(index)).friendship_multiplier = py.float(entry);
                                    }
                                }
                                else {
                                    for (const __item of py.iter(py.items(parse_player_assignments(value, line_number)))) {
                                        [player_id, entry] = __item;
                                        py.setdefault(players, player_id, new ReplayPlayer(player_id)).friendship_multiplier = py.float(entry);
                                    }
                                }
                            }
                            else {
                                if (py.truth(py.startswith(line, "Zacian effects: "))) {
                                    value = py.strip(py.removeprefix(line, "Zacian effects: "));
                                    weather_match = re.fullmatch("(?P<effects>\\[.*\\]);\\s*weather:\\s*(?P<weather>.+)", value, re.I);
                                    if (py.truth(weather_match)) {
                                        entries = parse_literal_list(weather_match.group("effects"), line_number, "Zacian effects");
                                        for (const __item of py.iter(py.enumerate(entries, 1))) {
                                            [index, entry] = __item;
                                            py.setdefault(players, index, new ReplayPlayer(index)).zacian_adventure_effect = py.truth(entry);
                                        }
                                        weather = py.strip(weather_match.group("weather"));
                                        settings[py.key("weather")] = (py.truth(((py.equal(py.lower(weather), "none")))) ? null : weather);
                                    }
                                    else {
                                        for (const __item of py.iter(py.items(parse_player_assignments(value, line_number)))) {
                                            [player_id, entry] = __item;
                                            py.setdefault(players, player_id, new ReplayPlayer(player_id)).zacian_adventure_effect = parse_bool(entry, line_number);
                                        }
                                    }
                                }
                                else {
                                    if (py.truth(py.startswith(line, "Behemoth Bash effects: "))) {
                                        value = py.strip(py.removeprefix(line, "Behemoth Bash effects: "));
                                        if (py.truth(py.startswith(value, "["))) {
                                            entries = parse_literal_list(value, line_number, "Behemoth Bash effects");
                                            for (const __item of py.iter(py.enumerate(entries, 1))) {
                                                [index, entry] = __item;
                                                py.setdefault(players, index, new ReplayPlayer(index)).behemoth_bash_adventure_effect = py.truth(entry);
                                            }
                                        }
                                        else {
                                            for (const __item of py.iter(py.items(parse_player_assignments(value, line_number)))) {
                                                [player_id, entry] = __item;
                                                py.setdefault(players, player_id, new ReplayPlayer(player_id)).behemoth_bash_adventure_effect = parse_bool(entry, line_number);
                                            }
                                        }
                                    }
                                    else {
                                        if (py.truth(py.startswith(line, ["Dynamic Punch+ effects: ", "Dynamic Punch effects: "]))) {
                                            prefix = (py.truth(py.startswith(line, "Dynamic Punch+ effects: ")) ? "Dynamic Punch+ effects: " : "Dynamic Punch effects: ");
                                            value = py.strip(py.removeprefix(line, prefix));
                                            if (py.truth(py.startswith(value, "["))) {
                                                entries = parse_literal_list(value, line_number, "Dynamic Punch effects");
                                                for (const __item of py.iter(py.enumerate(entries, 1))) {
                                                    [index, entry] = __item;
                                                    py.setdefault(players, index, new ReplayPlayer(index)).dynamic_punch_adventure_effect = py.truth(entry);
                                                }
                                            }
                                            else {
                                                for (const __item of py.iter(py.items(parse_player_assignments(value, line_number)))) {
                                                    [player_id, entry] = __item;
                                                    py.setdefault(players, player_id, new ReplayPlayer(player_id)).dynamic_punch_adventure_effect = parse_bool(entry, line_number);
                                                }
                                            }
                                        }
                                        else {
                                            if (py.truth(py.startswith(line, "Weather: "))) {
                                                weather = py.strip(py.removeprefix(line, "Weather: "));
                                                settings[py.key("weather")] = (py.truth(((py.equal(py.lower(weather), "none")))) ? null : weather);
                                            }
                                            else {
                                                if (py.truth(py.startswith(line, "Seed: "))) {
                                                    try {
                                                        settings[py.key("random_seed")] = py.parseSeed(py.strip(py.removeprefix(line, "Seed: ")));
                                                    }
                                                    catch (error) {
                                                        throw new ReplayParseError(line_number, "Seed must be a whole number.");
                                                    }
                                                }
                                                else {
                                                    if (py.truth(py.startswith(line, "Dodge: "))) {
                                                        settings[py.key("dodge_strategy")] = py.strip(py.removeprefix(line, "Dodge: "));
                                                    }
                                                    else {
                                                        if (py.truth(py.startswith(line, "Dodge strategy: "))) {
                                                            settings[py.key("dodge_strategy")] = py.strip(py.removeprefix(line, "Dodge strategy: "));
                                                        }
                                                        else {
                                                            if (py.truth(py.startswith(line, "Swap: "))) {
                                                                settings[py.key("player_strategy")] = py.strip(py.removeprefix(line, "Swap: "));
                                                            }
                                                            else {
                                                                if (py.truth(py.startswith(line, "Player strategy: "))) {
                                                                    settings[py.key("player_strategy")] = py.strip(py.removeprefix(line, "Player strategy: "));
                                                                }
                                                                else {
                                                                    if (py.truth(py.startswith(line, "Catch tanks: "))) {
                                                                        value = py.strip(py.removeprefix(line, "Catch tanks: "));
                                                                        for (const __item of py.iter(py.items(parse_player_assignments(value, line_number)))) {
                                                                            [player_id, entry] = __item;
                                                                            slots = (py.truth(((py.equal(entry, "-")))) ? [] : py.iter(py.split(entry, ",")).map((piece) => (py.int(py.strip(piece)))));
                                                                            if (py.truth(py.iter(py.iter(slots).map((slot) => (((slot < 1))))).some(py.truth))) {
                                                                                throw new ReplayParseError(line_number, "Catch-tank slots start at 1.");
                                                                            }
                                                                            py.setdefault(players, player_id, new ReplayPlayer(player_id)).catch_tank_slots = slots;
                                                                        }
                                                                    }
                                                                    else {
                                                                        if (py.truth(py.startswith(line, "Catch-tank team indexes: "))) {
                                                                            entries = parse_literal_list(py.removeprefix(line, "Catch-tank team indexes: "), line_number, "Catch-tank team indexes");
                                                                            for (const __item of py.iter(py.enumerate(entries, 1))) {
                                                                                [index, entry] = __item;
                                                                                if (py.truth(!py.truth(py.isinstance(entry, "list")))) {
                                                                                    throw new ReplayParseError(line_number, "Each catch-tank entry must be a list.");
                                                                                }
                                                                                py.setdefault(players, index, new ReplayPlayer(index)).catch_tank_slots = py.iter(entry).map((slot) => (py.add(py.int(slot), 1)));
                                                                            }
                                                                        }
                                                                        else {
                                                                            if (py.truth(py.startswith(line, "Party Power: "))) {
                                                                                value = py.strip(py.removeprefix(line, "Party Power: "));
                                                                                match = re.fullmatch("(?P<mode>[^;]+);\\s*groups\\s*[=:]\\s*(?P<groups>.+)", value, re.I);
                                                                                if (py.truth(!py.truth(match))) {
                                                                                    throw new ReplayParseError(line_number, "Party Power needs a mode and groups setting.");
                                                                                }
                                                                                py.at(settings, "party_power")[py.key("mode")] = py.strip(match.group("mode"));
                                                                                group_text = py.strip(match.group("groups"));
                                                                                if (py.truth(py.startswith(group_text, "["))) {
                                                                                    raw_groups = parse_literal_list(group_text, line_number, "Party Power groups");
                                                                                    py.at(settings, "party_power")[py.key("groups")] = py.iter(raw_groups).map((group) => (py.iter(group).map((player) => (py.add(py.int(player), 1)))));
                                                                                }
                                                                                else {
                                                                                    if (py.truth(((py.has(new Set(["", "-"]), group_text))))) {
                                                                                        py.at(settings, "party_power")[py.key("groups")] = [];
                                                                                    }
                                                                                    else {
                                                                                        py.at(settings, "party_power")[py.key("groups")] = py.iter(py.split(group_text, "|")).map((group) => (parse_player_group(group, line_number)));
                                                                                    }
                                                                                }
                                                                            }
                                                                            else {
                                                                                if (py.truth(py.startswith(line, "Move codes: "))) {
                                                                                    value = py.strip(py.removeprefix(line, "Move codes: "));
                                                                                    for (const __item of py.iter(py.items(parse_move_code_assignments(value, line_number)))) {
                                                                                        [code, move_name] = __item;
                                                                                        if (py.truth(((py.has(move_codes, code))))) {
                                                                                            throw new ReplayParseError(line_number, `Move code "${py.str(code)}" is assigned twice.`);
                                                                                        }
                                                                                        move_codes[py.key(code)] = move_name;
                                                                                    }
                                                                                }
                                                                                else {
                                                                                    if (py.truth(py.startswith(line, "Recording: "))) {
                                                                                        match = re.fullmatch("Recording: manual; through=([\\d.]+); status=(in_progress|stopped|finished)", line);
                                                                                        if (py.truth(!py.truth(match))) {
                                                                                            throw new ReplayParseError(line_number, "Invalid manual recording header.");
                                                                                        }
                                                                                        settings[py.key("recording")] = py.dict([["mode", "manual"], ["through_tick", seconds_to_tick(py.at(match, 1), line_number)], ["status", py.at(match, 2)]]);
                                                                                    }
                                                                                    else {
                                                                                        if (py.truth(py.startswith(line, "Result: "))) {
                                                                                            match = re.fullmatch("Result:\\s*(?P<outcome>win|loss);\\s*time=(?P<time>[\\d.]+);\\s*boss_hp=(?P<hp>\\d+)", line, re.I);
                                                                                            if (py.truth(!py.truth(match))) {
                                                                                                throw new ReplayParseError(line_number, "The replay Result line is invalid.");
                                                                                            }
                                                                                            settings[py.key("expected_result")] = py.dict([["won", ((py.equal(py.lower(match.group("outcome")), "win")))], ["finish_time", py.float(match.group("time"))], ["boss_hp", py.int(match.group("hp"))]]);
                                                                                        }
                                                                                        else {
                                                                                            if (py.truth(py.startswith(py.lower(line), "clock="))) {
                                                                                                py.append(warnings, `Line ${py.str(line_number)}: clock is unnecessary; all t values already mean elapsed battle time.`);
                                                                                            }
                                                                                            else {
                                                                                                py.append(warnings, `Line ${py.str(line_number)}: unrecognized preamble line was ignored: ${py.str(line)}`);
                                                                                            }
                                                                                        }
                                                                                    }
                                                                                }
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    if (py.truth(!py.truth(py.get(raid, "difficulty")))) {
        throw new ReplayParseError(1, "Missing a \"Raid:\" line.");
    }
    if (py.truth(!py.truth(py.get(boss, "form_id")))) {
        throw new ReplayParseError(1, "Missing a \"Boss:\" line.");
    }
    if (py.truth(!py.truth(players))) {
        throw new ReplayParseError(1, "Missing player teams under \"Teams:\" or \"Player teams:\".");
    }
    teamless = py.iter(py.values(players)).filter((player) => py.truth(!py.truth(player.team_text))).map((player) => (player.player_id));
    if (py.truth(teamless)) {
        labels = py.join(", ", py.iter(py.sorted(teamless)).map((player) => (`p${py.str(player)}`)));
        throw new ReplayParseError(1, `Missing team definition for ${py.str(labels)}.`);
    }
    if (py.truth(!py.truth(events))) {
        throw new ReplayParseError(1, "Missing events after an \"Events:\" line.");
    }
    player_ids = py.set(players);
    for (const __item of py.iter(events)) {
        event = __item;
        unknown = py.iter(event.players).filter((player) => py.truth(((!py.has(player_ids, player))))).map((player) => (player));
        if (py.truth(unknown)) {
            labels = py.join(", ", py.iter(unknown).map((player) => (`p${py.str(player)}`)));
            throw new ReplayParseError(event.source_line, `Event refers to undefined ${py.str(labels)}.`);
        }
        if (py.truth(((py.equal(event.action_kind, "switch"))))) {
            for (const __item of py.iter(event.players)) {
                player_id = __item;
                team = py.at(players, player_id).team;
                if (py.truth(py.and(team, () => py.and(((event.slot !== null)), () => ((event.slot > py.len(team))))))) {
                    throw new ReplayParseError(event.source_line, `p${py.str(player_id)} only has ${py.str(py.len(team))} team slots; cannot switch to slot ${py.str(event.slot)}.`);
                }
            }
        }
        if (py.truth(py.and(move_codes, () => py.and(((py.equal(event.action_kind, "move"))), () => ((!py.has(move_codes, event.action_code))))))) {
            throw new ReplayParseError(event.source_line, `Move code "${py.str(event.action_code)}" is not declared by Move codes.`);
        }
    }
    known_settings_players = py.set(players);
    for (const __item of py.iter(py.at(py.at(settings, "party_power"), "groups"))) {
        group = __item;
        unknown = py.iter(group).filter((player) => py.truth(((!py.has(known_settings_players, player))))).map((player) => (player));
        if (py.truth(unknown)) {
            labels = py.join(", ", py.iter(unknown).map((player) => (`p${py.str(player)}`)));
            throw new ReplayParseError(1, `Party Power group refers to undefined ${py.str(labels)}.`);
        }
    }
    if (py.truth(py.or(!py.truth(py.get(boss, "fast_move")), () => !py.truth(py.get(boss, "charged_move"))))) {
        py.append(warnings, "Boss fast and charged moves are not specified; they will be required for damage reconstruction.");
    }
    ordered_players = py.iter(py.sorted(players)).map((player_id) => (py.at(players, player_id)));
    event_dicts = [];
    for (const __item of py.iter(events)) {
        event = __item;
        event_dict = event.to_dict();
        if (py.truth(py.and(((py.equal(event.action_kind, "move"))), () => ((py.has(move_codes, event.action_code)))))) {
            move_name = py.at(move_codes, event.action_code);
            event_dict[py.key("move_name")] = move_name;
            event_dict[py.key("description")] = `Move ${py.str(event.action_code)} — ${py.str(move_name)}`;
        }
        else {
            if (py.truth(py.and(((py.equal(event.action_kind, "boss_fast"))), () => py.get(boss, "fast_move")))) {
                event_dict[py.key("move_name")] = py.at(boss, "fast_move");
                event_dict[py.key("description")] = `Boss starts ${py.str(py.at(boss, "fast_move"))}`;
            }
            else {
                if (py.truth(py.and(((py.equal(event.action_kind, "boss_charged"))), () => py.get(boss, "charged_move")))) {
                    event_dict[py.key("move_name")] = py.at(boss, "charged_move");
                    event_dict[py.key("description")] = `Boss starts ${py.str(py.at(boss, "charged_move"))}`;
                }
            }
        }
        py.append(event_dicts, event_dict);
    }
    return py.dict([["format", "Great Goose replay text v1"], ["time_unit", "seconds"], ["tick_seconds", 0.5], ["raid", raid], ["boss", boss], ["players", py.iter(ordered_players).map((player) => (player.to_dict()))], ["settings", settings], ["move_codes", move_codes], ["events", event_dicts], ["warnings", warnings], ["summary", py.dict([["player_count", py.len(ordered_players)], ["event_count", py.len(events)], ["last_tick", py.at(events, -1).tick], ["last_time_label", format_tick(py.at(events, -1).tick)]])]]);
}
export { ReplayParseError, parse_replay_text };
//# sourceMappingURL=battle_replay.js.map