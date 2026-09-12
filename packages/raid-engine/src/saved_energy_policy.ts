/** Temporary, isolated strategy policy used to test whether banked energy is worth recovering. */
const patchedPrototypes = new WeakSet<object>();

function savedEnergyTimeValue(pokemon: any): number {
    const fastEnergy = Number(pokemon.fast_move.energy);
    const chargedEnergy = Number(pokemon.charged_move.energy);
    if (!(fastEnergy > 0) || !(chargedEnergy > 0))
        return 0;
    const fastsFromZero = Math.max(0, Math.ceil(chargedEnergy / fastEnergy));
    const fastsFromSaved = Math.max(0, Math.ceil((chargedEnergy - Number(pokemon.energy)) / fastEnergy));
    return Math.max(0, fastsFromZero - fastsFromSaved) * Number(pokemon.fast_move.duration);
}

/**
 * First-pass hot-swap fix: residual energy is only worth preserving/returning to
 * when the fast-move farming time it saves is greater than the 1-second switch.
 *
 * Kept outside the large simulator file for this test branch so the rule is easy
 * to evaluate and remove/refine before we redesign the wider strategy logic.
 */
export function applySavedEnergyReturnValuePolicy(engine: any): void {
    const prototype = engine.Simulation.prototype;
    if (patchedPrototypes.has(prototype))
        return;
    patchedPrototypes.add(prototype);

    const originalBestSavedEnergyIndex = prototype.best_saved_energy_index;
    const originalSaveEnergyForAnnouncedCharge = prototype.save_energy_for_announced_charge;

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

    prototype.save_energy_for_announced_charge = function (time: number, hitTime: number, playerId: number, bossMove: any): boolean {
        const player = this.players[playerId];
        if (savedEnergyTimeValue(player.pokemon) <= Number(engine.SWITCH_SECONDS))
            return false;
        return originalSaveEnergyForAnnouncedCharge.call(this, time, hitTime, playerId, bossMove);
    };
}
