import test from 'node:test';
import assert from 'node:assert/strict';
import { feature, importedHeavyHitter } from '../scripts/policy.mjs';
import { createHeavyHitter, nativeGrappleShove, qualifyingUnarmedAttack } from '../scripts/heavy-hitter.mjs';

const DAS = 'dnd5e-combat';
function fixture({ answer = 'yes', gap = 1, mode = 'imported' } = {}) {
  const cls = { type:'class',system:{identifier:'pugilist', levels:4},flags:{plutonium:{
    source:'Pugilist2024', page:'classes.html',hash:'pugilist_pugilist2024'}}};
  const heavy = { id:'728mrEPI9zyg8YQ2',name:'Heavy Hitter',type:'feat',system:{identifier:'heavy-hitter',activities:{}},flags:{plutonium:{
    source:'Pugilist2024',page:'classFeature',hash:'heavy%20hitter_pugilist_pugilist2024_3_pugilist2024'}}};
  const actor={uuid:'Actor.Kyros',name:'Kyros',type:'character',items:[],system:{attributes:{hp:{value:40,max:52}}}};
  const originWeapon = {type:'weapon',system:{identifier:'unarmed-strike-pugilist'},flags:{plutonium:{source:'Pugilist2024',page:'items.html',hash:'unarmed%20strike%20(pugilist)_pugilist2024'}}};
  const nativeWeapon={type:'weapon',system:{identifier:'unarmed-strike',activities:{}},flags:{[DAS]:{basicAction:'unarmed'}}};
  const sav={id:'dnd5eCombatGrShv',type:'save',item:nativeWeapon,save:{ability:['str','dex'],dc:{calculation:'str'}},
    consumption:{targets:[]},effects:['dnd5eCombatGrapl','dnd5eCombatProne','dnd5eCombatPush0'].map(_id=>({_id}))};
  nativeWeapon.system.activities[sav.id]=sav;
  let calls=0;
  nativeWeapon.system.getCardData=async ({activity})=>{calls++;assert.equal(activity,sav);return {activity:{id:sav.id},item:{id:'nativeUnarmed'}}};
  const origin = mode==='das'?nativeWeapon:originWeapon;
  const attack={uuid:'Activity.KyrosUnarmed',actor,item:origin,type:'attack',attack:{type:{classification:'unarmed'}},
    getUsageToken:()=>source};
  actor.items=[cls,heavy,originWeapon,nativeWeapon];
  const scene={id:'scene01',tokens:new Map()};
  const source={id:'source',uuid:'Scene.scene01.Token.source',name:'Kyros',actor,parent:scene};
  const targetActor={uuid:'Actor.enemy',system:{attributes:{hp:{value:20,max:30},ac:{value:15}}},statuses:new Set()};
  const target={id:'enemy',uuid:'Scene.scene01.Token.enemy',name:'Orc',actor:targetActor,parent:scene,texture:{src:'orc.png'}};
  scene.tokens.set(source.id,source);scene.tokens.set(target.id,target);
  const messages=new Map([['attackMsg',{speaker:{scene:scene.id,token:source.id}}],['useMsg',{speaker:{scene:scene.id,token:source.id}}]]);
  const scenes=new Map([[scene.id,scene]]);
  const registry=new Map([[attack.uuid,attack],[target.uuid,target]]);
  const gm={id:'gm'};const users={activeGM:gm};
  const cards=[],questions=[];
  const env={game:{user:gm,users,scenes,messages,modules:new Map([[DAS,{api:{gap:()=>({cells:gap})}}]])},
    fromUuidSync:uuid=>registry.get(uuid),ChatMessage:{implementation:{getSpeaker:({token})=>({scene:token.parent.id,token:token.id}),
      create:async data=>{cards.push(data);return {id:'follow-card'}}}}};
  const choose=async (_,q)=>{questions.push(q);return answer};
  const integration=createHeavyHitter(env,{choose});
  const result={id:'resolution001',step:'done',plan:{attack:true},activity:attack.uuid,
    origin:'useMsg',attack:{messageId:'attackMsg'},targets:[{hit:true,token:target.uuid,unaffected:false}]};
  return {actor,cls,heavy,originWeapon,nativeWeapon,attack,sav,source,target,targetActor,env,cards,questions,integration,result,getCardCalls:()=>calls};
}

test('identifies original Heavy Hitter and original Pugilist Unarmed Strike without name matching',()=>{
  const f=fixture();assert.equal(importedHeavyHitter(f.heavy),true);
  assert.equal(feature(f.actor,'heavyHitter'),f.heavy);
  assert.equal(qualifyingUnarmedAttack(f.attack,f.actor),true);
  f.heavy.flags.plutonium.hash='unrelated';
  assert.equal(feature(f.actor,'heavyHitter'),null);
});

test('uses exactly DAS native Grapple/Shove save and never creates new attack or consumes action/Moxie',async()=>{
  const f=fixture();
  const snapshot = () => ({ heavy: structuredClone(f.heavy.system), original: structuredClone(f.originWeapon.system),
    effects: structuredClone(f.sav.effects), consumption: structuredClone(f.sav.consumption) });
  const before = snapshot();
  assert.equal(nativeGrappleShove(f.actor),f.sav);
  await f.integration.resolution(f.result);
  assert.equal(f.questions.length,1);
  assert.equal(f.cards.length,1);
  const card=f.cards[0];
  assert.equal(card.type,'usage');
  assert.equal(card.system.activity.id,'dnd5eCombatGrShv');
  assert.equal(card.system.targets.length,1);
  assert.equal(card.system.targets[0].token,f.target.uuid);
  assert.equal(card.flags[DAS].areaTick.event,'heavyHitter');
  assert.equal(f.getCardCalls(),1);
  assert.deepEqual(snapshot(), before);
  await f.integration.resolution(f.result);
  assert.equal(f.questions.length,1);
  assert.equal(f.cards.length,1);
});

test('refusing optional follow-up creates no usage card',async()=>{
  const f=fixture({answer:'no'});
  await f.integration.resolution(f.result);
  assert.equal(f.questions.length,1);assert.equal(f.cards.length,0);
});

test('DAS unarmed attack also qualifies, but melee weapon and unrelated saves do not',async()=>{
  const f=fixture({mode:'das'});
  assert.equal(qualifyingUnarmedAttack(f.attack,f.actor),true);
  await f.integration.resolution(f.result);
  assert.equal(f.cards.length,1);
  f.attack.attack.type.classification='weapon';
  assert.equal(qualifyingUnarmedAttack(f.attack,f.actor),false);
});

test('miss, ignored targets, multiple targets, or no completed attack never trigger',async()=>{
  for(const mutation of [f=>{f.result.targets[0].hit=false;}, f=>{f.result.targets[0].unaffected=true;},
    f=>{f.result.targets.push({...f.result.targets[0]});}, f=>{f.result.step='missed';},
    f=>{f.result.plan.attack=false;}]){
      const f=fixture();mutation(f);
      await f.integration.resolution(f.result);
      assert.equal(f.questions.length,0);assert.equal(f.cards.length,0);
    }
});

test('unknown native save, extra resource cost, out-of-reach target and dead target fail closed',async()=>{
  for(const mutation of [f=>{f.sav.effects=[];}, f=>{f.sav.consumption.targets=[{type:'itemUses',value:'1'}];},
    f=>{f.env.game.modules.get(DAS).api.gap=()=>({cells:2});},f=>{f.targetActor.system.attributes.hp.value=0;}]){
      const f=fixture();mutation(f);
      await f.integration.resolution(f.result);
      assert.equal(f.cards.length,0);assert.equal(f.questions.length,0);
    }
});

test('no Heavy Hitter, level below 3, no GM authority and foreign actors fail closed',async()=>{
  for(const mutation of [f=>{f.actor.items=f.actor.items.filter(x=>x!==f.heavy);},
    f=>{f.cls.system.levels=2;},f=>{f.env.game.users.activeGM={id:'other'};},
    f=>{f.attack.actor={uuid:'Actor.other'};}]){
      const f=fixture();mutation(f);
      await f.integration.resolution(f.result);
      assert.equal(f.questions.length,0);assert.equal(f.cards.length,0);
    }
});
