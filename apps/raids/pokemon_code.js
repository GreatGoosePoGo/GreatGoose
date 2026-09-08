(function (root) {
  "use strict";

  const PREFIX = "GGP2";
  const LEGACY_PREFIX = "GGP1";
  const FIELD_SEPARATOR = "|";

  function requireInteger(value, label, minimum, maximum) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < minimum || number > maximum) {
      throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
    }
    return number;
  }

  function encodeField(value) {
    return encodeURIComponent(String(value));
  }

  function decodeField(value, label) {
    try {
      return decodeURIComponent(value);
    } catch {
      throw new Error(`${label} is not encoded correctly.`);
    }
  }

  function encode(config) {
    const levelTwice = requireInteger(Number(config.level) * 2, "Level", 2, 110);
    const attackIv = requireInteger(config.attackIv, "Attack IV", 0, 15);
    const defenseIv = requireInteger(config.defenseIv, "Defense IV", 0, 15);
    const staminaIv = requireInteger(config.staminaIv, "HP IV", 0, 15);
    const megaLevel = requireInteger(config.megaLevel ?? 1, "Mega Level", 1, 4);
    const ivBits = (attackIv << 8) | (defenseIv << 4) | staminaIv;
    const flags = (config.catchTank ? 1 : 0)
      | (config.shadow ? 2 : 0)
      | ((megaLevel - 1) << 2);

    if (!config.formId || !config.fastMoveId || !config.chargedMoveId) {
      throw new Error("Choose a Pokémon and both of its moves before exporting.");
    }

    return [
      PREFIX,
      encodeField(config.formId),
      levelTwice,
      ivBits.toString(16).padStart(3, "0"),
      encodeField(config.fastMoveId),
      encodeField(config.chargedMoveId),
      flags.toString(16),
    ].join(FIELD_SEPARATOR);
  }

  function decode(code) {
    const fields = String(code || "").trim().split(FIELD_SEPARATOR);
    if (
      fields.length !== 7
      || ![LEGACY_PREFIX, PREFIX].includes(fields[0])
    ) {
      throw new Error("This is not a supported Great Goose Pokémon code.");
    }

    const levelTwice = requireInteger(fields[2], "Encoded level", 2, 110);
    if (!/^[0-9a-f]{3}$/i.test(fields[3])) {
      throw new Error("The encoded IVs are invalid.");
    }
    if (!/^[0-9a-f]+$/i.test(fields[6])) {
      throw new Error("The encoded flags are invalid.");
    }

    const ivBits = Number.parseInt(fields[3], 16);
    const flags = Number.parseInt(fields[6], 16);
    const allowedFlags = fields[0] === LEGACY_PREFIX ? 3 : 15;
    if (flags & ~allowedFlags) {
      throw new Error("This code uses options that this version does not support.");
    }

    return {
      formId: decodeField(fields[1], "Pokémon form"),
      level: levelTwice / 2,
      attackIv: (ivBits >> 8) & 15,
      defenseIv: (ivBits >> 4) & 15,
      staminaIv: ivBits & 15,
      fastMoveId: decodeField(fields[4], "Fast move"),
      chargedMoveId: decodeField(fields[5], "Charged move"),
      catchTank: Boolean(flags & 1),
      shadow: Boolean(flags & 2),
      megaLevel: fields[0] === LEGACY_PREFIX
        ? 1
        : ((flags >> 2) & 3) + 1,
    };
  }

  const api = { PREFIX, encode, decode };
  root.PokemonCode = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
