import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_ID } from '../src/ids.mjs';
import { activityAllowed, feature, importedBloodied, pugilistLevel } from '../scripts/policy.mjs';
import { configureBloodied, originalBloodiedAllowed, markBloodiedDamage, pendingBloodiedDamage, isBloodiedHealing } from '../scripts/bloodied.mjs';
import { createRuntime } from '../scripts/runtime.mjs';

const SET = 'dnd5e-combat';
const key = (obj, path, value) => {
  const parts = path.split('.');
  let at = obj;
  for (const part of parts.slice(0, -1)) at = at[part] ??= {};
  const last = parts.at(-1);
  if (last.startsWith('-=')) delete at[last.slice(2)];
  else at[last] = structuredClone(value);
};
function fixture({ value = 18, max = 40, level = 4, spent = 3 } = {}) {
  const actor = { type: 'character', uuid: 'Actor.Kyros', isOwner: true, flags: {}, items: [], updates: [], embeddedUpdates: [],
    system: { attributes: { hp: { value, max, temp: 0 } } },
    getFlag(scope, k) { return this.flags?.[scope]?.[k]; },
    async update(patch) { this.updates.push(structuredClone(patch)); for(const [k,v] of Object.entries(patch)) key(this,k,v); },
    async updateEmbeddedDocuments(kind, patches) { assert.equal(kind,'Item'); this.embeddedUpdates.push(structuredClone(patches)); for(const patch of patches){const target = this.items.find(i=>i.id===patch._id);assert.ok(target);for(const [k,v] of Object.entries(patch)){if(k!=='_id')key(target,k,v)}} }
  };
  const cls = { type: 'class', system: { identifier: 'pugilist', levels: level }, flags: { plutonium: {
    page: 'classes.html', source: 'Pugilist2024', hash: 'pugilist_pugilist2024' } } };
  const moxie = { id:'Auj8h5ZLVO5K1dju', type: 'feat', actor, system: { identifier:'moxie',
    uses: { max:'@scale.pugilist.moxie', spent, recovery:[{ period:'sr',type:'recoverAll' }] } },
    flags: { plutonium: { page:'classFeature', source:'Pugilist2024',
      hash:'moxie_pugilist_pugilist2024_2_pugilist2024' } } };
  const item = { id:'1GwtgtpcXP4liNdI', type:'feat', name:'Bloodied But Unbowed', actor,
    system: { identifier:'bloodied-but-unbowed', uses: { max:'1',spent:0,recovery:[{period:'sr',type:'recoverAll'}] }, activities:{} },
    flags: { plutonium: { page:'classFeature',source:'Pugilist2024',
      hash:'bloodied%20but%20unbowed_pugilist_pugilist2024_2_pugilist2024' } },
    updates: [], async update(changes) { this.updates.push(structuredClone(changes));for(const [k,v] of Object.entries(changes))key(this,k,v); }
  };
  const actions = ['dnd5eactivity000','dnd5eactivity001'].map((id, index) => ({
    id, _id:id, type:index?'heal':'utility', actor, item, activation:{type:'reaction'},
    consumption:{ targets:[{type:'itemUses',target:moxie.id,value:'1',scaling:{}}] },
    ...(index?{healing:{types:['temphp'],custom:{enabled:true,formula:'@classes.pugilist.levels * 4'}}}:{})
  }));
  for (const a of actions) item.system.activities[a.id]=a;
  actor.items=[cls,moxie,item];
  const gm={id:'gm',active:true,isGM:true};const users=[gm];users.activeGM=gm;
  const env={ game: { user:gm,users,actors:[actor], time:{worldTime:1500} }, foundry: { utils: {
    getProperty:(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o)
  } } };
  return {actor,item,moxie,actions,env};
}
function applyDamage(f,{ amount = 6, after = 12, time = Date.now() } = {}) {
  const update={'system.attributes.hp.value':after,'system.attributes.hp.temp':0};
  markBloodiedDamage(f.actor,amount,update,time);
  for(const [k,v] of Object.entries(update))key(f.actor,k,v);
  return update;
}
const check = act => activityAllowed(act,{bloodiedCheck:originalBloodiedAllowed});

// These tests use exact IDs, activity types, costs and source flags from the
// supplied Kyros audit, but are Node mocks, not a Foundry runtime test.
test('exact Plutonium provenance recognized; never by translated feature name', () => {
  const f=fixture();
  assert.equal(importedBloodied(f.item),true);
  assert.equal(pugilistLevel(f.actor),4);
  assert.equal(feature(f.actor,'bloodied'),f.item);
  f.item.flags.plutonium.hash='bloodied-other';
  assert.equal(feature(f.actor,'bloodied'),null);
});
test('preview is read-only and shows two erroneous Moxie costs',async()=>{
  const f=fixture(), snapshot=JSON.stringify(f.actions.map(a=>({ type:a.type, activation:a.activation, consumption:a.consumption, healing:a.healing })));
  const report=await configureBloodied(f.actor);
  assert.equal(report.status,'ready');
  assert.deepEqual(report.activities.map(a=>a.from),[f.moxie.id,f.moxie.id]);
  assert.equal(JSON.stringify(f.actions.map(a=>({ type:a.type, activation:a.activation, consumption:a.consumption, healing:a.healing }))), snapshot);
  assert.equal(f.item.updates.length,0);
});
test('GM opt-in changes only targets to own 1/short rest; all other activity fields unchanged',async()=>{
  const f=fixture();
  const before=structuredClone({healing:f.actions[1].healing,uses:f.moxie.system.uses, activations:f.actions.map(a=>a.activation)});
  await assert.rejects(configureBloodied(f.actor,{apply:true}),/Somente o Mestre/);
  assert.equal((await configureBloodied(f.actor,{apply:true,isGM:true})).status,'installed');
  assert.deepEqual(f.actions.map(a=>a.consumption.targets[0].target),[f.item.id,f.item.id]);
  assert.deepEqual(f.item.flags[MODULE_ID].bloodiedMigration.targets,[f.moxie.id,f.moxie.id]);
  assert.deepEqual({healing:f.actions[1].healing,uses:f.moxie.system.uses,activations:f.actions.map(a=>a.activation)},before);
  assert.equal(f.item.updates.length,1);
  assert.equal((await configureBloodied(f.actor,{apply:true,isGM:true})).status,'installed');
  assert.equal(f.item.updates.length,1);
});
test('restore reinstates original targets; never overwrites foreign item changes',async()=>{
  const f=fixture();
  await configureBloodied(f.actor,{apply:true,isGM:true});
  assert.equal((await configureBloodied(f.actor,{apply:true,restore:true,isGM:true})).status,'restored');
  assert.deepEqual(f.actions.map(a=>a.consumption.targets[0].target),[f.moxie.id,f.moxie.id]);
  assert.equal(f.item.flags[MODULE_ID]?.bloodiedMigration,undefined);
});
test('conflicting or altered second activity is not migrated',async()=>{
  const f=fixture();
  f.actions[1].consumption.targets[0].value='2';
  assert.equal((await configureBloodied(f.actor,{apply:true,isGM:true})).status,'unsupported-activity');
  assert.equal(f.item.updates.length,0);
  f.actions[1].consumption.targets[0].value='1';
  f.item.flags[SET]={};
  f.actions[0].consumption.targets[0].target='something-else';
  assert.equal((await configureBloodied(f.actor,{apply:true,isGM:true})).status,'conflict');
});
test('reactions disabled without previous damage; actual positive damage authorizes only correct branch',async()=>{
  const f=fixture();await configureBloodied(f.actor,{apply:true,isGM:true});
  assert.equal(check(f.actions[1]),false);
  const result=applyDamage(f,{after:12});
  assert.equal(result[`flags.${MODULE_ID}.bloodiedDamage`].seq,1);
  assert.equal(check(f.actions[1]),true);
  assert.equal(check(f.actions[0]),false);
  assert.equal(f.item.system.uses.spent,0);
});
test('above half HP allows Regular and not Bloodied; no fake damage from healing',async()=>{
  const f=fixture({value:28,max:40});await configureBloodied(f.actor,{apply:true,isGM:true});
  const updates={'system.attributes.hp.value':30,'system.attributes.hp.temp':0};
  markBloodiedDamage(f.actor,-2,updates);
  assert.equal(Object.hasOwn(updates,`flags.${MODULE_ID}.bloodiedDamage`),false);
  applyDamage(f,{after:24});
  assert.equal(check(f.actions[0]),true);
  assert.equal(check(f.actions[1]),false);
});
test('a stale damage event, duplicate trigger, and spent use do not activate reaction',async()=>{
  const f=fixture();await configureBloodied(f.actor,{apply:true,isGM:true});
  applyDamage(f,{after:12,time:Date.now()-130000});
  assert.equal(check(f.actions[1]),false);
  applyDamage(f,{after:10});
  assert.equal(pendingBloodiedDamage(f.actor)?.seq,2);
  f.item.system.uses.spent=1;
  assert.equal(check(f.actions[1]),false);
  f.item.system.uses.spent=0;
  f.actor.flags[MODULE_ID].bloodiedUsedDamage=2;
  assert.equal(check(f.actions[1]),false);
});
test('regular use replenishes spent Moxie, never grants temporary HP',async()=>{
  const f=fixture({value:28});await configureBloodied(f.actor,{apply:true,isGM:true});
  applyDamage(f,{after:25});
  const runtime=createRuntime(f.env);
  const message={id:'regular-01'};
  await runtime.bloodied(f.actions[0],{},{message});
  assert.equal(f.moxie.system.uses.spent,0);
  assert.equal(f.actor.system.attributes.hp.temp,0);
  assert.equal(f.actor.getFlag(MODULE_ID,'bloodiedUsedDamage'),1);
  assert.equal(f.actor.embeddedUpdates.length,1);
  await runtime.bloodied(f.actions[0],{},{message});
  assert.equal(f.actor.embeddedUpdates.length,1);
});
test('Bloodied use replenishes Moxie but does not duplicate native heal',async()=>{
  const f=fixture();await configureBloodied(f.actor,{apply:true,isGM:true});
  applyDamage(f,{after:12});
  const runtime=createRuntime(f.env);
  await runtime.bloodied(f.actions[1],{},{message:{id:'bloodied-01'}});
  assert.equal(f.moxie.system.uses.spent,0);
  assert.equal(f.actor.system.attributes.hp.temp,0);
  assert.equal(f.actor.getFlag(MODULE_ID,'tempHp'),undefined);
  assert.equal(f.actor.getFlag(MODULE_ID,'bloodiedUsedDamage'),1);
});
test('only native Bloodied heal is tracked; temporary HP vanish at short rest',async()=>{
  const f=fixture();await configureBloodied(f.actor,{apply:true,isGM:true});
  const runtime=createRuntime(f.env);
  const native=f.actions[1];
  assert.equal(isBloodiedHealing(native,f.actor),true);
  const origin={getAssociatedActivity:()=>undefined,getOriginatingMessage:()=>({getAssociatedActivity:()=>native})};
  const updates={'system.attributes.hp.temp':16};
  runtime.trackTemporaryHp(f.actor,-16,updates,{originatingMessage:origin});
  assert.deepEqual(updates[`flags.${MODULE_ID}.tempHp`],{source:'bloodied',remaining:16,expiresAt:null,shortRest:true});
  await f.actor.update(updates);
  await runtime.expire(f.actor,{shortRest:true,localRest:true});
  assert.equal(f.actor.system.attributes.hp.temp,0);
  assert.equal(f.actor.getFlag(MODULE_ID,'tempHp'),null);
});
test('unrelated temp HP grant replaces Bloodied provenance and is not removed',async()=>{
  const f=fixture();await configureBloodied(f.actor,{apply:true,isGM:true});
  const runtime=createRuntime(f.env);
  await f.actor.update({'system.attributes.hp.temp':12,[`flags.${MODULE_ID}.tempHp`]:{source:'bloodied',remaining:12,expiresAt:null,shortRest:true}});
  const second={'system.attributes.hp.temp':18};
  runtime.trackTemporaryHp(f.actor,-18,second,{originatingMessage:{getAssociatedActivity:()=>({id:'other',type:'heal',actor:f.actor,healing:{types:['temphp']}})}});
  await f.actor.update(second);
  await runtime.expire(f.actor,{shortRest:true,localRest:true});
  assert.equal(f.actor.system.attributes.hp.temp,18);
});
test('not allowed without the correct content adapter',async()=>{
  const f=fixture();await configureBloodied(f.actor,{apply:true,isGM:true});
  applyDamage(f,{after:10});
  assert.equal(activityAllowed(f.actions[1]),false);
  assert.equal(activityAllowed(f.actions[1],{bloodiedCheck:originalBloodiedAllowed}),true);
});
