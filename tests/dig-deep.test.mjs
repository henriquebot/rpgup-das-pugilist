import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_ID } from '../src/ids.mjs';
import { feature, importedDigDeep, applyDigDeep, activityAllowed } from '../scripts/policy.mjs';
import { inspectDigDeep, originalDigDeepActivityAllowed, configureDigDeep } from '../scripts/dig-deep.mjs';

const ID = '5cl8CQZe3IfGU2A7';
const EFFECT = 'DsBQqR6L92pVrZJR';
const provenance = (page, hash) => ({ plutonium: { source: 'Pugilist2024', page, hash } });
const rawChanges = () => [
  ...['bludgeoning','piercing','slashing'].map((value,i) => ({_id:`res${i}`,key:'system.traits.dr.value',type:'add',value,phase:'initial',priority:20})),
  ...['msak','mwak','rwak','rsak'].map((t,i) => ({_id:`atk${i}`,key:`system.bonuses.${t}.attack`,type:'add',value:'@attributes.exhaustion * 2',phase:'initial',priority:7})),
  { _id:'skillCheck',key:'system.bonuses.abilities.check',type:'add',value:'@attributes.exhaustion * 2',phase:'initial',priority:7 },
  { _id:'skillSave',key:'system.bonuses.abilities.save',type:'add',value:'@attributes.exhaustion * 2',phase:'initial',priority:7 },
  { _id:'speedBoost',key:'system.attributes.movement.bonus',type:'add',value:'@attributes.exhaustion * 5',phase:'initial',priority:7 }
];
function pathUpdate(target, path, value) {
  const keys = path.split('.');
  let obj = target;
  for (const key of keys.slice(0,-1)) obj = obj[key] ??= {};
  const last = keys.at(-1);
  if(last.startsWith('-=')) delete obj[last.slice(2)];
  else obj[last] = structuredClone(value);
}
function fixture({ spent = 0, exhaustion = 0, effectActive = false } = {}) {
  const actor = {type:'character',uuid:'Actor.ftj9Mpxn7j1iWs5N',isOwner:true,items:[],effects:[],
    system:{attributes:{exhaustion},traits:{ci:{value:new Set()}}}};
  const cls = {type:'class',system:{identifier:'pugilist',levels:4},flags:provenance('classes.html','pugilist_pugilist2024')};
  const effect = { id:EFFECT,_id:EFFECT,name:'Dig Deep',type:'base',disabled:false,transfer:false,
    duration:{value:600,units:'seconds',expiry:'turnStart'},flags:{plutonium:{dedupeId:'dig-deep'}},
    system:{changes:rawChanges()},toObject(){return {system:{changes:structuredClone(this.system.changes)}}} };
  const regular={id:'dnd5eactivity000',type:'utility',actor,activation:{type:'bonus'},consumption:{targets:[{
    type:'itemUses',value:'1',scaling:{}}]},effects:[{_id:EFFECT}],name:'Regular'};
  const recharge={id:'dnd5eactivity001',type:'utility',actor,activation:{type:'bonus'},consumption:{targets:[{
    type:'attribute',value:'-1',target:'attributes.exhaustion',scaling:{}}]},effects:[{_id:EFFECT}],name:'Exhaustion'};
  const item={id:ID,uuid:`${actor.uuid}.Item.${ID}`,actor,type:'feat',name:'Dig Deep',
    system:{identifier:'dig-deep',uses:{max:'1',spent,recovery:[{period:'lr',type:'recoverAll'}]},
      description:{value:'<div class="ddb">Texto original; preservar!</div>'},activities:{[regular.id]:regular,[recharge.id]:recharge}},
    effects:[effect],flags:provenance('classFeature','dig%20deep_pugilist_pugilist2024_4_pugilist2024'),
    writes:[],effectWrites:[],
    async update(updates){this.writes.push(structuredClone(updates));for(const [k,v] of Object.entries(updates))pathUpdate(this,k,v)},
    async updateEmbeddedDocuments(kind, updates){assert.equal(kind,'ActiveEffect');this.effectWrites.push(structuredClone(updates));for(const patch of updates){
      assert.equal(patch._id,EFFECT);effect.system.changes=structuredClone(patch['system.changes']);
    }}
  };
  regular.item = item;recharge.item = item;
  actor.items=[cls,item];
  if(effectActive)actor.effects.push({name:'Dig Deep',origin:`${item.uuid}.ActiveEffect.${EFFECT}`});
  return {actor,item,cls,effect,regular,recharge};
}

test('the original Dig Deep is recognized by exact 5etools metadata at level 4',()=>{
  const f=fixture();assert.equal(importedDigDeep(f.item),true);
  assert.equal(feature(f.actor,'digDeep'),f.item);
  assert.equal(inspectDigDeep(f.actor).status,'ready');
  f.item.flags.plutonium.hash='someone-elses-dig';
  assert.equal(feature(f.actor,'digDeep'),null);
  assert.equal(inspectDigDeep(f.actor).status,'not-original-dig-deep');
});

test('preview is read-only; migration does not happen when the item is already active',async()=>{
  const f=fixture();const snapshot = () => ({uses:structuredClone(f.item.system.uses),regular:{activation:structuredClone(f.regular.activation),consumption:structuredClone(f.regular.consumption),effects:structuredClone(f.regular.effects)},recharge:{activation:structuredClone(f.recharge.activation),consumption:structuredClone(f.recharge.consumption),effects:structuredClone(f.recharge.effects)},changes:structuredClone(f.effect.system.changes),flags:structuredClone(f.item.flags)});const before=snapshot();
  assert.equal((await configureDigDeep(f.actor)).status,'ready');
  assert.deepEqual(snapshot(),before);
  assert.equal(f.item.writes.length,0);
  assert.equal(f.item.effectWrites.length,0);
  f.actor.effects.push({name:'Dig Deep',origin:`${f.item.uuid}.ActiveEffect.${EFFECT}`});
  assert.equal(inspectDigDeep(f.actor).status,'active-effect-present');
});

test('only GM opt-in applies reversible migration to exact original data',async()=>{
  const f=fixture();const previous=structuredClone(f.effect.system.changes);
  await assert.rejects(configureDigDeep(f.actor,{apply:true}),/Somente o Mestre/);
  assert.equal((await configureDigDeep(f.actor,{apply:true,isGM:true})).status,'installed');
  assert.equal(inspectDigDeep(f.actor).status,'installed');
  assert.equal(f.regular.activation.type,'bonus');
  assert.equal(f.regular.effects[0]._id,EFFECT);
  assert.equal(f.regular.consumption.targets[0].value,'1');
  assert.equal(f.recharge.activation.type,'special');
  assert.deepEqual(f.recharge.effects,[]);
  assert.deepEqual(f.recharge.consumption.targets.map(t=>[t.type,t.target??'',t.value]),
    [['attribute','attributes.exhaustion','-1'],['itemUses','','-1']]);
  assert.equal(f.effect.system.changes.length,4);
  assert.equal(f.effect.system.changes.filter(c=>c.key==='system.traits.dr.value').length,3);
  assert.equal(f.effect.system.changes.find(c=>c.key===`flags.${MODULE_ID}.ignoreExhaustion`)?.type,'custom');
  assert.deepEqual(f.item.flags[MODULE_ID].digDeepMigration.changes,previous);
  assert.equal(f.item.writes.length,1);assert.equal(f.item.effectWrites.length,1);
  assert.equal(f.item.system.uses.spent,0);
  assert.equal(f.item.system.description.value,'<div class="ddb">Texto original; preservar!</div>');
});

test('regular activity consumes native bonus action, recharge only when spent and safe from lethal exhaustion',async()=>{
  const f=fixture({spent:0,exhaustion:3});
  assert.equal(originalDigDeepActivityAllowed(f.regular),false);
  assert.equal(originalDigDeepActivityAllowed(f.recharge),false);
  await configureDigDeep(f.actor,{apply:true,isGM:true});
  assert.equal(originalDigDeepActivityAllowed(f.regular),true);
  assert.equal(originalDigDeepActivityAllowed(f.recharge),false);
  f.item.system.uses.spent=1;
  assert.equal(originalDigDeepActivityAllowed(f.regular),false);
  assert.equal(originalDigDeepActivityAllowed(f.recharge),true);
  f.actor.system.attributes.exhaustion=5;
  assert.equal(originalDigDeepActivityAllowed(f.recharge),false);
  f.actor.system.attributes.exhaustion=6;
  assert.equal(originalDigDeepActivityAllowed(f.recharge),false);
});

test('already exhausted source blocks duplicative RPGUp version',async()=>{
  const f=fixture();
  const original=feature(f.actor,'digDeep');
  const fallback={actor:f.actor,type:'feat',system:{identifier:'rpgup-pugilist-dig-deep'},
    flags:{[MODULE_ID]:{key:'digDeep'}}};
  f.actor.items.push(fallback);
  assert.equal(feature(f.actor,'digDeep'),original);
  await configureDigDeep(f.actor,{apply:true,isGM:true});
  assert.equal(activityAllowed({actor:f.actor,item:fallback,id:'rpgupDigAct00001',type:'utility'}),false);
});

test('native exemption works only below six levels while keeping real exhaustion',async()=>{
  const f=fixture({exhaustion:3});
  f.actor.effects.push({type:'condition',system:{type:'exhaustion',level:3}});
  await configureDigDeep(f.actor,{apply:true,isGM:true});
  applyDigDeep(f.actor,{key:`flags.${MODULE_ID}.ignoreExhaustion`});
  assert.equal(f.actor.system.traits.ci.value.has('exhaustion'),true);
  assert.equal(f.actor.effects[0].system.level,3);
  f.actor.system.traits.ci.value.clear();
  f.actor.effects[0].system.level=6;
  applyDigDeep(f.actor,{key:`flags.${MODULE_ID}.ignoreExhaustion`});
  assert.equal(f.actor.system.traits.ci.value.has('exhaustion'),false);
});

test('restore recovers all imported activity targets/effects and original effect changes',async()=>{
  const f=fixture();const originals=structuredClone({reg:{activation:f.regular.activation,consumption:f.regular.consumption,effects:f.regular.effects},
    recharge:{activation:f.recharge.activation,consumption:f.recharge.consumption,effects:f.recharge.effects},
    effect:f.effect.system.changes,html:f.item.system.description.value});
  await configureDigDeep(f.actor,{apply:true,isGM:true});
  assert.equal((await configureDigDeep(f.actor,{apply:true,restore:true,isGM:true})).status,'restored');
  assert.equal(inspectDigDeep(f.actor).status,'ready');
  assert.deepEqual({reg:{activation:f.regular.activation,consumption:f.regular.consumption,effects:f.regular.effects},
    recharge:{activation:f.recharge.activation,consumption:f.recharge.consumption,effects:f.recharge.effects},
    effect:f.effect.system.changes,html:f.item.system.description.value},originals);
  assert.equal(f.item.flags[MODULE_ID]?.digDeepMigration,undefined);
});

test('conflicting effect or foreign activity data never gets overwritten',async()=>{
  const f=fixture();
  f.effect.system.changes[0].value='force';
  assert.equal((await configureDigDeep(f.actor,{apply:true,isGM:true})).status,'unsupported-original');
  assert.equal(f.item.effectWrites.length,0);
  f.effect.system.changes=rawChanges();
  f.recharge.consumption.targets.push({type:'itemUses',value:'-1'});
  assert.equal(inspectDigDeep(f.actor).status,'unsupported-original');
});

test('failed migration second step rolls back the effect',async()=>{
  const f=fixture();const original=structuredClone(f.effect.system.changes);
  f.item.update=async()=>{throw new Error('simulated failed item update')};
  await assert.rejects(configureDigDeep(f.actor,{apply:true,isGM:true}),/simulated failed/);
  assert.deepEqual(f.effect.system.changes,original);
  assert.equal(f.item.effectWrites.length,2);
});

test('idempotent re-run does not reapply effect or spend another use',async()=>{
  const f=fixture();
  const first=await configureDigDeep(f.actor,{apply:true,isGM:true});
  assert.equal(first.status,'installed');
  const again=await configureDigDeep(f.actor,{apply:true,isGM:true});
  assert.equal(again.status,'installed');
  assert.equal(f.item.writes.length,1);
  assert.equal(f.item.effectWrites.length,1);
});

test('foreign changes after migration block a blind rollback',async()=>{
  const f=fixture();
  await configureDigDeep(f.actor,{apply:true,isGM:true});
  f.effect.system.changes.push({_id:'other',key:'system.attributes.ac.bonus',type:'add',value:'1'});
  assert.equal(inspectDigDeep(f.actor).status,'conflict');
  assert.equal((await configureDigDeep(f.actor,{apply:true,restore:true,isGM:true})).status,'conflict');
  assert.equal(f.item.writes.length,1);
});

test('Dig Deep validates raw one-use value before migrated numeric data', () => {
  const { actor, item } = fixture();
  item._source = { system: { uses: { max: '1' } } };
  item.system.uses.max = 1;
  assert.equal(inspectDigDeep(actor).status, 'ready');
  item._source.system.uses.max = '2';
  assert.equal(inspectDigDeep(actor).status, 'unsupported-uses');
});
