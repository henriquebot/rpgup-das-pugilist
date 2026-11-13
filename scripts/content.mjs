/**
 * Public DAS Core 0.282.1 content schema. Every key below is validated against
 * core/content.mjs at e0f901f737bff528c08767b41910c4bb58d1a55e.
 * Do not register a generic unarmed-strike or extra-attack entry: those items
 * use system identifiers, but our changes must never overlay another class.
 */
import { IDS, IDENTIFIERS as I, ACTIVITY_IDS as A } from "../src/ids.mjs";

export const CONTENT = Object.freeze({
  [I.oneTwoPunch]: {
    flurry: { activity: A.oneTwoPunch, strikes: 2 }
  },
  [I.stickAndMove]: {
    flurry: { activity: A.stickDash, strikes: 1 },
    basicActions: { [A.stickDash]: { choose: ["dash", "disengage"] } }
  },
  [I.bloodied]: {
    triggers: [{ on: "isDamaged", do: [{ type: "use", activity: A.bloodied, target: "self" }] }]
  },
  [I.heavyHitter]: {
    hitFollowUp: {
      use: [{ item: I.unarmed, activity: A.grapple }, { item: I.unarmed, activity: A.shove }],
      choose: 1,
      weapons: ["unarmed"]
    }
  },
  [I.inescapable]: {
    inescapable: { activity: A.inescapable }
  },
  [I.haymaker]: {
    maxDamage: { activity: A.haymaker, weapons: ["unarmed", "simpleM", "improv"], refundOnHit: true }
  },
  [I.fueledFists]: {
    weaponDamageTypes: { weapons: ["unarmed", "improv"], types: ["force"] }
  },
  [I.meatShield]: {
    grappleCover: "half"
  }
});

/** Only map our own compendium source IDs; never map imported items by name. */
export const SOURCES = Object.freeze(Object.fromEntries(Object.keys(CONTENT).map(identifier => {
  const key = Object.keys(I).find(k => I[k] === identifier);
  return [IDS[key], identifier];
})));

/**
 * Deliberately absent: martialArts switches attacks to Dexterity; grappleDamage
 * damages automatically without consent; unconditional choose:2 ignores mastery;
 * rollBonus.failRefund cannot reliably gate a locked feature with external uses;
 * redirect does not filter replacement targets by range before paying. See audit.
 */
