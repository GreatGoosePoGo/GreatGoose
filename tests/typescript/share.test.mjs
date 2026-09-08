import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const context = {
  TextEncoder,
  TextDecoder,
  Uint8Array,
  URL,
  URLSearchParams,
  btoa: value => Buffer.from(value, 'binary').toString('base64'),
  atob: value => Buffer.from(value, 'base64').toString('binary'),
};
context.globalThis = context;
vm.runInNewContext(
  readFileSync(new URL('../../apps/raids/share.js', import.meta.url), 'utf8'),
  context,
);
const codec = context.RaidShareCodec;

test('share codec round-trips versioned Unicode raid state', () => {
  const state = {
    v: 1,
    r: {d: 'Tier 5 Shadow', p: 'FLABEBÉ', f: 'Tackle', c: 'Psychic', m: 'selected'},
    t: [['GGP2|MEWTWO|100|fff|CONFUSION_FAST|PSYSTRIKE|0']],
    o: {n: 1, d: 'none', s: 'no_strategy', w: '', f: '1', a: 'none', g: 'use', l: 'moves', z: '42'},
  };
  const encoded = codec.encode(state);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.equal(JSON.stringify(codec.decode(encoded)), JSON.stringify(state));
});

test('share URL keeps the route, removes stale state, and can request autorun', () => {
  const state = {v: 1, r: {}, t: [[]], o: {}};
  const url = new URL(codec.createUrl(
    'https://www.greatgoose.ca/raids/?old=value#result',
    state,
    {run: true},
  ));
  assert.equal(url.origin + url.pathname, 'https://www.greatgoose.ca/raids/');
  assert.equal(url.searchParams.get('v'), '1');
  assert.equal(url.searchParams.get('run'), '1');
  assert.equal(url.searchParams.has('old'), false);
  assert.equal(url.hash, '');
  assert.equal(JSON.stringify(codec.decode(url.searchParams.get('setup'))), JSON.stringify(state));
});

test('share codec rejects malformed and oversized input', () => {
  assert.throws(() => codec.decode('%%%'), /not encoded correctly/);
  assert.throws(() => codec.decode('a'.repeat(100_001)), /too large/);
  assert.throws(() => codec.decode('AAAA'), /damaged or unsupported/);
});
