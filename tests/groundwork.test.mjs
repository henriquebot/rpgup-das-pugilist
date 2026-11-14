import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_ID, ACTIVITY_IDS as A } from '../src/ids.mjs';
import { feature, pugilistLevel, importedGroundwork, importedSquaredCircle } from '../scripts/policy.mjs';
import { configureGroundwork, inspectGroundwork, originalGroundworkActivityAllowed } from '../scripts/groundwork.mjs';

const DAS = 'dnd5e-combat';
const importFlags = (page, hash) => ({ plutonium: { page, hash, source: 'Pugilist2024' } });
const setPath = (base, path, value) => {
  const parts = path.split('.'); let obj=base;
  for(const key of parts.slice(0,-1)) obj = obj[key] ??= {};
  const last=parts.at(-1);
  if(last.startsWith('-=')) delete obj[last.slice(2)];
  else obj[last]=structuredClone(value);
};
function fixture() {
  const actor={ type:'character', uuid:'Actor.ftj9Mpxn7j1iWs5N', isOwner:true, items:[] };
  const cls={ type:'class', system:{identifier:'pugilist',levels:4}, flags:importFlags('classes.html','pugilist_pugilist2024') };
  const subclass={ id:'BZc3XCGsvzKmqrTm', type:'subclass', system:{identifier:'squared-circle',classIdentifier:'pugilist'},
    flags:importFlags('classes.html','pugilist_pugilist2024,state:sub_squared%20circle_pugilist2024=b1') };
  const moxie={ id:'Auj8h5ZLVO5K1dju', type:'feat', system:{identifier:'moxie',uses:{max:'@scale.pugilist.moxie',spent:1,recovery:[{period:'sr',type:'recoverAll'}]}},
    flags:importFlags('classFeature','moxie_pugilist_pugilist2024_2_pugilist2024') };
  const ground={ id:'GkADqVQTedFWW3ek', type:'feat', actor, name:'Groundwork',
    system:{identifier:'groundwork',description:{value:'<div class="ddb"><p><strong>Compression Lock.</strong> Original</p></div>'},
      activities:{},uses:{max:'',spent:0,recovery:[]}},
    flags:importFlags('subclassFeature','groundwork_pugilist_pugilist2024_squared%20circle_pugilist2024_3_pugilist2024'), updates:[],
    async update(update) { this.updates.push(structuredClone(update)); for(const [k,v] of Object.entries(update))setPath(this,k,v); }
  };
  actor.items=[cls,subclass,moxie,ground];
  return { actor, cls, subclass, moxie, ground };
}

test('Kyros audit provenance: one original Squared Circle and Groundwork at level 4',()=>{
  const f=fixture();
  assert.equal(pugilistLevel(f.actor),4);
  assert.equal(importedSquaredCircle(f.subclass),true);
  assert.equal(importedGroundwork(f.ground),true);
  assert.equal(feature(f.actor,'groundwork'),f.ground);
  assert.equal(feature(f.actor,'stopAndDrop'),f.ground);
  assert.equal(feature(f.actor,'compression'),null);
  assert.equal(feature(f.actor,'inescapable'),null);
});

test('preview does not mutate HTML, items, resources, or activities',async()=>{
  const f=fixture(); const snapshot=()=>JSON.stringify({ground:f.ground.system,flags:f.ground.flags,moxie:f.moxie.system,subclass:f.subclass.system}); const before=snapshot();
  const result=await configureGroundwork(f.actor);
  assert.equal(result.status,'ready');
  assert.equal(snapshot(),before);
  assert.equal(f.ground.updates.length,0);
});

test('GM opt-in inserts only two native dnd5e activities and one DAS rule on original Groundwork',async()=>{
  const f=fixture();
  await assert.rejects(configureGroundwork(f.actor,{apply:true}),/Somente o Mestre/);
  const before=f.ground.system.description.value;
  const result=await configureGroundwork(f.actor,{apply:true,isGM:true});
  assert.equal(result.status,'installed');
  assert.equal(f.ground.updates.length,1);
  assert.equal(f.ground.system.description.value,before);
  assert.equal(f.moxie.system.uses.spent,1);
  assert.deepEqual(Object.keys(f.ground.system.activities).sort(),[A.compression,A.inescapable].sort());
  const damage=f.ground.system.activities[A.compression];
  assert.equal(damage.type,'damage');
  assert.deepEqual(damage.consumption.targets,[]);
  assert.equal(damage.damage.parts[0].custom.formula,'@scale.pugilist.fisticuffs + @abilities.str.mod');
  assert.deepEqual(damage.damage.parts[0].types,['bludgeoning']);
  const inex=f.ground.system.activities[A.inescapable];
  assert.equal(inex.type,'utility');
  assert.deepEqual(inex.consumption.targets.map(x=>[x.type,x.target,x.value]),[['itemUses',f.moxie.id,'1']]);
  assert.deepEqual(f.ground.flags[DAS].inescapable,{activity:A.inescapable});
  assert.equal(f.ground.flags[MODULE_ID].groundworkIntegration.version,1);
  assert.equal(feature(f.actor,'compression'),f.ground);
  assert.equal(feature(f.actor,'inescapable'),f.ground);
  assert.equal(originalGroundworkActivityAllowed({...damage,id:A.compression,item:f.ground}),false);
  assert.equal(originalGroundworkActivityAllowed({...inex,id:A.inescapable,item:f.ground}),false);
  assert.equal((await configureGroundwork(f.actor,{apply:true,isGM:true})).status,'installed');
  assert.equal(f.ground.updates.length,1);
});

test('restoring deletes only inserted activities/flags, preserves original HTML and other activities',async()=>{
  const f=fixture();
  f.ground.system.activities['existingActivity']={_id:'existingActivity',type:'utility',name:'Preserved'};
  const original=structuredClone(f.ground.system);
  await configureGroundwork(f.actor,{apply:true,isGM:true});
  assert.equal((await configureGroundwork(f.actor,{apply:true,restore:true,isGM:true})).status,'restored');
  assert.deepEqual(f.ground.system,original);
  assert.equal(f.ground.flags[DAS]?.inescapable,undefined);
  assert.equal(f.ground.flags[MODULE_ID]?.groundworkIntegration,undefined);
});

test('no change on conflicting DAS rule or activity ID',async()=>{
  const f=fixture();
  f.ground.flags[DAS]={inescapable:true};
  assert.equal((await configureGroundwork(f.actor,{apply:true,isGM:true})).status,'conflict');
  assert.equal(f.ground.updates.length,0);
  delete f.ground.flags[DAS];
  f.ground.system.activities[A.compression]={_id:A.compression,name:'Foreign'};
  assert.equal(inspectGroundwork(f.actor).status,'conflict');
});

test('wrong subclass source, duplicate Groundwork or missing Moxie cannot migrate',async()=>{
  const f=fixture();
  f.subclass.flags.plutonium.hash='other';
  assert.equal(feature(f.actor,'groundwork'),null);
  assert.equal((await configureGroundwork(f.actor,{apply:true,isGM:true})).status,'not-imported-groundwork');
  f.subclass.flags.plutonium.hash='pugilist_pugilist2024,state:sub_squared%20circle_pugilist2024=b1';
  f.actor.items.push({...f.ground});
  assert.equal(feature(f.actor,'groundwork'),null);
  f.actor.items.pop();
  f.actor.items=f.actor.items.filter(i=>i!==f.moxie);
  assert.equal(inspectGroundwork(f.actor).status,'missing-moxie');
});
