import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAutomaticRaidEngine } from '../../build/raid_engine_factory.js';

const catalog = JSON.parse(readFileSync(new URL('../../simulator/calculator_data.json', import.meta.url)));

function makeEngine() {
    return createAutomaticRaidEngine({
        trials: 1,
        random_seed: 42,
        raid_difficulty: 'Tier 3',
        boss_form_id: 'STARMIE',
        boss_fast_move_names: ['Water Gun'],
        boss_charged_move_names: ['Hydro Pump'],
        player_teams: [[
            ['MEWTWO', 'Confusion', 'Psystrike', 50, 15, 15, 15, false, 1],
            ['MEWTWO', 'Confusion', 'Psystrike', 50, 15, 15, 15, false, 1],
        ]],
        friendship_multipliers: [1],
        zacian_adventure_effect: [false],
        behemoth_bash_adventure_effect: [false],
        dynamic_punch_adventure_effect: [false],
        catch_tank_team_indices: [[1]],
        party_power_groups: [],
        weather: null,
        dodge_strategy: 'none',
        player_strategy: 'catch_tank',
        use_purified_gems: false,
        battle_log_mode: 'none',
    }, catalog);
}

test('catch tanks become available again after rejoin', () => {
    const engine = makeEngine();
    const simulation = engine.createSimulation();
    const player = simulation.players[0];

    assert.deepEqual(player.catch_tank_indices, [1]);
    assert.equal(simulation.next_unused_catch_tank_index(player), 1);

    // Model the end of the first outing after slot 2 has already catch-tanked.
    player.used_catch_tanks.add(1);
    player.catch_tank_active = true;
    player.catch_return_index = 0;
    player.catch_tanks_used = 1;
    player.on_field = false;
    for (const pokemon of player.team)
        pokemon.hp = 0;

    simulation.rejoin(20, 0);

    // Configuration survives, per-outing state resets, cumulative stat survives.
    assert.deepEqual(player.catch_tank_indices, [1]);
    assert.equal(player.used_catch_tanks.size, 0);
    assert.equal(player.catch_tank_active, false);
    assert.equal(player.catch_return_index, null);
    assert.equal(player.catch_tanks_used, 1);
    assert.equal(simulation.next_unused_catch_tank_index(player), 1);

    // The same configured slot can actually be used again in outing two.
    simulation.start_catch_tank(21, 0, 1);
    assert.equal(player.pokemon_index, 1);
    assert.equal(player.catch_tank_active, true);
    assert.equal(player.used_catch_tanks.has(1), true);
    assert.equal(player.catch_tanks_used, 2);
});
