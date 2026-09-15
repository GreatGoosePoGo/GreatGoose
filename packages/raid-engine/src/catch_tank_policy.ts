/** Catch-tank state that must reset when a player relobbies and rejoins. */
const patchedPrototypes = new WeakSet<object>();

/**
 * `used_catch_tanks` means "used during this current outing", not "used for the
 * entire raid". Rejoining revives the entered party, so the same configured
 * catch-tank slots must become eligible again. The cumulative
 * `catch_tanks_used` statistic intentionally is not reset.
 */
export function applyCatchTankRejoinPolicy(engine: any): void {
    const prototype = engine.Simulation.prototype;
    if (patchedPrototypes.has(prototype))
        return;
    patchedPrototypes.add(prototype);

    const originalRejoin = prototype.rejoin;
    prototype.rejoin = function (time: number, playerId: number): void {
        originalRejoin.call(this, time, playerId);

        const player = this.players[playerId];
        player.used_catch_tanks.clear();
        player.catch_tank_active = false;
        player.catch_return_index = null;
    };
}
