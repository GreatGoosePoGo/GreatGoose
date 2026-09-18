/** Opt-in practice models supplied by the user, not global raid rules. */
export interface PracticeGlitches {
    phantom_relobby: boolean;
    phantom_chance: number;
    rejoin_snipe: boolean;
    energy_resolve: boolean;
    switch_charge_freeze: boolean;
    remote_lag: boolean;
}
export function practiceGlitches(value: unknown = {}): PracticeGlitches {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Current glitches must be an object.');
    const input = value as Record<string, unknown>;
    const result: PracticeGlitches = {phantom_relobby:false, phantom_chance:0.25,
        rejoin_snipe:false, energy_resolve:false, switch_charge_freeze:false, remote_lag:false};
    for (const key of ['phantom_relobby','rejoin_snipe','energy_resolve','switch_charge_freeze','remote_lag'] as const) {
        if (input[key] !== undefined && typeof input[key] !== 'boolean')
            throw new Error(`Current glitches: ${key} must be on or off.`);
        result[key] = input[key] as boolean ?? false;
    }
    if (input.phantom_chance !== undefined) {
        if (typeof input.phantom_chance !== 'number' || !Number.isFinite(input.phantom_chance)
            || input.phantom_chance < 0 || input.phantom_chance > 1)
            throw new Error('Phantom relobby chance must be between 0 and 1.');
        result.phantom_chance = input.phantom_chance;
    }
    return result;
}
