import { createHash } from "node:crypto";
import { MODULE_ID, IDS, IDENTIFIERS, ACTIVITY_IDS, EFFECT_IDS, uuid } from "./ids.mjs";

// All prose below is an original mechanical summary of the rules supplied by the user.
const stable = key => createHash("sha256").update(`${MODULE_ID}:${key}`).digest("hex").slice(0, 16);
const icon = "icons/skills/melee/unarmed-punch-fist-white.webp";
const uses = (max = "", period = null) => ({ max: String(max), spent: 0, recovery: period ? [{ period, type: "recoverAll" }] : [] });
const description = value => ({ value: `<p>${value}</p>`, chat: "" });
const source = { custom: "RPGUp DAS — resumo mecânico original", rules: "2024", revision: 1, license: "", book: "" };
const cost = (target = IDENTIFIERS.moxie, value = "1") => ({ type: "itemUses", target, value, scaling: { mode: "", formula: "" } });
const activity = (id, name, type = "utility", activation = "special", opts = {}) => ({
  _id: id, name, type, sort: 0,
  activation: { type: activation, value: 1, override: false, condition: "" },
  consumption: { targets: [], scaling: { allowed: false }, spellSlot: false },
  description: { chatFlavor: "" },
  duration: { value: "", units: "inst", concentration: false, override: false },
  effects: [], range: { override: false, units: "self", value: null, special: "" },
  target: { affects: { count: "", type: "self", choice: false, special: "" }, template: { type: "", units: "ft", contiguous: false }, override: false, prompt: false },
  uses: uses(), ...(type === "utility" ? { roll: { formula: "", name: "", prompt: false, visible: false } } : {}), ...opts
});
const consumption = targets => ({ targets, scaling: { allowed: false }, spellSlot: false });
const damagePart = (formula, types = ["bludgeoning"]) => ({
  number: null, denomination: null, bonus: "", types,
  custom: { enabled: true, formula }, scaling: { mode: "", number: 1, formula: "" }
});
const base = (key, name, type, text) => ({
  _id: IDS[key], name, type, img: icon, folder: null, sort: 0, ownership: { default: 0 },
  system: { identifier: IDENTIFIERS[key], description: description(text), source },
  effects: [], flags: { [MODULE_ID]: { key, schemaVersion: 1 }, dnd5e: { riders: { activity: [], effect: [] } } }
});
const feat = (key, name, level, text, opts = {}) => {
  const item = base(key, name, "feat", text);
  Object.assign(item.system, { type: { value: "class", subtype: "" }, requirements: `Pugilist ${level}`,
    prerequisites: { level, repeatable: false, items: [] }, properties: [], uses: uses(), activities: {}, advancement: [], enchant: {}, ...opts });
  for (const action of Object.values(item.system.activities)) action.visibility = {
    identifier: "pugilist", level: { min: level, max: 6 }, requireAttunement: false, requireIdentification: false, requireMagic: false
  };
  return item;
};
const effect = (id, name, itemKey, { statuses = [], changes = [], duration = { value: null, units: "seconds", expiry: null }, transfer = false } = {}) => ({
  _id: id, name, img: icon, type: "base", disabled: false, transfer, origin: uuid(itemKey),
  duration: { ...duration, expired: false }, system: { changes }, statuses, flags: { [MODULE_ID]: { key: itemKey } },
  description: "", tint: "#ffffff", sort: 0, start: null, showIcon: 1, folder: null
});
const grant = (key, level, keys) => ({ _id: stable(key), type: "ItemGrant", level, title: "Características de classe", value: {},
  configuration: { items: keys.map(k => ({ uuid: uuid(k), optional: false })), optional: false, spell: null } });
const scale = (key, identifier, type, values) => ({ _id: stable(key), type: "ScaleValue", title: identifier, value: {},
  configuration: { identifier, type, distance: { units: "" }, scale: Object.fromEntries(Object.entries(values).map(([level, value]) => [level,
    type === "dice" ? { number: 1, faces: value, modifiers: [] } : { value }])) } });

export function createDocuments() {
  const docs = [];
  const cls = base("pugilist", "Pugilist", "class", "Pugilist: progressão dos níveis 1 a 6. Dado de Fisticuffs 1d8 (1–4) ou 1d10 (5–6). Moxie 2 (2–3), 3 (4–5) ou 4 (6). Adicione Squared Circle no nível 3. Esta distribuição não concede características acima do nível 6. Consulte o README para limites de automação e conferência dos traços iniciais.");
  Object.assign(cls.system, {
    levels: 1, hd: { denomination: "d10", additional: "", spent: 0 }, primaryAbility: { value: ["str"], all: true }, properties: [],
    spellcasting: { progression: "none", ability: "" }, startingEquipment: [],
    advancement: [
      { _id: stable("hp"), type: "HitPoints", configuration: {}, value: {} },
      { _id: stable("saves"), type: "Trait", level: 1, title: "Salvaguardas", classRestriction: "primary", value: { chosen: [] },
        configuration: { mode: "default", allowReplacements: false, choices: [], grants: ["saves:str", "saves:con"] } },
      { _id: stable("proficiencies"), type: "Trait", level: 1, title: "Armas e armadura", value: { chosen: [] },
        configuration: { mode: "default", allowReplacements: false, choices: [], grants: ["weapon:sim", "armor:lgt"] } },
      grant("level-1", 1, ["fisticuffs", "ironChin", "unarmed"]),
      grant("level-2", 2, ["moxie", "braceUp", "oneTwoPunch", "stickAndMove", "bloodied", "swagger"]),
      grant("level-3", 3, ["heavyHitter"]), grant("level-4", 4, ["digDeep"]),
      grant("level-5", 5, ["extraAttack", "haymaker"]), grant("level-6", 6, ["fueledFists"]),
      scale("fisticuffs-scale", "fisticuffs", "dice", { 1: 8, 5: 10 }),
      scale("moxie-scale", "moxie", "number", { 1: 0, 2: 2, 4: 3, 6: 4 }),
      { _id: stable("subclass"), type: "Subclass", level: 3, title: "Squared Circle", configuration: {}, value: { document: null, uuid: null } },
      { _id: stable("asi"), type: "AbilityScoreImprovement", level: 4, title: "Aumento de Atributo / Talento", value: {},
        configuration: { points: 2, cap: 2, fixed: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }, locked: [], recommendation: null } }
    ]
  });
  docs.push(cls);
  const subclass = base("squaredCircle", "Squared Circle", "subclass", "Especialização em agarrões e controle corporal. Groundwork e Muscle Mass no nível 3; Meat Shield no nível 6. A subclasse contém apenas esta progressão.");
  Object.assign(subclass.system, { classIdentifier: "pugilist", spellcasting: { progression: "none", ability: "" }, advancement: [
    grant("squared-3", 3, ["groundwork", "compression", "inescapable", "stopAndDrop", "muscleMass"]),
    grant("squared-6", 6, ["meatShield"]),
    { _id: stable("muscle-trait"), type: "Trait", level: 3, title: "Muscle Mass — Acrobacia ou Atletismo", value: { chosen: [] },
      configuration: { mode: "upgrade", allowReplacements: false, grants: [], choices: [{ count: 1, pool: ["skills:acr", "skills:ath"] }] } }
  ] });
  docs.push(subclass);
  // This standalone fallback retains two native Enchant activities, like the
  // Plutonium source. The original actor item is never rewritten or replaced.
  const fists = feat("fisticuffs", "Fisticuffs — Punhos de Pugilist", 1,
    "Ataques desarmados e armas elegíveis usam o dado de Fisticuffs enquanto os requisitos de equipamento forem atendidos.");
  fists.system.description.value = `<div class="ddb">
    <h2>Fisticuffs</h2>
    <p>Você desenvolveu um estilo de luta baseado em golpes desarmados, armas simples corpo a corpo e armas improvisadas.</p>
    <h3>Ataque Desarmado Bônus</h3>
    <p>Enquanto estiver sem armadura ou usando armadura leve, sem escudo e empunhando apenas armas elegíveis, poderá realizar um ataque desarmado como ação bônus.</p>
    <h3>Dado de Fisticuffs</h3>
    <p>Nas mesmas condições, pode substituir o dado normal de dano do ataque desarmado ou de uma arma de Pugilist por 1d8 nos níveis 1–4 ou 1d10 nos níveis 5–6. O modificador de Força é aplicado normalmente.</p>
    <h3>Improvisação Aprimorada</h3>
    <p>Armas improvisadas contam como tendo a maestria <strong>Sap</strong> para você, desde que as condições acima sejam atendidas.</p>
    <p><em>As duas atividades abaixo aplicam encantamentos opcionais apenas a armas da categoria indicada. Não são ações de ataque; o ataque desarmado bônus é usado pela atividade da própria arma.</em></p>
  </div>`;
  for (const { effectId, activityId, label, category } of [
    { effectId: EFFECT_IDS.fistEnchant, activityId: ACTIVITY_IDS.fistEnchant,
      label: "Pugilist Weapon", category: "simpleM" },
    { effectId: EFFECT_IDS.improvEnchant, activityId: ACTIVITY_IDS.improvEnchant,
      label: "Improvised Pugilist Weapon", category: "improv" }
  ]) {
    const enchantment = effect(effectId, label, "fisticuffs", { changes: [
      { _id: stable(`${effectId}-enabled`), key: "system.damage.base.custom.enabled",
        type: "override", value: true, phase: "initial", priority: 20 },
      { _id: stable(`${effectId}-formula`), key: "system.damage.base.custom.formula",
        type: "override", value: "@scale.pugilist.fisticuffs + @mod", phase: "initial", priority: 20 }
    ] });
    enchantment.type = "enchantment";
    enchantment.system.magical = false;
    fists.effects.push(enchantment);
    const enchantActivity = activity(activityId, label, "enchant", "special", {
      effects: [{ _id: effectId }], enchant: { self: false },
      restrictions: { allowMagical: true, type: "weapon", categories: [category], properties: [] }
    });
    enchantActivity.visibility = { identifier: "pugilist", level: { min: 1, max: 6 },
      requireAttunement: false, requireIdentification: false, requireMagic: false };
    fists.system.activities[activityId] = enchantActivity;
  }
  docs.push(fists);
  const chin = feat("ironChin", "Iron Chin — Queixo de Ferro", 1, "Sem escudo e com armadura leve ou nenhuma, pode usar CA base 12 + modificador de Constituição. Bônus de CA legítimos continuam aplicáveis; fórmulas incompatíveis não se acumulam.");
  chin.effects.push(effect(EFFECT_IDS.ironChin, "Iron Chin", "ironChin", { transfer: true, changes: [
    { _id: stable("chin-change"), key: `flags.${MODULE_ID}.ironChin`, value: "true", type: "custom", phase: "initial", priority: null }
  ] }));
  docs.push(chin);
  const strike = base("unarmed", "Golpe Desarmado — Pugilist", "weapon", "Ataque desarmado de Força. Use a atividade Ação Bônus apenas quando satisfizer Fisticuffs. Agarrar e Empurrar substituem um ataque e usam CD de Força; Heavy Hitter permite um deles após acertar. O DAS mantém as relações de agarrão.");
  const strikeActivity = (id, name, activation) => activity(id, name, "attack", activation, {
    attack: { ability: "str", bonus: "", critical: { threshold: null }, flat: false, type: { value: "melee", classification: "unarmed" } },
    damage: { includeBase: true, critical: { bonus: "" }, parts: [] },
    range: { units: "ft", value: "5", override: true, special: "" },
    target: { affects: { count: "1", type: "creatureOrObject", choice: false, special: "" }, template: { type: "", units: "ft", contiguous: false }, override: false, prompt: false }
  });
  const grappleActivity = (id, name, effectId) => activity(id, name, "save", "action", {
    effects: [{ _id: effectId, onSave: false }],
    save: { ability: ["str", "dex"], dc: { calculation: "str", formula: "" } }, damage: { parts: [], onSave: "none" },
    range: { units: "ft", value: "5", override: true, special: "" },
    target: { affects: { count: "1", type: "creature", choice: false, special: "" }, template: { type: "", units: "ft", contiguous: false }, override: false, prompt: false }
  });
  Object.assign(strike.system, { uses: uses(), identified: true, quantity: 1, weight: { value: 0, units: "lb" },
    price: { value: 0, denomination: "gp" }, equipped: true, proficient: 1, type: { value: "natural", baseItem: "" },
    damage: { base: damagePart("1 + @mod"), versatile: { number: null, denomination: null, bonus: "", types: [], custom: { enabled: false, formula: "" }, scaling: { number: 1 } } },
    range: { value: null, long: null, reach: 5, units: "ft" }, properties: [], mastery: "", magicalBonus: null,
    activities: {
      [ACTIVITY_IDS.attack]: strikeActivity(ACTIVITY_IDS.attack, "Golpe Desarmado", "action"),
      [ACTIVITY_IDS.bonusAttack]: strikeActivity(ACTIVITY_IDS.bonusAttack, "Fisticuffs — Ação Bônus", "bonus"),
      [ACTIVITY_IDS.grapple]: grappleActivity(ACTIVITY_IDS.grapple, "Agarrar", EFFECT_IDS.grappled),
      [ACTIVITY_IDS.shove]: grappleActivity(ACTIVITY_IDS.shove, "Empurrar / Derrubar", EFFECT_IDS.prone)
    }
  });
  strike.effects.push(effect(EFFECT_IDS.grappled, "Agarrado", "unarmed", { statuses: ["grappled"] }), effect(EFFECT_IDS.prone, "Caído", "unarmed", { statuses: ["prone"] }));
  const pushed = effect(EFFECT_IDS.pushed, "Empurrar 1,5 m", "unarmed");
  // Same documented effect flag as DAS's own generated unarmed strike (adapter/basics.mjs).
  pushed.flags["dnd5e-combat"] = { push: { distance: 5, units: "ft" } };
  strike.effects.push(pushed);
  strike.system.activities[ACTIVITY_IDS.shove].effects.push({ _id: EFFECT_IDS.pushed, onSave: false });
  for (const action of Object.values(strike.system.activities)) action.visibility = {
    identifier: "pugilist", level: { min: 1, max: 6 }, requireAttunement: false, requireIdentification: false, requireMagic: false
  };
  docs.push(strike);
  docs.push(feat("moxie", "Moxie", 2, "Reserva de Moxie: 2 pontos nos níveis 2–3, 3 nos níveis 4–5 e 4 no nível 6. Recupera todos os pontos após descanso curto ou longo. As atividades consomem esta reserva por identificador estável.", { uses: uses("@scale.pugilist.moxie", "sr") }));
  docs.push(feat("braceUp", "Brace Up — Firmar o Corpo", 2, "Como ação bônus, gaste 1 Moxie e receba PV temporários iguais ao dado de Fisticuffs + nível de Pugilist + modificador de Constituição, por até 10 minutos. PV temporários não se somam.", { activities: {
    [ACTIVITY_IDS.braceUp]: activity(ACTIVITY_IDS.braceUp, "Brace Up", "heal", "bonus", {
      consumption: consumption([cost()]), duration: { units: "minute", value: "10", concentration: false, override: false },
      healing: damagePart("@scale.pugilist.fisticuffs + @classes.pugilist.levels + @abilities.con.mod", ["temphp"])
    })
  } }));
  docs.push(feat("oneTwoPunch", "One-Two Punch — Um-Dois", 2, "Como ação bônus, gaste 1 Moxie para realizar dois golpes desarmados. O DAS concede as duas oportunidades de ataque e administra a ação bônus.", { activities: {
    [ACTIVITY_IDS.oneTwoPunch]: activity(ACTIVITY_IDS.oneTwoPunch, "One-Two Punch", "utility", "bonus", { consumption: consumption([cost()]) })
  } }));
  docs.push(feat("stickAndMove", "Stick and Move — Bater e Mover", 2, "Como ação bônus, gaste 1 Moxie para realizar um golpe desarmado e escolher Disparada ou Desengajar. Use a escolha apresentada pelo DAS.", { activities: {
    [ACTIVITY_IDS.stickDash]: activity(ACTIVITY_IDS.stickDash, "Stick and Move", "utility", "bonus", { consumption: consumption([cost()]) })
  } }));
  docs.push(feat("bloodied", "Bloodied But Unbowed — Ferido, Não Vencido", 2, "Após sofrer dano, pode usar sua reação para recuperar toda a Moxie gasta. Se estiver Bloodied no momento da reação, também recebe PV temporários iguais a quatro vezes seu nível de Pugilist; estes expiram ao terminar um descanso curto. Uma utilização por descanso curto ou longo. Consulte o README: partes sem extensão pública segura permanecem sem automação.", { uses: uses("1", "sr"), activities: {
    [ACTIVITY_IDS.bloodied]: activity(ACTIVITY_IDS.bloodied, "Bloodied But Unbowed", "utility", "reaction", { consumption: consumption([cost("")]) })
  } }));
  docs.push(feat("swagger", "Swagger Streak — Marra", 2, "Após falhar em um teste confirmado de Força, Destreza, Constituição ou Carisma, pode gastar 1 Moxie e somar o dado de Fisticuffs. Se ainda falhar, o ponto é devolvido e não pode usar esta habilidade até terminar um descanso curto ou longo. Sem CD conhecida ou falha confirmada, nenhuma falha é presumida.", { uses: uses("1", "sr"), activities: {
    [ACTIVITY_IDS.swagger]: activity(ACTIVITY_IDS.swagger, "Swagger Streak", "utility", "special", { consumption: consumption([cost()]), roll: { formula: "@scale.pugilist.fisticuffs", name: "Swagger Streak", prompt: false, visible: false } })
  } }));
  docs.push(feat("heavyHitter", "Heavy Hitter — Peso Pesado", 3, "Após acertar um golpe desarmado, pode aplicar o dano e escolher Agarrar ou Empurrar contra o mesmo alvo. As salvaguardas e efeitos são resolvidos pelo DAS; não é um novo ataque."));
  docs.push(feat("groundwork", "Groundwork — Trabalho de Solo", 3, "Squared Circle: Compression Lock, Inescapable e Stop and Drop são descritos em suas características próprias. Aplicam-se apenas às relações de agarrão mantidas por este Pugilist."));
  docs.push(feat("compression", "Compression Lock — Chave de Compressão", 3, "No início do seu turno, se mantiver uma ou mais criaturas agarradas, o módulo oferece causar dano de concussão a cada uma, sem gastar ação. Cada criatura recebe uma rolagem própria do dado de Fisticuffs + modificador de Força.", { activities: {
    [ACTIVITY_IDS.compression]: activity(ACTIVITY_IDS.compression, "Compression Lock", "damage", "special", {
      damage: { critical: { allow: false, bonus: "" }, parts: [damagePart("@scale.pugilist.fisticuffs + @abilities.str.mod")] },
      target: { affects: { count: "", type: "creature", choice: false, special: "Apenas criaturas que você mantém agarradas" }, template: { type: "", units: "ft", contiguous: false }, override: false, prompt: false }
    })
  } }));
  docs.push(feat("inescapable", "Inescapable — Inescapável", 3, "Antes de uma salvaguarda ou teste contra seu Agarrar ou Empurrar, pode gastar 1 Moxie para impor Desvantagem àquela rolagem. O DAS oferece a decisão antes da rolagem pertinente.", { activities: {
    [ACTIVITY_IDS.inescapable]: activity(ACTIVITY_IDS.inescapable, "Inescapable", "utility", "special", { consumption: consumption([cost()]) })
  } }));
  docs.push(feat("stopAndDrop", "Stop and Drop — Parar e Derrubar", 3, "Ao acertar um golpe desarmado sem usar uma propriedade de maestria nesse ataque, pode usar Agarrar e Empurrar contra o mesmo alvo. O módulo lê a maestria registrada no cartão de ataque antes de oferecer os dois efeitos."));
  docs.push(feat("muscleMass", "Muscle Mass — Massa Muscular", 3, "Escolha Acrobacia ou Atletismo no avanço nativo da subclasse. Recebe proficiência na perícia escolhida se não a possuía, ou Expertise se já era proficiente. A escolha fica registrada no avanço Trait em modo upgrade; não é reaplicada na recarga."));
  const dig = feat("digDeep", "Dig Deep — Reservas Profundas", 4, "Como ação bônus, por 10 minutos recebe resistência a concussão, perfurante e cortante e ignora os efeitos de Exhaustion inferior a 6, mantendo os níveis registrados. Uma utilização por descanso longo. Se o uso estiver gasto, pode escolher receber voluntariamente um nível de Exhaustion para recuperá-lo.", { uses: uses("1", "lr"), activities: {
    [ACTIVITY_IDS.digDeep]: activity(ACTIVITY_IDS.digDeep, "Dig Deep", "utility", "bonus", { consumption: consumption([cost("")]), effects: [{ _id: EFFECT_IDS.digDeep }], duration: { units: "minute", value: "10", concentration: false, override: false } }),
    [ACTIVITY_IDS.digRecharge]: activity(ACTIVITY_IDS.digRecharge, "Receber 1 Exhaustion e recuperar Dig Deep", "utility", "special", { consumption: consumption([{ type: "attribute", target: "attributes.exhaustion", value: "-1", scaling: {} }, cost("", "-1")]) })
  } });
  dig.effects.push(effect(EFFECT_IDS.digDeep, "Dig Deep", "digDeep", {
    duration: { value: 600, units: "seconds", expiry: "turnStart" },
    changes: [
      ...["bludgeoning", "piercing", "slashing"].map(type => ({ _id: stable(`dig-${type}`), key: "system.traits.dr.value", value: type, type: "add", phase: "initial", priority: null })),
      { _id: stable("dig-ignore-exhaustion"), key: `flags.${MODULE_ID}.ignoreExhaustion`, value: "true", type: "custom", phase: "initial", priority: null }
    ]
  }));
  docs.push(dig);
  docs.push(feat("extraAttack", "Extra Attack — Ataque Extra", 5, "Ao executar a ação Atacar, dispõe de duas oportunidades de ataque. Não aumenta ataques de oportunidade, reações ou ataques feitos como ação bônus. O DAS reconhece o identificador nativo extra-attack."));
  docs.push(feat("haymaker", "Haymaker — Golpe Demolidor", 5, "Antes da rolagem de um golpe desarmado ou ataque com arma de Pugilist, o módulo oferece gastar 1 Moxie. Se acertar, o DAS recupera o ponto gasto e maximiza os dados de dano desse ataque. Se errar, o ponto permanece gasto. A atividade manual continua disponível como alternativa segura.", { activities: {
    [ACTIVITY_IDS.haymaker]: activity(ACTIVITY_IDS.haymaker, "Preparar Haymaker antes do ataque", "utility", "special", { consumption: consumption([cost()]) })
  } }));
  docs.push(feat("fueledFists", "Moxie-Fueled Fists — Punhos de Moxie", 6, "A cada ataque desarmado ou com arma improvisada, pode escolher o tipo de dano normal ou Force. A escolha é feita pelo DAS para aquela ocorrência e não altera permanentemente equipamentos."));
  docs.push(feat("meatShield", "Meat Shield — Escudo de Carne", 6, "Enquanto mantém uma criatura agarrada, recebe Meia Cobertura contra ataques de criaturas que não esteja agarrando. Quando uma delas errar, pode gastar reação e 1 Moxie para fazê-la repetir o mesmo ataque com nova rolagem contra uma criatura agarrada válida à sua escolha. O módulo valida vínculo, alcance, reação e Moxie antes do gasto.", { activities: {
    [ACTIVITY_IDS.meatShield]: activity(ACTIVITY_IDS.meatShield, "Redirecionar com Meat Shield", "utility", "reaction", { consumption: consumption([cost()]) })
  } }));
  return docs;
}

export const documents = createDocuments();
export default documents;
