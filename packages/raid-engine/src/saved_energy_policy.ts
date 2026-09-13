/** Experimental hot-swap policies kept isolated from the core engine while we test them. */
const patchedPrototypes = new WeakSet<object>();

type PendingThreat = {
    hitTime: number;
    announcedDamage: number;
    bossMove: any;
};

const pendingThreats = new WeakMap<object, Map<number, PendingThreat>>();
const announcedThreats = new WeakMap<object, Map<number, PendingThreat>>();

function threatMap(store: WeakMap<object, Map<number, PendingThreat>>, simulation: object): Map<number, PendingThreat> {
    let map = store.get(simulation);
    if (!map) {
        map = new Map<number, PendingThreat>();
        store.set(simulation, map);
    }
    return map;
}

export function savedEnergyTimeValue(pokemon: any): number {
    const fastEnergy = Number(pokemon.fast_move.energy);
    const chargedEnergy = Number(pokemon.charged_move.energy);
    if (!(fastEnergy > 0) || !(chargedEnergy > 0))
        return 0;
    const fastsFromZero = Math.max(0, Math.ceil(chargedEnergy / fastEnergy));
    const fastsFromSaved = Math.max(0, Math.ceil((chargedEnergy - Number(pokemon.energy)) / fastEnergy));
    return Math.max(0, fastsFromZero - fastsFromSaved) * Number(pokemon.fast_move.duration);
}

function canLandNextChargedBeforeHit(simulation: any, player: any, hitTime: number): boolean {
    const pokemon = player.pokemon;
    const fastEnergy = Number(pokemon.fast_move.energy);
    const chargedEnergy = Number(pokemon.charged_move.energy);
    const fastDuration = Number(pokemon.fast_move.duration);
    const chargedDuration = Number(pokemon.charged_move.duration);
    const now = Number(simulation.current_time);
    let readyTime = Math.max(now, Number(player.next_action_time) || now);
    let energy = Number(player.energy);

    if (Number(player.action_end) > now + 1e-9) {
        if (player.action_is_charged)
            return Number(player.action_end) <= hitTime + 1e-9;
        if (Number(player.action_end) > hitTime + 1e-9)
            return false;
        readyTime = Number(player.action_end);
        energy = Math.min(100, energy + fastEnergy);
    }

    if (energy >= chargedEnergy)
        return readyTime + chargedDuration <= hitTime + 1e-9;
    if (!(fastEnergy > 0))
        return false;
    const fastsNeeded = Math.max(0, Math.ceil((chargedEnergy - energy) / fastEnergy));
    return readyTime + fastsNeeded * fastDuration + chargedDuration <= hitTime + 1e-9;
}

/**
 * First-pass hot-swap improvements:
 * 1. Banked energy is worth recovering only when the fast-move time it saves
 *    is greater than the 1-second switch cost.
 * 2. A boss charged-move announcement records an exact hit deadline/damage
 *    instead of forcing an immediate swap. The attacker keeps acting while a
 *    useful move still fits and swaps at the last useful action boundary.
 * 3. If the attacker can actually reach and land its charged move before the
 *    announced hit, it stays in and spends the meter rather than saving it.
 */
export function applySavedEnergyReturnValuePolicy(engine: any): void {
    const prototype = engine.Simulation.prototype;
    if (patchedPrototypes.has(prototype))
        return;
    patchedPrototypes.add(prototype);

    const originalBestSavedEnergyIndex = prototype.best_saved_energy_index;
    const originalAnnouncedChargePreventsNextCharge = prototype.announced_charge_prevents_next_charge;
    const originalSaveEnergyForAnnouncedCharge = prototype.save_energy_for_announced_charge;
    const originalStartPlayerAction = prototype.start_player_action;

    prototype.saved_energy_time_value = function (pokemon: any): number {
        return savedEnergyTimeValue(pokemon);
    };
    prototype.saved_energy_is_worth_returning = function (pokemon: any): boolean {
        return savedEnergyTimeValue(pokemon) > Number(engine.SWITCH_SECONDS);
    };

    prototype.best_saved_energy_index = function (playerId: number, player: any, time: number): number | null {
        const ignored: number[] = [];
        try {
            while (true) {
                const index = originalBestSavedEnergyIndex.call(this, playerId, player, time);
                if (index === null)
                    return null;
                if (savedEnergyTimeValue(player.team[index]) > Number(engine.SWITCH_SECONDS))
                    return index;
                player.saved_energy_indices.delete(index);
                ignored.push(index);
            }
        }
        finally {
            for (const index of ignored)
                player.saved_energy_indices.add(index);
        }
    };

    prototype.announced_charge_prevents_next_charge = function (
        playerId: number,
        player: any,
        hitTime: number,
        damage: number,
        bossMove: any,
    ): boolean {
        const announced = threatMap(announcedThreats, this);
        announced.delete(playerId);

        if (canLandNextChargedBeforeHit(this, player, Number(hitTime)))
            return false;

        const prevents = originalAnnouncedChargePreventsNextCharge.call(
            this,
            playerId,
            player,
            hitTime,
            damage,
            bossMove,
        );
        if (prevents) {
            announced.set(playerId, {
                hitTime: Number(hitTime),
                announcedDamage: Number(damage),
                bossMove,
            });
        }
        return prevents;
    };

    prototype.save_energy_for_announced_charge = function (
        time: number,
        hitTime: number,
        playerId: number,
        bossMove: any,
    ): boolean {
        const player = this.players[playerId];
        const announced = threatMap(announcedThreats, this);
        const threat = announced.get(playerId) ?? {
            hitTime: Number(hitTime),
            announcedDamage: Number(this.incoming_damage(bossMove, playerId, player, false)),
            bossMove,
        };
        announced.delete(playerId);

        if (savedEnergyTimeValue(player.pokemon) <= Number(engine.SWITCH_SECONDS))
            return false;
        if (this.replacement_for_announced_charge(playerId, player, bossMove) === null)
            return false;

        const pending = threatMap(pendingThreats, this);
        pending.set(playerId, threat);
        player.energy_save_guard_until = Math.max(Number(player.energy_save_guard_until), threat.hitTime);

        const deadline = Math.max(Number(time), threat.hitTime - Number(engine.SWITCH_SECONDS));
        if (Number(player.next_action_time) > deadline + 1e-9 || Number(player.action_end) > deadline + 1e-9)
            this.schedule_player(playerId, deadline);

        this.log(
            time,
            `P${playerId + 1} ${player.species.name}: ${bossMove.name} hits at ${threat.hitTime.toFixed(2)}s for about ${threat.announcedDamage}; delaying energy-save decision`,
        );
        return true;
    };

    prototype.start_player_action = function (time: number, playerId: number, token: number): void {
        const player = this.players[playerId];
        if (token === player.token && player.on_field) {
            const pending = threatMap(pendingThreats, this);
            const threat = pending.get(playerId);
            if (threat) {
                if (Number(time) >= threat.hitTime - 1e-9) {
                    pending.delete(playerId);
                }
                else if (canLandNextChargedBeforeHit(this, player, threat.hitTime)) {
                    pending.delete(playerId);
                }
                else {
                    const exactDamage = Number(this.incoming_damage(threat.bossMove, playerId, player, false));
                    const stillThreatened = originalAnnouncedChargePreventsNextCharge.call(
                        this,
                        playerId,
                        player,
                        threat.hitTime,
                        exactDamage,
                        threat.bossMove,
                    );
                    if (!stillThreatened || savedEnergyTimeValue(player.pokemon) <= Number(engine.SWITCH_SECONDS)) {
                        pending.delete(playerId);
                    }
                    else {
                        const deadline = threat.hitTime - Number(engine.SWITCH_SECONDS);
                        const pokemon = player.pokemon;
                        const chargedReady = Number(player.energy) >= Number(pokemon.charged_move.energy);
                        const nextMoveDuration = chargedReady
                            ? Number(pokemon.charged_move.duration)
                            : Number(pokemon.fast_move.duration);

                        const usefulMoveFits = chargedReady
                            ? Number(time) + nextMoveDuration <= threat.hitTime + 1e-9
                            : Number(time) + nextMoveDuration <= deadline + 1e-9;

                        if (!usefulMoveFits || Number(time) >= deadline - 1e-9) {
                            pending.delete(playerId);
                            originalSaveEnergyForAnnouncedCharge.call(
                                this,
                                time,
                                threat.hitTime,
                                playerId,
                                threat.bossMove,
                            );
                            return;
                        }
                    }
                }
            }
        }
        originalStartPlayerAction.call(this, time, playerId, token);
    };
}
