export const PARTY_POWER_PLAYERS = [1, 2, 3, 4] as const;
export type PartyPowerPlayers = typeof PARTY_POWER_PLAYERS[number];

/** Normal (non-event-boosted) Party Power fast-move thresholds. */
export const PARTY_POWER_THRESHOLDS: Readonly<Record<PartyPowerPlayers, number>> = {
    1: 0,
    2: 18,
    3: 8,
    4: 6,
};

export function partyPowerThreshold(players: PartyPowerPlayers): number {
    return PARTY_POWER_THRESHOLDS[players];
}
