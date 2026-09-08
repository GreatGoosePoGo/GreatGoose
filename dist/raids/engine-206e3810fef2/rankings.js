export const RANKING_TYPES = [
    'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting',
    'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost',
    'dragon', 'dark', 'steel', 'fairy',
];
export const BOSS_MOVE_TYPES = ['typeless', ...RANKING_TYPES];
export const BOSS_ATTACK_LEVELS = ['low', 'medium', 'high'];
export const MEGA_LEVELS = [1, 2, 3, 4];
/**
 * Mega forms whose Super Max eligibility and additional charged move were
 * released by 2026-09-08. Keeping this form-specific avoids granting announced
 * or future "+" moves before they are actually available in Pokémon GO.
 */
export const RELEASED_MEGA_PLUS_FORM_IDS = new Set([
    'BEEDRILL_MEGA',
    'RAICHU_MEGA_X',
    'RAICHU_MEGA_Y',
    'VICTREEBEL_MEGA',
    'STARMIE_MEGA',
    'DRAGONITE_MEGA',
    'MEWTWO_MEGA_X',
    'MEWTWO_MEGA_Y',
    'HOUNDOOM_MEGA',
    'SKARMORY_MEGA',
    'CHESNAUGHT_MEGA',
    'DELPHOX_MEGA',
    'GRENINJA_MEGA',
    'MALAMAR_MEGA',
    'FALINKS_MEGA',
]);
const LEVEL = 40;
const LEVEL_40_CPM = 0.79030001;
const LEVEL_42_CPM = 0.8003;
const ATTACK_IV = 15;
const DEFENSE_IV = 15;
const STAMINA_IV = 15;
const STAB = 1.2;
const SUPER_EFFECTIVE = 1.6;
// V1 neutral-ranking assumptions. Keep these together so later experiments
// change the model rather than scattering unexplained constants through it.
const TARGET_DEFENSES = [160, 180, 200, 220, 240];
const PULSE_SECONDS_MIN = 3;
const PULSE_SECONDS_MAX = 4;
const PULSE_SCHEDULE_COUNT = 32;
const CONTINUATION_SAMPLES = 32;
const MINIMUM_CHARGED_PROBABILITY = 0.10;
const BOSS_ATTACK_COEFFICIENTS = {
    low: 675,
    medium: 900,
    high: 1125,
};
const SWITCH_SECONDS = 1;
const RELOBBY_SECONDS = 10;
const TEAM_SIZE = 6;
const SHADOW_OUTGOING_MULTIPLIER = 1.2;
const SHADOW_INCOMING_MULTIPLIER = 1.2;
const EPSILON = 1e-9;
const TYPE_RELATIONSHIPS = {
    normal: { superEffective: new Set(), resisted: new Set(['rock', 'steel']), immune: new Set(['ghost']) },
    fire: { superEffective: new Set(['grass', 'ice', 'bug', 'steel']), resisted: new Set(['fire', 'water', 'rock', 'dragon']), immune: new Set() },
    water: { superEffective: new Set(['fire', 'ground', 'rock']), resisted: new Set(['water', 'grass', 'dragon']), immune: new Set() },
    electric: { superEffective: new Set(['water', 'flying']), resisted: new Set(['electric', 'grass', 'dragon']), immune: new Set(['ground']) },
    grass: { superEffective: new Set(['water', 'ground', 'rock']), resisted: new Set(['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel']), immune: new Set() },
    ice: { superEffective: new Set(['grass', 'ground', 'flying', 'dragon']), resisted: new Set(['fire', 'water', 'ice', 'steel']), immune: new Set() },
    fighting: { superEffective: new Set(['normal', 'ice', 'rock', 'dark', 'steel']), resisted: new Set(['poison', 'flying', 'psychic', 'bug', 'fairy']), immune: new Set(['ghost']) },
    poison: { superEffective: new Set(['grass', 'fairy']), resisted: new Set(['poison', 'ground', 'rock', 'ghost']), immune: new Set(['steel']) },
    ground: { superEffective: new Set(['fire', 'electric', 'poison', 'rock', 'steel']), resisted: new Set(['grass', 'bug']), immune: new Set(['flying']) },
    flying: { superEffective: new Set(['grass', 'fighting', 'bug']), resisted: new Set(['electric', 'rock', 'steel']), immune: new Set() },
    psychic: { superEffective: new Set(['fighting', 'poison']), resisted: new Set(['psychic', 'steel']), immune: new Set(['dark']) },
    bug: { superEffective: new Set(['grass', 'psychic', 'dark']), resisted: new Set(['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy']), immune: new Set() },
    rock: { superEffective: new Set(['fire', 'ice', 'flying', 'bug']), resisted: new Set(['fighting', 'ground', 'steel']), immune: new Set() },
    ghost: { superEffective: new Set(['psychic', 'ghost']), resisted: new Set(['dark']), immune: new Set(['normal']) },
    dragon: { superEffective: new Set(['dragon']), resisted: new Set(['steel']), immune: new Set(['fairy']) },
    dark: { superEffective: new Set(['psychic', 'ghost']), resisted: new Set(['fighting', 'dark', 'fairy']), immune: new Set() },
    steel: { superEffective: new Set(['ice', 'rock', 'fairy']), resisted: new Set(['fire', 'water', 'electric', 'steel']), immune: new Set() },
    fairy: { superEffective: new Set(['fighting', 'dragon', 'dark']), resisted: new Set(['fire', 'poison', 'steel']), immune: new Set() },
};
// These are duplicate Game Master templates used for Shadow encounters, not
// separate species. Their ordinary forms receive the Shadow variant instead.
const INTERNAL_SHADOW_FORM_IDS = new Set([
    'RAIKOU_S', 'ENTEI_S', 'SUICUNE_S', 'LUGIA_S',
    'HO_OH_S', 'LATIAS_S', 'LATIOS_S',
]);
function normalizeType(value) {
    return value.trim().toLowerCase();
}
function bossMoveEffectiveness(moveType, defenderTypes) {
    if (moveType === 'typeless')
        return 1;
    const relationships = TYPE_RELATIONSHIPS[moveType];
    return defenderTypes.reduce((multiplier, defenderType) => {
        const normalized = normalizeType(defenderType);
        if (relationships.immune.has(normalized))
            return multiplier * 0.390625;
        if (relationships.superEffective.has(normalized))
            return multiplier * 1.6;
        if (relationships.resisted.has(normalized))
            return multiplier * 0.625;
        return multiplier;
    }, 1);
}
function isMegaOrPrimal(entry) {
    const parts = entry.form_id.toUpperCase().split('_');
    return parts.includes('MEGA') || parts.includes('PRIMAL');
}
function uniqueMoves(moves) {
    const result = new Map();
    for (const move of moves) {
        const key = move.id || `${move.name}:${move.type}:${move.energy}`;
        if (!result.has(key))
            result.set(key, move);
    }
    return [...result.values()];
}
function playerFastMoves(entry) {
    return uniqueMoves([
        ...entry.fast_moves,
        ...(entry.exclusive_fast_moves ?? []),
    ]);
}
function playerChargedMoves(entry) {
    return uniqueMoves([
        ...entry.charged_moves,
        ...(entry.exclusive_charged_moves ?? []),
        ...(RELEASED_MEGA_PLUS_FORM_IDS.has(entry.form_id)
            ? entry.mega_charged_moves ?? [] : []),
    ]);
}
function effectiveStats(entry, megaLevel) {
    const cpm = megaLevel === 4 && RELEASED_MEGA_PLUS_FORM_IDS.has(entry.form_id)
        ? LEVEL_42_CPM : LEVEL_40_CPM;
    return {
        attack: (entry.stats.attack + ATTACK_IV) * cpm,
        defense: (entry.stats.defense + DEFENSE_IV) * cpm,
        hp: Math.max(10, Math.floor((entry.stats.stamina + STAMINA_IV) * cpm)),
    };
}
function movePower(move, megaLevel) {
    if (!move.plus_powers)
        return move.power;
    const power = move.plus_powers[megaLevel - 1];
    if (!Number.isFinite(power) || power <= 0) {
        throw new Error(`Invalid Mega Level ${megaLevel} power for ${move.name}.`);
    }
    return power;
}
function displayedMoveName(move, megaLevel) {
    if (!move.plus_powers)
        return move.name;
    return `${move.name.replace(/\++$/, '')}${'+'.repeat(megaLevel)}`;
}
function moveDamage(entry, move, attackType, shadow, targetDefense, attack, megaLevel) {
    let moveType = normalizeType(move.type);
    // In an ideal type ranking, Hidden Power is the selected legal type. It can
    // never be Normal or Fairy in Pokémon GO.
    if (move.id === 'HIDDEN_POWER_FAST' && attackType !== 'normal' && attackType !== 'fairy') {
        moveType = attackType;
    }
    const stab = entry.types.some(type => normalizeType(type) === moveType) ? STAB : 1;
    const effectiveness = moveType === attackType ? SUPER_EFFECTIVE : 1;
    const shadowMultiplier = shadow ? SHADOW_OUTGOING_MULTIPLIER : 1;
    return Math.floor(0.5 * movePower(move, megaLevel) * attack / targetDefense
        * stab * effectiveness * shadowMultiplier) + 1;
}
function preparedMove(entry, move, attackType, shadow, targetDefense, attack, megaLevel) {
    return {
        move,
        damage: moveDamage(entry, move, attackType, shadow, targetDefense, attack, megaLevel),
        energy: Math.abs(move.energy),
        duration: move.duration_ms / 1000,
    };
}
/** Exact steady-state fast/charged cycle DPS with no incoming damage. */
function simpleCycleDps(fast, charged) {
    let energy = 0;
    let damage = 0;
    let time = 0;
    const firstSeen = new Map();
    for (let steps = 0; steps < 1000; steps += 1) {
        const seen = firstSeen.get(energy);
        if (seen)
            return (damage - seen.damage) / (time - seen.time);
        firstSeen.set(energy, { damage, time });
        if (energy >= charged.energy) {
            energy -= charged.energy;
            damage += charged.damage;
            time += charged.duration;
        }
        else {
            energy = Math.min(100, energy + fast.energy);
            damage += fast.damage;
            time += fast.duration;
        }
    }
    throw new Error('Simple cycle did not repeat.');
}
function unitRandom(seed, index, stream) {
    let value = seed ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(stream + 1, 0x85ebca6b);
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b);
    value ^= value >>> 16;
    return (value >>> 0) / 0x100000000;
}
function pulseInterval(seed, index) {
    return PULSE_SECONDS_MIN
        + (PULSE_SECONDS_MAX - PULSE_SECONDS_MIN) * unitRandom(seed, index, 0);
}
function pulseDamage(seed, index, interval, stats, bossAttackCoefficient, shadow) {
    // Pulse size varies around the selected smoothed boss Attack while keeping
    // the average pressure unchanged. Probabilistic integer rounding avoids a
    // new synthetic breakpoint in the incoming damage model.
    const sizeMultiplier = 0.7 + 0.6 * unitRandom(seed, index, 1);
    const raw = interval * bossAttackCoefficient / stats.defense
        * sizeMultiplier * (shadow ? SHADOW_INCOMING_MULTIPLIER : 1);
    const lower = Math.floor(raw);
    return Math.max(1, lower + (unitRandom(seed, index, 2) < raw - lower ? 1 : 0));
}
function firstPulse(seed, stats, bossAttackCoefficient, shadow) {
    const interval = pulseInterval(seed, 0);
    return {
        index: 0,
        time: interval * unitRandom(seed, 0, 3),
        damage: pulseDamage(seed, 0, interval, stats, bossAttackCoefficient, shadow),
    };
}
function followingPulse(pulse, seed, stats, bossAttackCoefficient, shadow) {
    const index = pulse.index + 1;
    const interval = pulseInterval(seed, index);
    return {
        index,
        time: pulse.time + interval,
        damage: pulseDamage(seed, index, interval, stats, bossAttackCoefficient, shadow),
    };
}
function canReachNextCharged(stats, startingHp, startingEnergy, fast, charged, shadow, bossAttackCoefficient, seed) {
    let hp = startingHp;
    let energy = startingEnergy;
    let time = 0;
    let pulse = firstPulse(seed, stats, bossAttackCoefficient, shadow);
    for (let actions = 0; actions < 1000 && hp > 0; actions += 1) {
        const selected = energy >= charged.energy ? charged : fast;
        if (selected === charged)
            energy -= charged.energy;
        const actionEnd = time + selected.duration;
        while (pulse.time < actionEnd - EPSILON) {
            hp -= pulse.damage;
            if (hp <= 0)
                return false;
            energy = Math.min(100, energy + Math.floor(pulse.damage / 2));
            pulse = followingPulse(pulse, seed, stats, bossAttackCoefficient, shadow);
        }
        time = actionEnd;
        if (selected === charged)
            return true;
        energy = Math.min(100, energy + fast.energy);
        // As in the raid engine, an attack landing at the same instant as a
        // lethal pulse lands first. A fast move still gains its energy first.
        while (Math.abs(pulse.time - time) <= EPSILON) {
            hp -= pulse.damage;
            if (hp <= 0)
                return false;
            energy = Math.min(100, energy + Math.floor(pulse.damage / 2));
            pulse = followingPulse(pulse, seed, stats, bossAttackCoefficient, shadow);
        }
    }
    return false;
}
function nextChargedProbability(stats, hp, energy, fast, charged, shadow, bossAttackCoefficient, decisionIndex, cache) {
    const key = `${hp}:${energy}:${decisionIndex}`;
    const cached = cache.get(key);
    if (cached !== undefined)
        return cached;
    let successes = 0;
    for (let sample = 0; sample < CONTINUATION_SAMPLES; sample += 1) {
        const seed = 1000003 + decisionIndex * 1009 + sample * 7919;
        if (canReachNextCharged(stats, hp, energy, fast, charged, shadow, bossAttackCoefficient, seed))
            successes += 1;
    }
    const probability = successes / CONTINUATION_SAMPLES;
    cache.set(key, probability);
    return probability;
}
function appearanceScenario(stats, fast, charged, shadow, bossAttackCoefficient, seed, continuationCache) {
    let hp = stats.hp;
    let energy = 0;
    let time = 0;
    let fastMoves = 0;
    let chargedMoves = 0;
    let pulse = firstPulse(seed, stats, bossAttackCoefficient, shadow);
    for (let actions = 0; actions < 10000 && hp > 0; actions += 1) {
        const selected = energy >= charged.energy ? charged : fast;
        if (selected === charged)
            energy -= charged.energy;
        const actionEnd = time + selected.duration;
        while (pulse.time < actionEnd - EPSILON) {
            hp -= pulse.damage;
            if (hp <= 0)
                return { fastMoves, chargedMoves, fieldTime: pulse.time };
            energy = Math.min(100, energy + Math.floor(pulse.damage / 2));
            pulse = followingPulse(pulse, seed, stats, bossAttackCoefficient, shadow);
        }
        time = actionEnd;
        if (selected === fast) {
            fastMoves += 1;
            energy = Math.min(100, energy + fast.energy);
        }
        else {
            chargedMoves += 1;
        }
        while (Math.abs(pulse.time - time) <= EPSILON) {
            hp -= pulse.damage;
            if (hp <= 0)
                return { fastMoves, chargedMoves, fieldTime: time };
            energy = Math.min(100, energy + Math.floor(pulse.damage / 2));
            pulse = followingPulse(pulse, seed, stats, bossAttackCoefficient, shadow);
        }
        if (selected === charged) {
            const probability = nextChargedProbability(stats, hp, energy, fast, charged, shadow, bossAttackCoefficient, chargedMoves, continuationCache);
            if (probability + EPSILON < MINIMUM_CHARGED_PROBABILITY) {
                return { fastMoves, chargedMoves, fieldTime: time };
            }
        }
    }
    return { fastMoves, chargedMoves, fieldTime: time };
}
function expectedAppearance(stats, fast, charged, shadow, bossAttackCoefficient) {
    const continuationCache = new Map();
    let fastMoves = 0;
    let chargedMoves = 0;
    let fieldTime = 0;
    let firstChargedSuccesses = 0;
    for (let scenario = 0; scenario < PULSE_SCHEDULE_COUNT; scenario += 1) {
        const appearance = appearanceScenario(stats, fast, charged, shadow, bossAttackCoefficient, 4099 + scenario * 65537, continuationCache);
        fastMoves += appearance.fastMoves;
        chargedMoves += appearance.chargedMoves;
        fieldTime += appearance.fieldTime;
        if (appearance.chargedMoves > 0)
            firstChargedSuccesses += 1;
    }
    return {
        fastMoves: fastMoves / PULSE_SCHEDULE_COUNT,
        chargedMoves: chargedMoves / PULSE_SCHEDULE_COUNT,
        fieldTime: fieldTime / PULSE_SCHEDULE_COUNT,
        firstChargedProbability: firstChargedSuccesses / PULSE_SCHEDULE_COUNT,
    };
}
function mean(values) {
    return values.reduce((total, value) => total + value, 0) / values.length;
}
function effectiveDps(damage, appearance) {
    const totalDamage = TEAM_SIZE * damage;
    const activeTime = TEAM_SIZE * appearance.fieldTime;
    const transitionTime = (TEAM_SIZE - 1) * SWITCH_SECONDS + RELOBBY_SECONDS;
    return totalDamage / (activeTime + transitionTime);
}
function isBetter(left, right) {
    return left.idealDps > right.idealDps + EPSILON
        || (Math.abs(left.idealDps - right.idealDps) <= EPSILON
            && (left.effectiveDps > right.effectiveDps + EPSILON
                || (Math.abs(left.effectiveDps - right.effectiveDps) <= EPSILON
                    && left.simpleDps > right.simpleDps)));
}
export function calculateRankings(catalog, settings, shadowFormIds = new Set(), legendaryDexNumbers = new Set()) {
    const attackType = normalizeType(settings.attackType);
    if (!RANKING_TYPES.includes(attackType))
        throw new Error(`Unknown ranking type: ${settings.attackType}`);
    if (settings.level !== undefined && settings.level !== LEVEL)
        throw new Error('The first rankings version supports Level 40 only.');
    const bossAttack = settings.bossAttack ?? 'medium';
    if (!BOSS_ATTACK_LEVELS.includes(bossAttack))
        throw new Error(`Unknown boss Attack setting: ${bossAttack}`);
    const bossMoveType = settings.bossMoveType ?? 'typeless';
    if (!BOSS_MOVE_TYPES.includes(bossMoveType))
        throw new Error(`Unknown boss move type: ${settings.bossMoveType}`);
    const megaLevel = settings.megaLevel ?? 1;
    if (!MEGA_LEVELS.includes(megaLevel))
        throw new Error(`Unknown Mega Level: ${settings.megaLevel}`);
    const bossAttackCoefficient = BOSS_ATTACK_COEFFICIENTS[bossAttack];
    const includeMegas = settings.includeMegas !== false;
    const includeShadows = Boolean(settings.includeShadows);
    const includeLegendaries = settings.includeLegendaries !== false;
    const bestByForm = new Map();
    let candidateMovesets = 0;
    let excludedLowQuality = 0;
    for (const entry of catalog) {
        if (!entry?.stats || !Array.isArray(entry.fast_moves) || !Array.isArray(entry.charged_moves))
            continue;
        if (INTERNAL_SHADOW_FORM_IDS.has(entry.form_id))
            continue;
        const mega = isMegaOrPrimal(entry);
        const legendary = legendaryDexNumbers.has(entry.dex_number);
        if (!includeMegas && mega)
            continue;
        if (!includeLegendaries && legendary)
            continue;
        const chargedMoves = playerChargedMoves(entry)
            .filter(move => normalizeType(move.type) === attackType && move.energy < 0);
        if (chargedMoves.length === 0)
            continue;
        const shadowStates = includeShadows && shadowFormIds.has(entry.form_id)
            ? [false, true] : [false];
        const stats = effectiveStats(entry, megaLevel);
        const typedBossAttackCoefficient = bossAttackCoefficient
            * bossMoveEffectiveness(bossMoveType, entry.types);
        for (const shadow of shadowStates) {
            for (const fastMove of playerFastMoves(entry).filter(move => move.energy > 0)) {
                for (const chargedMove of chargedMoves) {
                    candidateMovesets += 1;
                    const timingFast = preparedMove(entry, fastMove, attackType, shadow, TARGET_DEFENSES[0], stats.attack, megaLevel);
                    const timingCharged = preparedMove(entry, chargedMove, attackType, shadow, TARGET_DEFENSES[0], stats.attack, megaLevel);
                    const appearance = expectedAppearance(stats, timingFast, timingCharged, shadow, typedBossAttackCoefficient);
                    if (appearance.firstChargedProbability + EPSILON < MINIMUM_CHARGED_PROBABILITY) {
                        excludedLowQuality += 1;
                        continue;
                    }
                    const damageModels = TARGET_DEFENSES.map(targetDefense => ({
                        fast: preparedMove(entry, fastMove, attackType, shadow, targetDefense, stats.attack, megaLevel),
                        charged: preparedMove(entry, chargedMove, attackType, shadow, targetDefense, stats.attack, megaLevel),
                    }));
                    const appearanceDamage = mean(damageModels.map(({ fast, charged }) => appearance.fastMoves * fast.damage
                        + appearance.chargedMoves * charged.damage));
                    const row = {
                        formId: entry.form_id,
                        dexNumber: entry.dex_number,
                        name: entry.name,
                        pokemonTypes: entry.types,
                        fastMove: fastMove.name,
                        fastMoveType: fastMove.id === 'HIDDEN_POWER_FAST'
                            && attackType !== 'normal' && attackType !== 'fairy'
                            ? attackType : normalizeType(fastMove.type),
                        chargedMove: displayedMoveName(chargedMove, megaLevel),
                        chargedMoveType: normalizeType(chargedMove.type),
                        chargedEnergy: Math.abs(chargedMove.energy),
                        eliteFast: Boolean(fastMove.elite),
                        eliteCharged: Boolean(chargedMove.elite),
                        mega,
                        shadow,
                        legendary,
                        idealDps: appearanceDamage / appearance.fieldTime,
                        simpleDps: mean(damageModels.map(({ fast, charged }) => simpleCycleDps(fast, charged))),
                        effectiveDps: effectiveDps(appearanceDamage, appearance),
                    };
                    const key = `${entry.form_id}:${shadow ? 'shadow' : 'normal'}`;
                    const previous = bestByForm.get(key);
                    if (!previous || isBetter(row, previous))
                        bestByForm.set(key, row);
                }
            }
        }
    }
    const rows = [...bestByForm.values()].sort((a, b) => b.idealDps - a.idealDps
        || b.effectiveDps - a.effectiveDps
        || b.simpleDps - a.simpleDps
        || a.dexNumber - b.dexNumber
        || a.name.localeCompare(b.name));
    return {
        attackType,
        level: LEVEL,
        includeMegas,
        includeShadows,
        includeLegendaries,
        bossAttack,
        bossMoveType,
        megaLevel,
        candidateMovesets,
        excludedLowQuality,
        megaRows: rows.filter(row => row.mega).length,
        shadowRows: rows.filter(row => row.shadow).length,
        legendaryRows: rows.filter(row => row.legendary).length,
        rows,
        assumptions: {
            attackIV: ATTACK_IV,
            defenseIV: DEFENSE_IV,
            staminaIV: STAMINA_IV,
            pulseSecondsMin: PULSE_SECONDS_MIN,
            pulseSecondsMax: PULSE_SECONDS_MAX,
            pulseScheduleCount: PULSE_SCHEDULE_COUNT,
            continuationSamples: CONTINUATION_SAMPLES,
            minimumChargedProbability: MINIMUM_CHARGED_PROBABILITY,
            switchSeconds: SWITCH_SECONDS,
            relobbySeconds: RELOBBY_SECONDS,
            targetDefenses: [...TARGET_DEFENSES],
            bossAttackCoefficient,
            shadowOutgoingMultiplier: SHADOW_OUTGOING_MULTIPLIER,
            shadowIncomingMultiplier: SHADOW_INCOMING_MULTIPLIER,
            megaPlusPowerMultiplier: [1, 1.1, 1.2, 1.3][megaLevel - 1],
            superMaxLevelBoost: megaLevel === 4 ? 2 : 0,
        },
    };
}
//# sourceMappingURL=rankings.js.map