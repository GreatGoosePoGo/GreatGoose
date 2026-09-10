/** Browser worker for simulation-backed counters against one raid boss. */
import {calculateRaidCounters, raidBossCatalog} from './raid_counters.js';
import type {CalculatorEntry} from './types.js';

interface ShadowAvailability {
    form_ids: string[];
}

interface RankingCategories {
    legendary_dex_numbers: number[];
}

interface CounterData {
    catalog: CalculatorEntry[];
    shadowFormIds: Set<string>;
    legendaryDexNumbers: Set<number>;
}

let dataPromise: Promise<CounterData> | undefined;

function counterData(): Promise<CounterData> {
    return dataPromise ??= Promise.all([
        fetch(new URL('./calculator_data.json', import.meta.url)),
        fetch(new URL('./shadow_availability.json', import.meta.url)),
        fetch(new URL('./ranking_categories.json', import.meta.url)),
    ])
        .then(async ([catalogResponse, shadowResponse, categoryResponse]) => {
            if (!catalogResponse.ok || !shadowResponse.ok || !categoryResponse.ok) {
                throw new Error('Could not load Pokémon counter data.');
            }
            const catalog = await catalogResponse.json();
            const availability = await shadowResponse.json() as ShadowAvailability;
            const categories = await categoryResponse.json() as RankingCategories;
            if (!Array.isArray(catalog)
                || !Array.isArray(availability.form_ids)
                || !Array.isArray(categories.legendary_dex_numbers)) {
                throw new Error('Invalid Pokémon counter data.');
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

self.onmessage = async (event: MessageEvent) => {
    const {
        id, mode, bossFormId, raidDifficulty, includeMegas, includeShadows,
        includeLegendaries, megaLevel, level, friendshipMultiplier, weather,
        dodgeStrategy, playerStrategy, excludeLegacy,
        trialsPerBossMoveset, prefilterLimit,
    } = event.data ?? {};
    try {
        const {catalog, shadowFormIds, legendaryDexNumbers} = await counterData();
        if (mode === 'catalog') {
            self.postMessage({id, result: {bosses: raidBossCatalog(catalog)}});
            return;
        }
        if (mode !== 'counters') throw new Error('Unknown raid-counter worker request.');
        const result = calculateRaidCounters(
            catalog,
            {
                bossFormId,
                raidDifficulty,
                includeMegas: includeMegas !== false,
                includeShadows: Boolean(includeShadows),
                includeLegendaries: includeLegendaries !== false,
                megaLevel,
                level,
                friendshipMultiplier,
                weather: weather || null,
                dodgeStrategy,
                playerStrategy,
                excludeLegacy: Boolean(excludeLegacy),
                trialsPerBossMoveset,
                prefilterLimit,
            },
            shadowFormIds,
            legendaryDexNumbers,
            (completed, total) => self.postMessage({id, progress: {completed, total}}),
        );
        self.postMessage({id, result});
    } catch (error) {
        self.postMessage({id, error: error instanceof Error ? error.message : String(error)});
    }
};
