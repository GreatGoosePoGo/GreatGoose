import type {RejoinTimeDistribution, RejoinTimeInput} from './types.js';

export const DEFAULT_RAID_REJOIN_INPUT = '7.5:1, 8:2, 8.5:1, 11:1';
export const DEFAULT_COUNTER_REJOIN_INPUT = '7.5';

let automaticRejoinOverride: RejoinTimeDistribution | undefined;

function numeric(value: unknown, label: string): number {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${label} must be a finite number.`);
    return number;
}

function validateSeconds(value: unknown): number {
    const seconds = numeric(value, 'Rejoin time');
    if (seconds < 0) throw new Error('Rejoin time cannot be negative.');
    if (!Number.isInteger(seconds * 2)) {
        throw new Error('Rejoin times must use 0.5-second increments.');
    }
    return seconds;
}

function validateWeight(value: unknown): number {
    const weight = numeric(value, 'Rejoin weight');
    if (!(weight > 0)) throw new Error('Rejoin weights must be greater than 0.');
    return weight;
}

function entriesFromString(value: string): [unknown, unknown][] {
    const trimmed = value.trim();
    if (!trimmed) throw new Error('Enter a rejoin time or weighted distribution.');
    if (!trimmed.includes(':')) return [[trimmed, 1]];
    const body = trimmed.startsWith('{') && trimmed.endsWith('}')
        ? trimmed.slice(1, -1).trim()
        : trimmed;
    if (!body) throw new Error('Rejoin distribution cannot be empty.');
    return body.split(',').map(part => {
        const pieces = part.split(':');
        if (pieces.length !== 2 || !pieces[0].trim() || !pieces[1].trim()) {
            throw new Error('Use rejoin syntax like 7.5 or 7.5:1, 8:2, 8.5:1.');
        }
        return [pieces[0].trim(), pieces[1].trim()];
    });
}

/** Parse one fixed time or relative weights. Weights are intentionally not normalized. */
export function parseRejoinTimeInput(value: RejoinTimeInput): RejoinTimeDistribution {
    let rawEntries: [unknown, unknown][];
    if (typeof value === 'number') rawEntries = [[value, 1]];
    else if (typeof value === 'string') rawEntries = entriesFromString(value);
    else if (value && typeof value === 'object' && !Array.isArray(value)) rawEntries = Object.entries(value);
    else throw new Error('Rejoin time must be a number or weighted distribution.');

    const combined = new Map<number, number>();
    for (const [rawSeconds, rawWeight] of rawEntries) {
        const seconds = validateSeconds(rawSeconds);
        const weight = validateWeight(rawWeight);
        combined.set(seconds, (combined.get(seconds) ?? 0) + weight);
    }
    if (!combined.size) throw new Error('Rejoin distribution cannot be empty.');
    const distribution = [...combined.entries()].sort((a, b) => a[0] - b[0]);
    const totalWeight = distribution.reduce((sum, [, weight]) => sum + weight, 0);
    if (!Number.isFinite(totalWeight) || !(totalWeight > 0)) {
        throw new Error('Rejoin weights are too large.');
    }
    return distribution;
}

export function meanRejoinTime(distribution: RejoinTimeDistribution): number {
    const totalWeight = distribution.reduce((sum, [, weight]) => sum + weight, 0);
    return distribution.reduce((sum, [seconds, weight]) => sum + seconds * weight, 0) / totalWeight;
}

export function formatRejoinTime(distribution: RejoinTimeDistribution): string {
    if (distribution.length === 1) return String(distribution[0][0]);
    return distribution.map(([seconds, weight]) => `${seconds}:${weight}`).join(', ');
}

export function sampleRejoinTime(rng: {random(): number}, distribution: RejoinTimeDistribution): number {
    const totalWeight = distribution.reduce((sum, [, weight]) => sum + weight, 0);
    let target = rng.random() * totalWeight;
    for (const [seconds, weight] of distribution) {
        if (target < weight) return seconds;
        target -= weight;
    }
    return distribution[distribution.length - 1][0];
}

/**
 * A browser worker is isolated from every other page/worker. Counters use this
 * worker-local override because their engine is created deep inside the ranking
 * pipeline, while normal raid requests pass an explicit distribution in RaidConfig.
 */
export function setAutomaticRejoinTimeOverride(distribution: RejoinTimeDistribution | undefined): void {
    automaticRejoinOverride = distribution;
}

export function automaticRejoinTimeDistribution(
    configured: RejoinTimeDistribution | undefined,
): RejoinTimeDistribution | undefined {
    return configured ?? automaticRejoinOverride;
}

/**
 * The ported core still contains its historical uniform REJOIN_TIMES list.
 * Automatic simulations route through the canonical factory, so intercept the
 * single rng.choice made by Simulation.switch when it actually has to relobby.
 * Manual turn-by-turn never uses this because the player chooses when to rejoin.
 */
export function applyRejoinTimeDistributionPolicy(
    engine: any,
    distribution: RejoinTimeDistribution | undefined,
): void {
    if (!distribution?.length) return;
    const prototype = engine.Simulation.prototype;
    const originalSwitch = prototype.switch;
    if (typeof originalSwitch !== 'function') throw new Error('Raid engine has no switch method.');

    prototype.switch = function (time: number, playerId: number, tactical: boolean): void {
        const rng = this.rng;
        const originalChoice = rng.choice;
        let intercepted = false;
        rng.choice = function <T>(items: readonly T[]): T {
            if (!intercepted) {
                intercepted = true;
                return sampleRejoinTime(rng, distribution) as unknown as T;
            }
            return originalChoice.call(rng, items);
        };
        try {
            originalSwitch.call(this, time, playerId, tactical);
        }
        finally {
            rng.choice = originalChoice;
        }
    };
}
