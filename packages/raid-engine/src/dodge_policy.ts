/** Experimental dodge policies kept outside the ported core while we test them. */
import { createRaidEngine } from './super_mega_raid_simulator.js';
import type { CalculatorEntry, DodgeStrategy, RaidConfig } from './types.js';

const CUSTOM_DODGE_STRATEGIES = new Set<DodgeStrategy>([
    'damage_50',
    'damage_30',
    'smart',
]);

function mean(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function fastMovesNeeded(energy: number, cost: number, fastEnergy: number): number {
    if (energy >= cost)
        return 0;
    if (!(fastEnergy > 0))
        return Number.POSITIVE_INFINITY;
    return Math.ceil((cost - energy) / fastEnergy);
}

/**
 * Smart Dodge assumes every slot in this player's entered party is another copy
 * of the active Pokémon. Therefore preserving HP is valuable only because it
 * reduces transition/relobby downtime; it does not pretend a weak teammate is
 * worth preserving over a stronger one.
 *
 * Time-value comparison:
 *   HP value = saved HP fraction × average transition downtime per party member
 *   Tank value = 1 second dodge time + net fast-move time saved by extra energy
 *
 * The energy term is discrete: only energy that actually removes a required fast
 * move before the next charged move gets credit. A removed fast move is worth its
 * duration minus the time-equivalent value of the damage that fast move dealt.
 */
export function smartDodgeIsWorthwhile(simulation: any, playerId: number, player: any, fullDamage: number, dodgedDamage: number, engine: any): boolean {
    if (dodgedDamage >= Number(player.hp))
        return false;

    const pokemon = player.pokemon;
    const maxHp = Math.max(1, Number(pokemon.max_hp));
    const savedHp = Math.max(0, Math.min(fullDamage, Number(player.hp)) - dodgedDamage);
    const savedHpFraction = savedHp / maxHp;

    const teamSize = Math.max(1, Number(player.team.length));
    const meanRejoin = mean((engine.REJOIN_TIMES as number[]).map(Number));
    const partyDowntime = (teamSize - 1) * Number(engine.SWITCH_SECONDS) + meanRejoin;
    const hpTimeValue = savedHpFraction * (partyDowntime / teamSize);

    // If tanking would faint this Pokémon, the energy from that hit cannot be
    // converted into a future charged move, so it has no offensive value.
    let energyTimeValue = 0;
    if (fullDamage < Number(player.hp)) {
        const fast = pokemon.fast_move;
        const charged = pokemon.charged_move;
        const fastEnergy = Number(fast.energy);
        const chargedCost = Number(charged.energy);

        if (fastEnergy > 0 && chargedCost > 0) {
            const tankEnergy = Math.min(100, Number(player.energy) + Math.floor(fullDamage / 2));
            const dodgeEnergy = Math.min(100, Number(player.energy) + Math.floor(dodgedDamage / 2));
            const tankFasts = fastMovesNeeded(tankEnergy, chargedCost, fastEnergy);
            const dodgeFasts = fastMovesNeeded(dodgeEnergy, chargedCost, fastEnergy);
            const fastsSavedByTanking = Math.max(0, dodgeFasts - tankFasts);

            if (Number.isFinite(fastsSavedByTanking) && fastsSavedByTanking > 0) {
                const fastDamage = Number(simulation.outgoing_damage(fast, playerId, false));
                const chargedDamage = Number(simulation.outgoing_damage(
                    charged,
                    playerId,
                    Boolean(player.party_power_active),
                ));
                const fastsPerCycle = Math.max(1, Math.ceil(chargedCost / fastEnergy));
                const cycleDamage = fastsPerCycle * fastDamage + chargedDamage;
                const cycleTime = fastsPerCycle * Number(fast.duration) + Number(charged.duration);
                const cycleDps = cycleTime > 0 ? cycleDamage / cycleTime : 0;
                const netFastTimeValue = cycleDps > 0
                    ? Math.max(0, Number(fast.duration) - fastDamage / cycleDps)
                    : Number(fast.duration);
                energyTimeValue = fastsSavedByTanking * netFastTimeValue;
            }
        }
    }

    return hpTimeValue > Number(engine.DODGE_SECONDS) + energyTimeValue;
}

export function createRaidEngineWithDodgePolicy(input: RaidConfig, catalog: CalculatorEntry[]) {
    const requested = input.dodge_strategy ?? 'none';
    const custom = CUSTOM_DODGE_STRATEGIES.has(requested);
    const engine = createRaidEngine(
        custom ? { ...input, dodge_strategy: 'none' } : input,
        catalog,
    );

    if (!custom)
        return engine;

    const prototype = engine.Simulation.prototype;
    prototype.should_dodge_charged = function (playerId: number, player: any): boolean {
        const fullDamage = Number(this.incoming_damage(this.boss_charged, playerId, player, false));
        const dodgedDamage = Number(this.incoming_damage(this.boss_charged, playerId, player, true));

        // A dodge that still faints cannot help any of these three policies.
        if (dodgedDamage >= Number(player.hp))
            return false;

        if (requested === 'damage_50')
            return fullDamage > Number(player.pokemon.max_hp) * 0.5;
        if (requested === 'damage_30')
            return fullDamage > Number(player.pokemon.max_hp) * 0.3;
        return smartDodgeIsWorthwhile(this, playerId, player, fullDamage, dodgedDamage, engine);
    };

    // The ported core does not know these experimental strategy names yet. Keep
    // its validation and replay renderer by internally using "none", then restore
    // the requested name in generated replay text.
    const originalRender = engine.render_battle_replay;
    engine.render_battle_replay = function (...args: Parameters<typeof originalRender>): string {
        return originalRender(...args).replace(/^Dodge: none$/m, `Dodge: ${requested}`);
    };

    return engine;
}
