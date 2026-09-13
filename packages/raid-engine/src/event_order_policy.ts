/** Canonical same-tick ordering for raid simulation events.
 *
 * Completed move hits resolve before newly starting actions at the same timestamp.
 * The core simulator historically used heap insertion order as its tie-breaker,
 * which made generated replay text ambiguous when a hit and a new action shared
 * a 0.5-second tick. This test-branch policy makes the ordering explicit without
 * changing the large ported engine file yet.
 */
const patchedPrototypes = new WeakSet<object>();
const logicalSequences = new WeakMap<object, number>();

export function applyCanonicalEventOrderPolicy(engine: any): void {
    const prototype = engine.Simulation.prototype;
    if (patchedPrototypes.has(prototype))
        return;
    patchedPrototypes.add(prototype);

    const originalPush = prototype.push;
    prototype.push = function (time: number, kind: string, data: any[] = []): void {
        const logical = (logicalSequences.get(this) ?? 0) + 1;
        logicalSequences.set(this, logical);

        // The heap sorts by [time, sequence, ...]. Give completed hits a lower
        // sequence band while retaining insertion order within each band.
        const priorityBand = kind.endsWith('_hit') ? 0 : 1_000_000_000;
        this.sequence = priorityBand + logical - 1;
        originalPush.call(this, time, kind, data);

        // Keep the public/internal counter small and monotonic for later pushes.
        // Only the already-enqueued tuple keeps the priority-banded value.
        this.sequence = logical;
    };
}
