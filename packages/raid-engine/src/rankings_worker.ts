/** Browser worker for deterministic, client-side attacker rankings. */
import {calculateRankings, calculatePokemonMovesets} from './rankings.js';
import {withCurrentCatalogOverrides} from './catalog_overrides.js';
import type {CalculatorEntry} from './types.js';

interface ShadowAvailability {
    form_ids: string[];
}

interface RankingCategories {
    legendary_dex_numbers: number[];
}

interface RankingData {
    catalog: CalculatorEntry[];
    shadowFormIds: Set<string>;
    legendaryDexNumbers: Set<number>;
}

let dataPromise: Promise<RankingData> | undefined;

function rankingData(): Promise<RankingData> {
    return dataPromise ??= Promise.all([
        fetch(new URL('./calculator_data.json', import.meta.url)),
        fetch(new URL('./shadow_availability.json', import.meta.url)),
        fetch(new URL('./ranking_categories.json', import.meta.url)),
    ])
        .then(async ([catalogResponse, shadowResponse, categoryResponse]) => {
            if (!catalogResponse.ok || !shadowResponse.ok || !categoryResponse.ok) {
                throw new Error('Could not load Pokémon ranking data.');
            }
            const catalog = await catalogResponse.json();
            const availability = await shadowResponse.json() as ShadowAvailability;
            const categories = await categoryResponse.json() as RankingCategories;
            if (!Array.isArray(catalog)
                || !Array.isArray(availability.form_ids)
                || !Array.isArray(categories.legendary_dex_numbers)) {
                throw new Error('Invalid Pokémon ranking data.');
            }
            return {
                catalog: withCurrentCatalogOverrides(catalog),
                shadowFormIds: new Set(availability.form_ids),
                legendaryDexNumbers: new Set(categories.legendary_dex_numbers),
            };
        })
        .catch(error => {
            dataPromise = undefined;
            throw error;
        });
}

self.onmessage = async (event: MessageEvent) => {
    const {
        id, attackType, secondaryType, includeMegas, includeShadows, includeLegendaries,
        bossAttack, bossMoveType, megaLevel, mode, level, partyPowerPlayers,
        partySize, relobbySeconds, excludeLegacy, splitLegacy, kind, formId, shadow,
    } = event.data ?? {};
    try {
        const {catalog, shadowFormIds, legendaryDexNumbers} = await rankingData();
        const settings = {
            attackType, secondaryType, mode, level, partyPowerPlayers, partySize, relobbySeconds,
            includeMegas: includeMegas !== false,
            includeShadows: Boolean(includeShadows),
            includeLegendaries: includeLegendaries !== false,
            excludeLegacy: Boolean(excludeLegacy),
            splitLegacy: Boolean(splitLegacy),
            bossAttack, bossMoveType, megaLevel,
        };
        const result = kind === 'movesets' ? calculatePokemonMovesets(
            catalog, settings, {formId, shadow: Boolean(shadow)}, shadowFormIds, legendaryDexNumbers,
        ) : calculateRankings(
            catalog,
            settings,
            shadowFormIds,
            legendaryDexNumbers,
        );
        self.postMessage({id, result});
    } catch (error) {
        self.postMessage({id, error: error instanceof Error ? error.message : String(error)});
    }
};
