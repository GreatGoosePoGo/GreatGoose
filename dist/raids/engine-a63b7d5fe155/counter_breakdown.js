/** On-demand diagnostics. These observers never alter battle decisions or RNG. */
import { counterCandidate, counterSimulation, prepareRaidCounterScenario } from './raid_counters.js';
/** Strict survival: damage equal to HP is a KO, not a survived hit. */
export function survivedHitLimit(hp, damage) {
    if (![hp, damage].every(Number.isFinite) || !(hp > 0) || !(damage > 0))
        throw new Error('HP and damage must be positive and finite.');
    return Math.max(0, Math.ceil(hp / damage) - 1);
}
/** Stable convolution for K ~ Binomial(n,p); handles p=0/1 and either damage ordering. */
export function binomialSurvival(hp, fastDamage, chargedDamage, p, hits) {
    if (![hp, fastDamage, chargedDamage, p].every(Number.isFinite)
        || hp <= 0 || fastDamage <= 0 || chargedDamage <= 0 || p < 0 || p > 1
        || !Number.isInteger(hits) || hits < 0 || hits > 500)
        throw new Error('Invalid binomial survival inputs.');
    let probabilities = [1];
    for (let n = 0; n < hits; n += 1) {
        const next = Array(n + 2).fill(0);
        for (let k = 0; k <= n; k += 1) {
            next[k] += probabilities[k] * (1 - p);
            next[k + 1] += probabilities[k] * p;
        }
        probabilities = next;
    }
    return Math.min(1, Math.max(0, probabilities.reduce((sum, probability, k) => sum + ((hits - k) * fastDamage + k * chargedDamage < hp ? probability : 0), 0)));
}
export function observeCounterTrial(simulation) {
    const player = simulation.players[0];
    const lives = [];
    let currentLives = new Map();
    const outings = [];
    let outing = { damage: 0, completed: false };
    let bossFastHits = 0;
    let bossChargedHits = 0;
    const touch = (index) => {
        let life = currentLives.get(index);
        if (!life) {
            life = { fast: 0, charged: 0, fastSurvived: 0, chargedSurvived: 0, fainted: false };
            currentLives.set(index, life);
            lives.push(life);
        }
        return life;
    };
    simulation.capture_replay_state = () => {
        if (player.on_field)
            touch(player.pokemon_index);
        if (!player.on_field && outing) {
            outing.completed = true;
            outings.push(outing);
            outing = null;
        }
    };
    const playerHit = simulation.apply_player_hit.bind(simulation);
    simulation.apply_player_hit = (id, generation, move) => {
        const life = player.on_field ? touch(player.pokemon_index) : null;
        const fastBefore = player.fast_moves_used;
        const chargedBefore = player.charged_moves_used;
        const hpBefore = Math.max(0, simulation.boss_hp);
        playerHit(id, generation, move);
        if (life) {
            life.fast += player.fast_moves_used - fastBefore;
            life.charged += player.charged_moves_used - chargedBefore;
        }
        if (outing)
            outing.damage += hpBefore - Math.max(0, simulation.boss_hp);
    };
    const bossHit = simulation.apply_boss_hit.bind(simulation);
    simulation.apply_boss_hit = (move, dodgers) => {
        const pokemon = player.pokemon;
        const life = player.on_field ? touch(player.pokemon_index) : null;
        const charged = move === simulation.boss_charged;
        // Fit the marginal probability to attacks that actually reach the team.
        if (life) {
            if (charged)
                bossChargedHits++;
            else
                bossFastHits++;
        }
        bossHit(move, dodgers);
        if (life) {
            if (pokemon.hp <= 0)
                life.fainted = true;
            else if (charged)
                life.chargedSurvived++;
            else
                life.fastSurvived++;
        }
    };
    const rejoin = simulation.rejoin.bind(simulation);
    simulation.rejoin = (time, id) => {
        currentLives = new Map();
        outing = { damage: 0, completed: false };
        rejoin(time, id);
    };
    return {
        finish() {
            if (outing)
                outings.push(outing);
            return { lives, outings, bossFastHits, bossChargedHits };
        },
    };
}
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const averageNullable = (values) => values.every(value => value !== null)
    ? mean(values) : null;
export function calculateCounterBreakdown(catalog, settings, pick, shadows = new Set(), legendaries = new Set(), trialsPerMoveset = 32) {
    if (!Number.isInteger(trialsPerMoveset) || trialsPerMoveset < 1 || trialsPerMoveset > 128) {
        throw new Error('Detail trials must be an integer from 1 through 128.');
    }
    const { engine, bossMovePairs, allBossMovePairs, level, megaLevel } = prepareRaidCounterScenario(catalog, settings);
    const candidate = counterCandidate(catalog, pick, settings, shadows, legendaries);
    const movesets = bossMovePairs.map(pair => {
        const lives = [];
        const outings = [];
        const firstOutingDamage = [];
        let fastHits = 0;
        let chargedHits = 0;
        let totalSeconds = 0;
        let totalDamage = 0;
        for (let trial = 0; trial < trialsPerMoveset; trial++) {
            const simulation = counterSimulation(engine, candidate, pair, level, megaLevel, trial);
            const observer = observeCounterTrial(simulation);
            const result = simulation.run();
            const observation = observer.finish();
            lives.push(...observation.lives);
            outings.push(...observation.outings);
            firstOutingDamage.push(observation.outings[0].damage);
            fastHits += observation.bossFastHits;
            chargedHits += observation.bossChargedHits;
            totalDamage += engine.BOSS_HP - result.boss_hp;
            totalSeconds += result.finish_time;
        }
        const fainted = lives.filter(life => life.fainted);
        const completed = outings.filter(outing => outing.completed);
        const partial = outings.filter(outing => !outing.completed);
        const observedChargedProbability = fastHits + chargedHits ? chargedHits / (fastHits + chargedHits) : null;
        const sample = counterSimulation(engine, candidate, pair, level, megaLevel, 0);
        const pokemon = sample.players[0].pokemon;
        const hp = pokemon.max_hp;
        // Hidden Power is fixed within a raid, uniformly random across raids.
        // Average probabilities for each possible type, never average damage first.
        const fastTypes = pair.engineFast.name === 'Hidden Power' ? engine.HIDDEN_POWER_TYPES : [pair.engineFast.move_type];
        const phases = (engine.SHADOW_RAID || engine.SUPER_MEGA_ENRAGE) ? [false, true] : [false];
        const survival = phases.map(enraged => {
            const fastDamages = fastTypes.map((type) => {
                const move = Object.assign(Object.create(Object.getPrototypeOf(pair.engineFast)), pair.engineFast, { move_type: type });
                return engine.incoming_damage_for_pokemon(move, pokemon, enraged, false, 1);
            });
            const chargedDamage = engine.incoming_damage_for_pokemon(pair.engineCharged, pokemon, enraged, false, 1);
            const dodgedChargedDamage = engine.incoming_damage_for_pokemon(pair.engineCharged, pokemon, enraged, true, 1);
            const combos = Array.from({ length: Math.min(12, survivedHitLimit(hp, chargedDamage) + 1) + 1 }, (_, charges) => {
                const hpRemaining = hp - charges * chargedDamage;
                return { chargedHits: charges, survives: hpRemaining > 0,
                    fastHitsMin: hpRemaining > 0 ? Math.min(...fastDamages.map(d => survivedHitLimit(hpRemaining, d))) : 0,
                    fastHitsMax: hpRemaining > 0 ? Math.max(...fastDamages.map(d => survivedHitLimit(hpRemaining, d))) : 0 };
            });
            const limit = Math.min(60, survivedHitLimit(hp, Math.min(chargedDamage, ...fastDamages)) + 1);
            const curve = Array.from({ length: limit + 1 }, (_, hits) => ({ hits,
                survivalProbability: observedChargedProbability === null ? null : mean(fastDamages.map(d => binomialSurvival(hp, d, chargedDamage, observedChargedProbability, hits))),
            }));
            return { phase: enraged ? 'Enraged' : 'Normal', hp,
                fastDamageMin: Math.min(...fastDamages), fastDamageMax: Math.max(...fastDamages),
                chargedDamage, dodgedChargedDamage,
                chargedHitsSurvived: survivedHitLimit(hp, chargedDamage), combos, curve,
                curveTruncated: limit === 60 && survivedHitLimit(hp, Math.min(chargedDamage, ...fastDamages)) >= 60 };
        });
        // 12+ tail keeps a bulky counter's distribution compact without losing probability mass.
        const cycleDistribution = Array.from({ length: 13 }, (_, cycles) => ({ cycles,
            probability: fainted.length ? fainted.filter(life => Math.min(12, life.charged) === cycles).length / fainted.length : null }));
        return { fastMoveId: pair.fastMove.id, chargedMoveId: pair.chargedMove.id,
            fastMove: pair.fastMove.name, chargedMove: pair.chargedMove.name,
            trials: trialsPerMoveset, hp, completedLives: fainted.length, unfinishedLives: lives.length - fainted.length,
            chargedCyclesPerLife: mean(fainted.map(life => life.charged)),
            fastMovesPerLife: mean(fainted.map(life => life.fast)),
            bossFastHitsSurvived: mean(fainted.map(life => life.fastSurvived)),
            bossChargedHitsSurvived: mean(fainted.map(life => life.chargedSurvived)),
            completedOutings: completed.length, partialOutings: partial.length,
            damagePerCompletedOuting: mean(completed.map(outing => outing.damage)),
            damagePerPartialOuting: mean(partial.map(outing => outing.damage)),
            firstOutingDamage: mean(firstOutingDamage),
            battleDps: totalDamage / Math.max(1e-9, totalSeconds),
            observedChargedProbability, cycleDistribution, survival, };
    });
    return {
        pick, bossHp: engine.BOSS_HP, trialsPerMoveset, simulatedBattles: movesets.length * trialsPerMoveset,
        totalBossMovesets: allBossMovePairs.length, movesets,
        // Equal weighting across tested movesets; null if any pair is entirely censored.
        average: {
            chargedCyclesPerLife: averageNullable(movesets.map(pair => pair.chargedCyclesPerLife)),
            fastMovesPerLife: averageNullable(movesets.map(pair => pair.fastMovesPerLife)),
            damagePerCompletedOuting: averageNullable(movesets.map(pair => pair.damagePerCompletedOuting)),
            firstOutingDamage: mean(movesets.map(pair => pair.firstOutingDamage)),
            cycleDistribution: Array.from({ length: 13 }, (_, cycles) => ({ cycles,
                probability: averageNullable(movesets.map(pair => pair.cycleDistribution[cycles].probability)) })),
            survival: movesets[0].survival.map((phase, phaseIndex) => ({ phase: phase.phase,
                curve: Array.from({ length: Math.max(...movesets.map(pair => pair.survival[phaseIndex].curve.length)) }, (_, hits) => ({ hits,
                    survivalProbability: averageNullable(movesets.map(pair => {
                        const curve = pair.survival[phaseIndex].curve;
                        return hits < curve.length ? curve[hits].survivalProbability : 0;
                    })),
                })),
            })),
        },
    };
}
//# sourceMappingURL=counter_breakdown.js.map