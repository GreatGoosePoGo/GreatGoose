/** Browser worker for deterministic, client-side attacker rankings. */
import { calculateRankings } from './rankings.js';
let dataPromise;
function rankingData() {
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
        const availability = await shadowResponse.json();
        const categories = await categoryResponse.json();
        if (!Array.isArray(catalog)
            || !Array.isArray(availability.form_ids)
            || !Array.isArray(categories.legendary_dex_numbers)) {
            throw new Error('Invalid Pokémon ranking data.');
        }
        return {
            catalog,
            shadowFormIds: new Set(availability.form_ids),
            legendaryDexNumbers: new Set(categories.legendary_dex_numbers),
        };
    })
        .catch(error => {
        dataPromise = undefined;
        throw error;
    });
}
self.onmessage = async (event) => {
    const { id, attackType, includeMegas, includeShadows, includeLegendaries, bossAttack, bossMoveType, megaLevel, mode, } = event.data ?? {};
    try {
        const { catalog, shadowFormIds, legendaryDexNumbers } = await rankingData();
        const result = calculateRankings(catalog, {
            attackType,
            mode,
            level: 40,
            includeMegas: includeMegas !== false,
            includeShadows: Boolean(includeShadows),
            includeLegendaries: includeLegendaries !== false,
            bossAttack,
            bossMoveType,
            megaLevel,
        }, shadowFormIds, legendaryDexNumbers);
        self.postMessage({ id, result });
    }
    catch (error) {
        self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    }
};
//# sourceMappingURL=rankings_worker.js.map