import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectLevel4ASI } from '../scripts/asi-level4.mjs';

function fixture() {
  const actor = { type:'character', uuid:'Actor.ftj9Mpxn7j1iWs5N',
    system: { abilities: { str:{value:18}, dex:{value:14}, con:{value:16} } }, items: [] };
  const cls = { id:'IIvvB6EEnUb0ZEtY', type:'class', system:{ identifier:'pugilist', levels:4,
    advancement:{ STbYNCVGKbvp9t94: { _id:'STbYNCVGKbvp9t94',type:'HitPoints',value:{1:'max',2:10,3:10,4:10} } } },
    flags:{plutonium:{page:'classes.html',source:'Pugilist2024',hash:'pugilist_pugilist2024'}}};
  const sentinel = { id:'eZSl2e8Yyac8PWCo', type:'feat', system:{identifier:'sentinel',
    source:{rules:'2024',book:'PHB 2024'},type:{value:'feat',subtype:'general'},
    prerequisites:{level:4},advancement:{npe7NKIWPXCs01q3:{_id:'npe7NKIWPXCs01q3',
      type:'AbilityScoreImprovement',level:0,configuration:{points:1,cap:1},
      value:{type:'asi',assignments:{str:1}}}}},
    flags:{plutonium:{page:'feats.html',source:'XPHB',hash:'sentinel_xphb'}}};
  actor.items=[cls,sentinel];
  return {actor,cls,sentinel};
}

test('exact Kyros snapshot: Sentinel PHB 2024 +1 STR exists, class level 4 has no ASI record',()=>{
  const {actor,cls,sentinel}=fixture(), before=structuredClone(actor);
  const x=inspectLevel4ASI(actor);
  assert.equal(x.status,'sentinel-selected-class-asi-unlinked');
  assert.equal(x.classId,cls.id);
  assert.equal(x.classASIRecordCount,0);
  assert.deepEqual(x.sentinelASI,{featId:sentinel.id,advancementId:'npe7NKIWPXCs01q3',ability:'str',points:1,currentScore:18});
  assert.equal(x.safeToGrantAnotherASI,false);
  assert.equal(x.requiresReview,true);
  assert.equal(x.changesApplied,0);
  assert.deepEqual(actor,before);
});
test('does not infer ASI from current strength score alone',()=>{
  const {actor}=fixture();actor.items.pop();
  const result=inspectLevel4ASI(actor);
  assert.equal(result.status,'class-asi-missing-unverified');
  assert.equal(result.sentinelASI,null);
  assert.equal(result.safeToGrantAnotherASI,false);
});
test('changing Sentinel name or translating it does not affect identity',()=>{
  const {actor,sentinel}=fixture();sentinel.name='Sentinela';
  assert.equal(inspectLevel4ASI(actor).status,'sentinel-selected-class-asi-unlinked');
  sentinel.flags.plutonium.hash='unrelated';
  assert.equal(inspectLevel4ASI(actor).status,'class-asi-missing-unverified');
});
test('a native class ASI with completed attributes takes precedence over inferred feat',()=>{
  const {actor,cls}=fixture();cls.system.advancement.slot={_id:'slot',type:'AbilityScoreImprovement',level:4,
    value:{type:'asi',assignments:{con:2}}};
  const x=inspectLevel4ASI(actor);
  assert.equal(x.status,'class-asi-recorded');
  assert.equal(x.classASIId,'slot');
  assert.equal(x.requiresReview,false);
});
test('a native class feat selection takes precedence; no duplicate grant',()=>{
  const {actor,cls,sentinel}=fixture();cls.system.advancement.slot={_id:'slot',type:'AbilityScoreImprovement',level:4,
    value:{type:'feat',feat:{[sentinel.id]:'Compendium.dnd5e.feats24.Item.example'}}};
  const x=inspectLevel4ASI(actor);
  assert.equal(x.status,'class-feat-recorded');
  assert.equal(x.safeToGrantAnotherASI,false);
});
test('empty native advancement reports pending, never complete',()=>{
  const {actor,cls}=fixture();cls.system.advancement.slot={_id:'slot',type:'AbilityScoreImprovement',level:4,value:{}};
  assert.equal(inspectLevel4ASI(actor).status,'class-asi-unconfigured');
  assert.equal(inspectLevel4ASI(actor).requiresReview,true);
});
test('uncompleted or malformed Sentinel advancement cannot count as a completed selection',()=>{
  for(const mutate of [
    f=>f.sentinel.system.advancement.npe7NKIWPXCs01q3.value.type='feat',
    f=>f.sentinel.system.advancement.npe7NKIWPXCs01q3.value.assignments.str=2,
    f=>f.sentinel.system.advancement.npe7NKIWPXCs01q3.configuration.points=2,
    f=>f.sentinel.system.advancement.npe7NKIWPXCs01q3.value.assignments={con:1}
  ]) {
    const f=fixture();mutate(f);
    assert.equal(inspectLevel4ASI(f.actor).status,'class-asi-missing-unverified');
  }
});
test('duplicate Sentinel or Pugilist originals fail closed',()=>{
  const f=fixture();f.actor.items.push({...f.sentinel});
  assert.equal(inspectLevel4ASI(f.actor).status,'ambiguous-records');
  f.actor.items.pop();f.actor.items.push({...f.cls});
  assert.equal(inspectLevel4ASI(f.actor).status,'duplicate-imported-classes');
});
test('wrong character or class levels outside supported range remain read only',()=>{
  const f=fixture();f.cls.system.levels=3;
  assert.equal(inspectLevel4ASI(f.actor).status,'outside-level-4-scope');
  f.cls.system.levels=7;
  assert.equal(inspectLevel4ASI(f.actor).requiresReview,true);
  f.actor.type='npc';
  assert.equal(inspectLevel4ASI(f.actor).status,'not-character');
});
test('Map and Collection-like advancement structures are supported',()=>{
  const f=fixture();f.cls.system.advancement=new Map(Object.entries(f.cls.system.advancement));
  f.sentinel.system.advancement=new Map(Object.entries(f.sentinel.system.advancement));
  assert.equal(inspectLevel4ASI(f.actor).status,'sentinel-selected-class-asi-unlinked');
});
