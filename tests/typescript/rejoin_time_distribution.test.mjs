import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRejoinTimeInput,
  meanRejoinTime,
  sampleRejoinTime,
  DEFAULT_RAID_REJOIN_INPUT,
  DEFAULT_COUNTER_REJOIN_INPUT,
} from '../../build/rejoin_time.js';

test('raid default uses relative weights and has an 8.6 second mean', () => {
  const distribution = parseRejoinTimeInput(DEFAULT_RAID_REJOIN_INPUT);
  assert.deepEqual(distribution, [[7.5, 1], [8, 2], [8.5, 1], [11, 1]]);
  assert.equal(meanRejoinTime(distribution), 8.6);
});

test('counter default is a fixed 7.5 second rejoin', () => {
  assert.deepEqual(parseRejoinTimeInput(DEFAULT_COUNTER_REJOIN_INPUT), [[7.5, 1]]);
});

test('weights do not need to sum to one and braces are accepted', () => {
  assert.deepEqual(
    parseRejoinTimeInput('{7.0: 25, 7.5: 50, 8.0: 25}'),
    [[7, 25], [7.5, 50], [8, 25]],
  );
});

test('sampling uses relative cumulative weights', () => {
  const distribution = parseRejoinTimeInput('7.5:1, 8:2, 8.5:1, 11:1');
  const values = [0.00, 0.20, 0.59, 0.60, 0.79, 0.80, 0.999].map(value =>
    sampleRejoinTime({random: () => value}, distribution));
  assert.deepEqual(values, [7.5, 8, 8, 8.5, 8.5, 11, 11]);
});

test('invalid time granularity and nonpositive weights are rejected', () => {
  assert.throws(() => parseRejoinTimeInput('7.25:1'), /0.5-second/);
  assert.throws(() => parseRejoinTimeInput('7.5:0'), /greater than 0/);
});
