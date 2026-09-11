import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {battle_config, run_simulations} from '../../build/website_api.js';
import {createRaidEngine} from '../../build/super_mega_raid_simulator.js';

const catalog = JSON.parse(readFileSync(new URL('../../simulator/calculator_data.json', import.meta.url)));
const team = [{name:'MEWTWO',fast_move:'Confusion',charged_move:'Psystrike',level:50}];
const request = {boss:'KYOGRE',boss_fast_move:'Waterfall',boss_charged_move:'Hydro Pump',raid_difficulty:'Tier 5',random_seed:'42'};

test('individual friendship and Adventure Effects affect only their player', () => {
  const players = [
    {team, friendship:1.12, zacian_adventure_effect:true},
    {team, friendship:1.03, behemoth_bash_adventure_effect:true},
    {team, friendship:1},
  ];
  const config = battle_config({...request,players,seasonal_friendship:true},catalog);
  for (const [i, expected] of [1.24,1.06,1].entries()) assert(Math.abs(config.friendship_multipliers[i]-expected)<1e-12);
  assert.deepEqual(config.zacian_adventure_effect,[true,false,false]);
  assert.deepEqual(config.behemoth_bash_adventure_effect,[false,true,false]);
  const engine = createRaidEngine(config,catalog);
  const sim = engine.createSimulation({detailed:true});
  const move = sim.players[0].pokemon.fast_move;
  assert(sim.outgoing_damage(move,0)>sim.outgoing_damage(move,1));
  assert(sim.outgoing_damage(move,1)>sim.outgoing_damage(move,2));
  const bossMove = Object.values(engine.BOSS_FAST_MOVES)[0];
  assert(sim.incoming_damage(bossMove,1,sim.players[1],false)<sim.incoming_damage(bossMove,2,sim.players[2],false));
  const legacy = battle_config({...request,team,friendship:1.1,zacian_adventure_effect:true},catalog);
  assert.deepEqual(legacy.friendship_multipliers,[1.1]);
  assert.deepEqual(legacy.zacian_adventure_effect,[true]);
});

test('Party Power groups reach simulations and charge independently', () => {
  const players = [1,1,2,2,2,0].map(party_group=>({team,party_group}));
  const config = battle_config({...request,players},catalog);
  assert.deepEqual(config.party_power_groups,[[0,1],[2,3,4]]);
  const engine = createRaidEngine(config,catalog);
  const sim = engine.createSimulation({detailed:true});
  for (const player of sim.players.slice(0,5)) assert(player.party_power_threshold>0);
  assert.equal(sim.players[5].party_power_threshold,0);
  const p = sim.players[0];
  for(let i=0;i<p.party_power_threshold;i++) sim.charge_party_power(p);
  assert.equal(p.party_power_active,true);
  assert.equal(sim.players[1].party_power_active,false);
  assert(sim.outgoing_damage(p.pokemon.charged_move,0,true)>sim.outgoing_damage(p.pokemon.charged_move,0,false));
  sim.consume_party_power(p);
  assert.equal(p.party_power_active,false);
  const paired = players.slice(0,2);
  const enabled = run_simulations({...request,players:paired},catalog);
  const disabled = run_simulations({...request,players:paired.map(p=>({...p,party_group:0}))},catalog);
  assert(enabled.boss_hp<disabled.boss_hp);
  assert.match(enabled.replay_text,/groups=p1,2/);
  assert.throws(()=>battle_config({...request,players:[{team,party_group:1}]},catalog),/Party 1 needs/);
  assert.throws(()=>battle_config({...request,players:Array.from({length:5},()=>({team,party_group:1}))},catalog),/Party 1 needs/);
  assert.throws(()=>battle_config({...request,players:[{team,party_group:11}]},catalog),/Party Power group/);
});
