import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocuments } from '../src/documents.mjs';
import { IDS, ACTIVITY_IDS, EFFECT_IDS } from '../src/ids.mjs';

test('Fisticuffs fallback is readable and exposes two native enchant activities with matching effects', () => {
  const feat = createDocuments().find(i => i._id === IDS.fisticuffs);
  assert.ok(feat);
  assert.match(feat.system.description.value, /<h3>.*Ataque Desarmado Bônus/);
  assert.match(feat.system.description.value, /<h3>.*Dado de Fisticuffs/);
  assert.match(feat.system.description.value, /<h3>.*Improvisação Aprimorada/);
  const expected = [
    [ACTIVITY_IDS.fistEnchant, EFFECT_IDS.fistEnchant, 'simpleM'],
    [ACTIVITY_IDS.improvEnchant, EFFECT_IDS.improvEnchant, 'improv']
  ];
  assert.equal(Object.keys(feat.system.activities).length, 2);
  assert.equal(feat.effects.length, 2);
  for (const [activityId, effectId, category] of expected) {
    const activity = feat.system.activities[activityId];
    const effect = feat.effects.find(e => e._id === effectId);
    assert.equal(activity.type, 'enchant');
    assert.equal(activity.enchant.self, false);
    assert.equal(activity.restrictions.type, 'weapon');
    assert.deepEqual(activity.restrictions.categories, [category]);
    assert.deepEqual(activity.effects, [{ _id: effectId }]);
    assert.equal(activity.visibility.identifier, 'pugilist');
    assert.equal(effect?.type, 'enchantment');
    assert.equal(effect?.system.magical, false);
    assert.ok(effect.system.changes.some(c => c.key === 'system.damage.base.custom.formula' && c.value === '@scale.pugilist.fisticuffs + @mod'));
    assert.ok(effect.system.changes.some(c => c.key === 'system.damage.base.custom.enabled' && c.value === true));
  }
});
