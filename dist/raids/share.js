(function (root) {
  "use strict";

  const VERSION = 1;
  const MAX_ENCODED_LENGTH = 100_000;

  function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function encode(state) {
    const json = JSON.stringify(state);
    const base64 = bytesToBase64(new TextEncoder().encode(json));
    return base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  }

  function decode(encoded) {
    if (typeof encoded !== "string" || !encoded || encoded.length > MAX_ENCODED_LENGTH) {
      throw new Error("The shared raid setup is missing or too large.");
    }
    if (!/^[A-Za-z0-9_-]+$/.test(encoded)) {
      throw new Error("The shared raid setup is not encoded correctly.");
    }
    const standard = encoded.replaceAll("-", "+").replaceAll("_", "/");
    const padded = standard + "=".repeat((4 - standard.length % 4) % 4);
    try {
      const json = new TextDecoder("utf-8", { fatal: true }).decode(base64ToBytes(padded));
      return JSON.parse(json);
    } catch {
      throw new Error("The shared raid setup is damaged or unsupported.");
    }
  }

  function createUrl(currentUrl, state, { run = false } = {}) {
    const url = new URL(currentUrl);
    url.search = "";
    url.hash = "";
    url.searchParams.set("v", String(VERSION));
    url.searchParams.set("setup", encode(state));
    if (run) url.searchParams.set("run", "1");
    return url.toString();
  }

  const api = { VERSION, encode, decode, createUrl };
  root.RaidShareCodec = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
