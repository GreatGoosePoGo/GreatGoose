/** Catch-tank state that must reset when a player relobbies and rejoins. */
const patchedPrototypes = new WeakSet<object>();
const timingPatchedPrototypes = new WeakSet<object>();

type PendingCatch = {time: number; generation: number; tankIndex: number};

/** Catch-tank swaps may not cancel moves or switch/dodge recovery. */
export function applyCatchTankTimingPolicy(engine: any): void {
    const prototype = engine.Simulation.prototype;
    if (timingPatchedPrototypes.has(prototype)) return;
    timingPatchedPrototypes.add(prototype);

    const pendingBySimulation = new WeakMap<object, Map<number, PendingCatch>>();
    const pendingFor = (simulation: object): Map<number, PendingCatch> => {
        let pending = pendingBySimulation.get(simulation);
        if (!pending) {
            pending = new Map();
            pendingBySimulation.set(simulation, pending);
        }
        return pending;
    };
    const originalSchedule = prototype.schedule_catch_tank;
    const originalStart = prototype.start_catch_tank;
    const originalAction = prototype.start_player_action;
    const originalRejoin = prototype.rejoin;

    prototype.schedule_catch_tank = function (
        time: number, hitTime: number, playerId: number, bossMove: any,
    ): boolean {
        const player = this.players[playerId];
        if (!player.on_field || player.catch_tank_active || !player.catch_tank_indices.length)
            return originalSchedule.call(this, time, hitTime, playerId, bossMove);
        const tankIndex = this.next_unused_catch_tank_index(player);
        if (tankIndex === null || player.team[tankIndex].hp <= 0) return false;

        const readyTime = Math.max(time, player.action_end, player.next_action_time);
        // The tank must finish switching in by the announced hit. When the
        // attacker is locked too long, let the normal dodge policy handle it.
        if (readyTime + engine.SWITCH_SECONDS > hitTime + 1e-9) return false;

        const tank = player.team[tankIndex];
        const damage = engine.incoming_damage_for_pokemon(
            bossMove, tank, this.enraged, false, this.player_defense_multiplier(playerId),
        );
        const energyAfterHit = Math.min(100, tank.energy + Math.floor(damage / 2));
        const missing = Math.max(0, tank.charged_move.energy - energyAfterHit);
        const fasts = missing > 0 && tank.fast_move.energy > 0
            ? Math.ceil(missing / tank.fast_move.energy) : 0;
        const preparation = engine.SWITCH_SECONDS + fasts * tank.fast_move.duration;
        const swapTime = Math.max(readyTime, hitTime - preparation);
        pendingFor(this).set(playerId, {
            time: swapTime, generation: player.generation, tankIndex,
        });
        this.log(time, `P${playerId + 1} plans ${tank.species.name} catch-tank swap at ${swapTime.toFixed(2)}s: expected +${Math.floor(damage / 2)} energy from ${bossMove.name}; waiting for move recovery`);
        this.push(swapTime, 'catch_tank_swap', [playerId, tankIndex, player.generation]);
        return true;
    };

    prototype.start_player_action = function (time: number, playerId: number, token: number): void {
        const player = this.players[playerId];
        const pending = pendingFor(this);
        const catchPlan = pending.get(playerId);
        if (catchPlan && catchPlan.generation !== player.generation) pending.delete(playerId);
        else if (catchPlan && player.on_field && token === player.token) {
            const move = player.energy >= player.pokemon.charged_move.energy
                ? player.pokemon.charged_move : player.pokemon.fast_move;
            if (time + move.duration > catchPlan.time + 1e-9) {
                // Keep completed hits intact. Wait instead of starting an
                // attack that the already-scheduled switch would cancel.
                this.schedule_player(playerId, catchPlan.time);
                return;
            }
        }
        originalAction.call(this, time, playerId, token);
    };

    prototype.start_catch_tank = function (
        time: number, playerId: number, tankIndex: number, generation?: number,
    ): void {
        const player = this.players[playerId];
        const pending = pendingFor(this);
        const catchPlan = pending.get(playerId);
        if (generation !== undefined && (
            generation !== player.generation || !catchPlan ||
            catchPlan.generation !== generation || catchPlan.tankIndex !== tankIndex ||
            Math.abs(catchPlan.time - time) > 1e-9
        )) return;
        if (!player.on_field || player.hp <= 0 || player.team[tankIndex].hp <= 0 ||
            time + 1e-9 < Math.max(player.action_end, player.next_action_time)) return;
        pending.delete(playerId);
        originalStart.call(this, time, playerId, tankIndex);
    };

    prototype.rejoin = function (time: number, playerId: number): void {
        pendingFor(this).delete(playerId);
        originalRejoin.call(this, time, playerId);
    };
}

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
