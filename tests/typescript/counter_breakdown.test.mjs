import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculateCounterBreakdown, binomialSurvival, survivedHitLimit, observeCounterTrial} from '../../build/counter_breakdown.js';
import {calculateRaidCounters, prepareRaidCounterScenario, counterCandidate, counterSimulation, raidBossCatalog} from '../../build/raid_counters.js';

const catalog = JSON.parse(readFileSync(new URL('../../simulator/calculator_data.json', import.meta.url)));
const shadows = new Set(JSON.parse(readFileSync(new URL('../../simulator/shadow_availability.json', import.meta.url))).form_ids);
const legendaries = new Set(JSON.parse(readFileSync(new URL('../../simulator/ranking_categories.json', import.meta.url))).legendary_dex_numbers);
const boss = raidBossCatalog(catalog).find(boss => boss.formId === 'MEWTWO');
const entry = catalog.find(entry => entry.form_id === 'TYRANITAR');
const pick = {formId: entry.form_id, fastMoveId: entry.fast_moves[0].id, chargedMoveId: entry.charged_moves[0].id, shadow: false};
const settings = {bossFormId: boss.formId, raidDifficulty: 'Tier 5', includeShadows: true,
    bossFastMoveId: boss.fastMoves[0].id, bossChargedMoveId: boss.chargedMoves[0].id,
    prefilterLimit: 30, trialsPerBossMoveset: 1};
const near = (a, b, tolerance = 1e-10) => assert(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test('binomial survival is exact for the stated independent-hit model, including KO boundaries', () => {
    assert.equal(survivedHitLimit(100, 50), 1);
    assert.equal(survivedHitLimit(100, 101), 0);
    near(binomialSurvival(100, 10, 40, .5, 4), 5 / 16);
    near(binomialSurvival(100, 40, 10, .5, 4), 5 / 16);
    assert.equal(binomialSurvival(100, 10, 40, 0, 4), 1);
    assert.equal(binomialSurvival(100, 10, 40, 1, 4), 0);
    assert.equal(binomialSurvival(100, 25, 25, .4, 4), 0);
    assert.equal(binomialSurvival(100, 25, 25, .4, 0), 1);
    assert.throws(() => binomialSurvival(100, 10, 40, 1.1, 4), /Invalid/);
});

test('boss move filters narrow the actual simulations and difficulty uses one fixed lineup', () => {
    const selected = calculateRaidCounters(catalog, settings, shadows, legendaries);
    assert.equal(selected.bossMovesets, 1);
    assert.equal(selected.simulatedBattles, selected.simulatedMovesets);
    assert.equal(selected.movesetDifficulty[0].difficultyIndex, 100);
    near(selected.movesetDifficulty[0].averageBattleDps,
        selected.rows.reduce((sum, row) => sum + row.battleDps, 0) / selected.rows.length);
    const mixed = calculateRaidCounters(catalog, {...settings, bossChargedMoveId: ''}, shadows, legendaries);
    assert.equal(mixed.bossMovesets, boss.chargedMoveCount);
    assert(mixed.movesetDifficulty.every(pair => pair.fastMoveId === boss.fastMoves[0].id));
    for (const pair of mixed.movesetDifficulty) {
        near(pair.averageBattleDps, mixed.rows.reduce((sum, row) => sum + row.movesetResults.find(result => result.chargedMoveId === pair.chargedMoveId).battleDps, 0) / mixed.rows.length);
    }
    for (let i = 1; i < mixed.movesetDifficulty.length; i++) {
        assert(mixed.movesetDifficulty[i - 1].averageBattleDps <= mixed.movesetDifficulty[i].averageBattleDps);
    }
    assert.throws(() => calculateRaidCounters(catalog, {...settings, bossFastMoveId: 'NOT_A_MOVE'}), /belonging/);
});

test('detail observers preserve battle results and count actual landed actions and capped damage', () => {
    for (const strategies of [{}, {dodgeStrategy: 'lethal_only', playerStrategy: 'hot_swap_cautious'}]) {
        const selected = {...settings, ...strategies};
        const {engine, bossMovePairs, level, megaLevel} = prepareRaidCounterScenario(catalog, selected);
        const candidate = counterCandidate(catalog, pick, selected, shadows, legendaries);
        const control = counterSimulation(engine, candidate, bossMovePairs[0], level, megaLevel, 7);
        const detailed = counterSimulation(engine, candidate, bossMovePairs[0], level, megaLevel, 7);
        const observer = observeCounterTrial(detailed);
        const expected = control.run();
        const actual = detailed.run();
        assert.deepEqual(actual, expected);
        const data = observer.finish();
        const player = detailed.players[0];
        assert.equal(data.lives.reduce((sum, life) => sum + life.charged, 0), player.charged_moves_used);
        assert.equal(data.lives.reduce((sum, life) => sum + life.fast, 0), player.fast_moves_used);
        assert.equal(data.lives.filter(life => life.fainted).length, actual.faints);
        assert.equal(data.outings.filter(outing => outing.completed).length, actual.rejoins);
        assert.equal(data.outings.reduce((sum, outing) => sum + outing.damage, 0), engine.BOSS_HP - actual.boss_hp);
    }
});

test('detail cycles and probabilities are moveset-specific, reproducible and equally averaged', () => {
    const all = {...settings, bossChargedMoveId: ''};
    const details = calculateCounterBreakdown(catalog, all, pick, shadows, legendaries, 3);
    assert.equal(details.movesets.length, boss.chargedMoveCount);
    for (const pair of details.movesets) {
        const alone = calculateCounterBreakdown(catalog, {...all, bossChargedMoveId: pair.chargedMoveId}, pick, shadows, legendaries, 3);
        assert.deepEqual(alone.movesets[0], pair); // Same seeds regardless of selection.
        if (pair.completedLives) {
            near(pair.cycleDistribution.reduce((sum, bin) => sum + bin.probability, 0), 1);
            assert(pair.chargedCyclesPerLife >= 0);
        }
        assert(pair.firstOutingDamage >= 0 && pair.firstOutingDamage <= details.bossHp);
        for (const phase of pair.survival) {
            for (let i = 1; i < phase.curve.length; i++) {
                assert(phase.curve[i].survivalProbability <= phase.curve[i - 1].survivalProbability + 1e-10);
            }
        }
    }
    if (details.movesets.every(pair => pair.completedLives)) {
        near(details.average.chargedCyclesPerLife, details.movesets.reduce((sum, pair) => sum + pair.chargedCyclesPerLife, 0) / details.movesets.length);
    }
    near(details.average.firstOutingDamage, details.movesets.reduce((sum, pair) => sum + pair.firstOutingDamage, 0) / details.movesets.length);
});

test('short wins are partial outings, not invented full-life estimates', () => {
    const details = calculateCounterBreakdown(catalog, {...settings, raidDifficulty: 'Tier 1'}, pick, shadows, legendaries, 2);
    const pair = details.movesets[0];
    assert(pair.partialOutings > 0);
    assert(pair.firstOutingDamage <= details.bossHp);
    if (!pair.completedOutings) assert.equal(pair.damagePerCompletedOuting, null);
    if (!pair.completedLives) {
        assert.equal(pair.chargedCyclesPerLife, null);
        assert(pair.cycleDistribution.every(bin => bin.probability === null));
    }
});

test('survival uses engine weather/shadow damage and explicitly separates enrage phases', () => {
    const selected = {...settings, raidDifficulty: 'Tier 5 Shadow', weather: 'Windy'};
    const shadowPick = {...pick, shadow: true};
    const details = calculateCounterBreakdown(catalog, selected, shadowPick, shadows, legendaries, 2);
    const {engine, bossMovePairs, level, megaLevel} = prepareRaidCounterScenario(catalog, selected);
    const candidate = counterCandidate(catalog, shadowPick, selected, shadows, legendaries);
    const simulation = counterSimulation(engine, candidate, bossMovePairs[0], level, megaLevel, 0);
    const phases = details.movesets[0].survival;
    assert.equal(phases.length, 2);
    for (const [index, phase] of phases.entries()) {
        assert.equal(phase.chargedDamage, engine.incoming_damage_for_pokemon(simulation.boss_charged, simulation.players[0].pokemon, Boolean(index), false, 1));
    }
});

test('Hidden Power averages type-specific probabilities instead of rounding average damage', () => {
    const bossWithHiddenPower = raidBossCatalog(catalog).find(boss => boss.fastMoves.some(move => move.name === 'Hidden Power'));
    const selected = {...settings, bossFormId: bossWithHiddenPower.formId,
        bossFastMoveId: bossWithHiddenPower.fastMoves.find(move => move.name === 'Hidden Power').id,
        bossChargedMoveId: bossWithHiddenPower.chargedMoves[0].id};
    const details = calculateCounterBreakdown(catalog, selected, pick, shadows, legendaries, 2);
    const pair = details.movesets[0];
    assert(pair.survival[0].fastDamageMax > pair.survival[0].fastDamageMin);
    const {engine, bossMovePairs, level, megaLevel} = prepareRaidCounterScenario(catalog, selected);
    const candidate = counterCandidate(catalog, pick, selected, shadows, legendaries);
    const simulation = counterSimulation(engine, candidate, bossMovePairs[0], level, megaLevel, 0);
    for (const point of pair.survival[0].curve.slice(0, 10)) {
        const probabilities = engine.HIDDEN_POWER_TYPES.map(type => {
            const fast = {...simulation.boss_fast, move_type: type};
            const d = engine.incoming_damage_for_pokemon(fast, simulation.players[0].pokemon, false, false, 1);
            return binomialSurvival(pair.hp, d, pair.survival[0].chargedDamage, pair.observedChargedProbability, point.hits);
        });
        near(point.survivalProbability, probabilities.reduce((sum, p) => sum + p, 0) / probabilities.length);
    }
});
