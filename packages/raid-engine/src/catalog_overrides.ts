import {RELEASED_MEGA_PLUS_FORM_IDS} from './rankings.js';
import type {CalculatorEntry, CalculatorMove, RaidConfig} from './types.js';

/**
 * Current announced data that is newer than the pinned calculator export.
 * Keep these overrides small and remove them once calculator_data.json catches up.
 */
const STARAPTOR_MEGA_FORM_ID = 'STARAPTOR_MEGA';
(RELEASED_MEGA_PLUS_FORM_IDS as Set<string>).add(STARAPTOR_MEGA_FORM_ID);

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

/** Add or refresh small post-snapshot forms without mutating the supplied catalog. */
export function withCurrentCatalogOverrides(catalog: CalculatorEntry[]): CalculatorEntry[] {
    const base = catalog.find(entry => entry.form_id === STARAPTOR_BASE_FORM_ID);
    if (!base) return catalog;
    const existing = catalog.find(entry => entry.form_id === STARAPTOR_MEGA_FORM_ID);
    const mega = currentMegaStaraptor(base, existing);
    if (!existing) return [...catalog, mega];
    return catalog.map(entry => entry === existing ? mega : entry);
}

/** Install supplemental + moves into the ported engine's player-move registry. */
export function applyCurrentEngineMoveOverrides(engine: any, input: RaidConfig): void {
    engine.MOVES[BRAVE_BIRD_PLUS.name] = new engine.Move(
        BRAVE_BIRD_PLUS.name,
        BRAVE_BIRD_PLUS.power,
        BRAVE_BIRD_PLUS.duration_ms / 1000,
        Math.abs(BRAVE_BIRD_PLUS.energy),
        'Flying',
        false,
        [...BRAVE_BIRD_PLUS_POWERS],
    );

    // The older core's private +move map predates Mega Staraptor. API requests
    // are already species/move validated; this extra boundary keeps edited
    // replay/manual configs from assigning Brave Bird+ to another species.
    const originalValidate = engine.validate_settings;
    engine.validate_settings = (...args: any[]) => {
        originalValidate(...args);
        for (const team of input.player_teams ?? []) {
            for (const setup of team) {
                if (setup[2] !== BRAVE_BIRD_PLUS.name) continue;
                const species = engine.SPECIES[setup[0]];
                if (species?.form_id !== STARAPTOR_MEGA_FORM_ID) {
                    throw new Error('Brave Bird+ can only be used by Mega Staraptor.');
                }
            }
        }
    };
}
