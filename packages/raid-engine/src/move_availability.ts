import type {CalculatorMove} from './types.js';

export interface PlayerMoveAvailability {
    shadow?: boolean;
    excludeLegacy?: boolean;
}

/**
 * Whether a move can exist on the requested player Pokémon.
 *
 * Promo/legacy status and Shadow compatibility are deliberately independent:
 * a future one-off move may still be distributed directly on a Shadow.
 */
export function isPlayerMoveAvailable(
    move: CalculatorMove,
    {shadow = false, excludeLegacy = false}: PlayerMoveAvailability = {},
): boolean {
    if (shadow && move.shadow_compatible === false) return false;
    if (excludeLegacy && (move.elite || move.glitch_legacy)) return false;
    return true;
}
