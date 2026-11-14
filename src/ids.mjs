/** Stable document identifiers. Never derive recognition from translated names. */
export const MODULE_ID = "rpgup-das-pugilist";
export const PACK_ID = `${MODULE_ID}.pugilist`;
export const IDS = Object.freeze({
  pugilist: "rpgupPugilist001", squaredCircle: "rpgupSquared0001",
  fisticuffs: "rpgupFisticuffs1", ironChin: "rpgupIronChin001", unarmed: "rpgupUnarmed0001",
  moxie: "rpgupMoxie000001", braceUp: "rpgupBraceUp0001", oneTwoPunch: "rpgupOneTwo00001",
  stickAndMove: "rpgupStickMove01", bloodied: "rpgupBloodied001", swagger: "rpgupSwagger0001",
  heavyHitter: "rpgupHeavyHit001", groundwork: "rpgupGroundwork1", compression: "rpgupCompress001",
  inescapable: "rpgupInescapabl1", stopAndDrop: "rpgupStopDrop001", muscleMass: "rpgupMuscle00001",
  asi: "rpgupASI00000001", digDeep: "rpgupDigDeep0001", extraAttack: "rpgupExtraAtk001",
  haymaker: "rpgupHaymaker001", fueledFists: "rpgupFueled00001", meatShield: "rpgupMeatShld001"
});
export const IDENTIFIERS = Object.freeze(Object.fromEntries(Object.keys(IDS).map(key => [key,
  key === "pugilist" ? "pugilist" : key === "squaredCircle" ? "squared-circle" : key === "unarmed" ? "unarmed-strike" : key === "extraAttack" ? "extra-attack" : `rpgup-pugilist-${key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`
])));
export const ACTIVITY_IDS = Object.freeze({
  fistEnchant: "rpgupFistEnch001", improvEnchant: "rpgupImprEnch001",
  attack: "rpgupAttack00001", bonusAttack: "rpgupBonusAtk001", grapple: "rpgupGrapple0001", shove: "rpgupShove000001",
  braceUp: "rpgupBraceAct001", oneTwoPunch: "rpgupOneTwoAct01", stickDash: "rpgupStickDash01", stickDisengage: "rpgupStickDis001",
  bloodied: "rpgupBloodAct001", swagger: "rpgupSwagAct0001", compression: "rpgupComprAct001",
  inescapable: "rpgupInescAct001", digDeep: "rpgupDigAct00001", digRecharge: "rpgupDigRec00001", haymaker: "rpgupHayAct00001", meatShield: "rpgupMeatAct0001"
});
export const EFFECT_IDS = Object.freeze({
  fistEnchant: "rpgupFistEffect1", improvEnchant: "rpgupImprEffect1",
  grappled: "rpgupGrappled001", prone: "rpgupProne000001", pushed: "rpgupPushed00001", disengage: "rpgupDisengag001", digDeep: "rpgupDigEffect01", ironChin: "rpgupChinEffect1"
});
export const uuid = key => `Compendium.${PACK_ID}.Item.${IDS[key]}`;
