import {RELEASED_MEGA_PLUS_FORM_IDS} from './rankings.js';
import type {CalculatorEntry, CalculatorMove, RaidConfig} from './types.js';

/**
 * Current announced data that is newer than the pinned calculator export.
 * Keep these overrides small and remove them once calculator_data.json catches up.
 */
const STARAPTOR_MEGA_FORM_ID = 'STARAPTOR_MEGA';
const MANECTRIC_MEGA_FORM_ID = 'MANECTRIC_MEGA';
(RELEASED_MEGA_PLUS_FORM_IDS as Set<string>).add(STARAPTOR_MEGA_FORM_ID);
(RELEASED_MEGA_PLUS_FORM_IDS as Set<string>).add(MANECTRIC_MEGA_FORM_ID);

export const BRAVE_BIRD_PLUS_POWERS: [number, number, number, number] = [150, 165, 180, 195];
export const BRAVE_BIRD_PLUS: CalculatorMove = {
    id: 'BRAVE_BIRD_PLUS',
    name: 'Brave Bird+',
    power: 150,
    energy: -100,
    duration_ms: 2000,
    type: 'flying',
    plus_powers: [...BRAVE_BIRD_PLUS_POWERS],
};

export const DISCHARGE_PLUS_POWERS: [number, number, number, number] = [150, 165, 180, 195];
export const DISCHARGE_PLUS: CalculatorMove = {
    id: 'DISCHARGE_PLUS',
    name: 'Discharge+',
    power: 150,
    energy: -100,
    duration_ms: 2500,
    type: 'electric',
    plus_powers: [...DISCHARGE_PLUS_POWERS],
};

const STARAPTOR_BASE_FORM_ID = 'STARAPTOR';

function currentMegaStaraptor(base: CalculatorEntry, existing?: CalculatorEntry): CalculatorEntry {
    const plusMoves = [
        ...(existing?.mega_charged_moves ?? []).filter(move => move.name !== BRAVE_BIRD_PLUS.name),
        {...BRAVE_BIRD_PLUS, plus_powers: [...BRAVE_BIRD_PLUS_POWERS]},
    ];
    return {
        ...(existing ?? base),
        form_id: STARAPTOR_MEGA_FORM_ID,
        name: 'Mega Staraptor',
        dex_number: 398,
        released: true,
        types: ['fighting', 'flying'],
        stats: {attack: 278, defense: 207, stamina: 198},
        fast_moves: [...(existing?.fast_moves ?? base.fast_moves)],
        charged_moves: [...(existing?.charged_moves ?? base.charged_moves)],
        exclusive_fast_moves: [...(existing?.exclusive_fast_moves ?? base.exclusive_fast_moves ?? [])],
        exclusive_charged_moves: [...(existing?.exclusive_charged_moves ?? base.exclusive_charged_moves ?? [])],
        mega_charged_moves: plusMoves,
    };
}

function currentMegaManectric(existing: CalculatorEntry): CalculatorEntry {
    return {
        ...existing,
        mega_charged_moves: [
            ...(existing.mega_charged_moves ?? []).filter(move => move.name !== DISCHARGE_PLUS.name),
            {...DISCHARGE_PLUS, plus_powers: [...DISCHARGE_PLUS_POWERS]},
        ],
    };
}

/** Add or refresh small post-snapshot forms without mutating the supplied catalog. */
export function withCurrentCatalogOverrides(catalog: CalculatorEntry[]): CalculatorEntry[] {
    const base = catalog.find(entry => entry.form_id === STARAPTOR_BASE_FORM_ID);
    const existing = catalog.find(entry => entry.form_id === STARAPTOR_MEGA_FORM_ID);
    let current = catalog;
    if (base) {
        const mega = currentMegaStaraptor(base, existing);
        current = existing
            ? current.map(entry => entry === existing ? mega : entry)
            : [...current, mega];
    }
    const manectric = current.find(entry => entry.form_id === MANECTRIC_MEGA_FORM_ID);
    return manectric
        ? current.map(entry => entry === manectric ? currentMegaManectric(manectric) : entry)
        : current;
}

/** Keep the ported engine's private move registry synchronized with the public catalog. */
export function applyCurrentEngineMoveOverrides(
    engine: any, input: RaidConfig, catalog: CalculatorEntry[],
): void {
    const plusMoveOwners = new Map<string, {formId: string; name: string}>();
    for (const entry of catalog) {
        if (!RELEASED_MEGA_PLUS_FORM_IDS.has(entry.form_id)) continue;
        for (const move of entry.mega_charged_moves ?? []) {
            if (move.plus_powers?.length !== 4)
                throw new Error(`${move.name} must define power at all four Mega Levels.`);
            const existingOwner = plusMoveOwners.get(move.name);
            if (existingOwner && existingOwner.formId !== entry.form_id)
                throw new Error(`${move.name} is assigned to multiple Mega forms.`);
            plusMoveOwners.set(move.name, {formId: entry.form_id, name: entry.name});
            engine.MOVES[move.name] = new engine.Move(
                move.name,
                move.power,
                move.duration_ms / 1000,
                Math.abs(move.energy),
                move.type[0].toUpperCase() + move.type.slice(1).toLowerCase(),
                false,
                [...move.plus_powers],
            );
        }
    }

    // The older core's private +move map predates several catalog entries.
    // This extra boundary also protects edited replay/manual configurations.
    const originalValidate = engine.validate_settings;
    engine.validate_settings = (...args: any[]) => {
        originalValidate(...args);
        for (const team of input.player_teams ?? []) {
            for (const setup of team) {
                const owner = plusMoveOwners.get(setup[2]);
                if (!owner) continue;
                const species = engine.SPECIES[setup[0]];
                if (species?.form_id !== owner.formId)
                    throw new Error(`${setup[2]} can only be used by ${owner.name}.`);
            }
        }
    };
}
