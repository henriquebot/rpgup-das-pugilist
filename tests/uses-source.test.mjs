import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceUsesMax } from '../scripts/uses-source.mjs';

test('raw source wins over derived numeric system uses', () => {
  assert.equal(sourceUsesMax({ _source: {system: {uses: {max: '@scale.pugilist.moxie'}}}, system: {uses: {max: 3}} }), '@scale.pugilist.moxie');
});
test('toObject persisted source is next fallback', () => {
  assert.equal(sourceUsesMax({ toObject: () => ({system: {uses: {max: '1'}}}), system: {uses: {max: 1}} }), '1');
});
test('prepared value is last resort and missing values remain null', () => {
  assert.equal(sourceUsesMax({system:{uses:{max:3}}}),3);
  assert.equal(sourceUsesMax({}),null);
});
