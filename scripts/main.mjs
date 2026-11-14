import { MODULE_ID } from '../src/ids.mjs';
import { CONTENT, SOURCES } from './content.mjs';
import { applyIronChin, applyDigDeep, applyFisticuffsDamage, activityAllowed, actorDiagnostics } from './policy.mjs';
import { createRuntime } from './runtime.mjs';
import { createAutomation } from './automation.mjs';
import { applyImprovisedSap, applyImprovisedTraining } from './improvised.mjs';
import { migrateIronChin } from './iron-chin.mjs';
import { configureOneTwoPunch } from './one-two-punch.mjs';
import { configureStickAndMove, createStickAndMoveIntegration } from './stick-and-move.mjs';
import { configureBloodied, originalBloodiedAllowed, markBloodiedDamage } from './bloodied.mjs';
import { originalSwaggerAllowed } from './swagger.mjs';
import { createHeavyHitter } from './heavy-hitter.mjs';
import { configureGroundwork, originalGroundworkActivityAllowed } from './groundwork.mjs';
import { configureMuscleMass } from './muscle-mass.mjs';

export function compatible(game) {
  return game?.system?.id === 'dnd5e' && game.system.version === '6.0.6'
    && game.version === '14.370' && game.modules?.get('dnd5e-combat')?.active === true
    && game.modules.get('dnd5e-combat').version === '0.282.1';
}

export function install(env) {
  const hooks = [];
  const runtime = createRuntime(env);
  const automation = createAutomation(env);
  const heavyHitter = createHeavyHitter(env, { choose: automation.choose });
  const stickMove = createStickAndMoveIntegration(env);
  let stopped = false;
  let registration = null;
  let lastError = null;
  const enabled = () => !stopped && compatible(env.game) && env.game.modules?.get(MODULE_ID)?.active !== false;
  const report = error => { lastError = String(error?.message ?? error); env.console?.error(`${MODULE_ID} | ${lastError}`); };
  const on = (name, fn) => { const id = env.Hooks.on(name, fn); hooks.push([name, id]); };
  const guarded = fn => (...args) => { if (enabled()) return fn(...args); };
  const asyncGuarded = fn => guarded((...args) => { Promise.resolve(fn(...args)).catch(report); });
  const register = registrar => {
    if (!enabled()) return;
    try {
      registration = registrar(MODULE_ID, CONTENT, { sources: SOURCES });
      if (Object.keys(registration?.rejected ?? {}).length || registration?.rejectedSources?.length) {
        env.game.modules.get('dnd5e-combat')?.api?.content?.unregister(MODULE_ID);
        stopped = true;
        throw new Error('Conteúdo rejeitado pelo DAS; integração desativada.');
      }
    } catch (error) {
      env.game.modules.get('dnd5e-combat')?.api?.content?.unregister(MODULE_ID);
      stopped = true; report(error);
    }
  };
  // Installed during module evaluation, before the Core installs its init-time
  // roll router: base damage is chosen BEFORE Core maximizes Haymaker dice.
  on('applyActiveEffect', guarded(applyIronChin));
  on('applyActiveEffect', guarded(applyDigDeep));
  on('dnd5e.preRollAttackV2', guarded(applyImprovisedSap));
  on('dnd5e.preRollAttackV2', guarded(applyImprovisedTraining));
  on('dnd5e.preRollDamageV2', guarded(applyFisticuffsDamage));
  // Before DAS's init-time legality handler: mark exactly one attack's
  // occurrence as free, while keeping native targeting/roll resolution.
  on('dnd5e.preUseActivity', guarded(stickMove.preUse));
  on('dnd5e.postUseActivity', asyncGuarded(stickMove.postUse));
  on('dnd5e.preUseActivity', guarded((activity, usageConfig) => {
    const core = env.game.modules.get('dnd5e-combat')?.api?.content;
    const content = { inspect: actor => core?.inspect?.(actor), bloodiedCheck: originalBloodiedAllowed };
    if (originalGroundworkActivityAllowed(activity) === false || originalSwaggerAllowed(activity, usageConfig) === false || !activityAllowed(activity, content, usageConfig)) {
      env.ui?.notifications?.warn('Pugilist: pré-requisito não atendido ou atividade sem automação segura nesta versão. Consulte o README.');
      return false;
    }
  }));
  on('dnd5e.postUseActivity', asyncGuarded(runtime.bloodied));
  on('dnd5e.preApplyDamage', guarded((actor, amount, updates) => markBloodiedDamage(actor, amount, updates)));
  on('dnd5e.preApplyDamage', guarded(runtime.trackTemporaryHp));
  on('preUpdateActor', guarded(runtime.manualTemporaryHp));
  on('updateWorldTime', asyncGuarded(runtime.expireAll));
  on('dnd5e.restCompleted', asyncGuarded(runtime.rest));
  for (const hook of ['dnd5e.rollAbilityCheck', 'dnd5e.rollSkill', 'dnd5e.rollToolCheck']) on(hook, asyncGuarded(automation.swagger));
  on('combatTurnChange', guarded(automation.compression));
  on('dnd5e-combat.resolution', guarded(automation.resolution));
  on('dnd5e-combat.resolution', asyncGuarded(heavyHitter.resolution));
  on('dnd5e-combat.registerContent', register);
  let lateHooks = false;
  on('ready', () => {
    const mod = env.game.modules.get(MODULE_ID);
    if (mod) mod.api = api;
    if (!enabled()) { if (env.game.user?.isGM) env.ui?.notifications?.warn(env.game.i18n.localize('RPGUPPUGILIST.Unsupported')); return; }
    if (!registration) register((...args) => env.game.modules.get('dnd5e-combat').api.content.register(...args));
    automation.registerQuery();
    // Register after the DAS legality routes. An illegal/out-of-range attack is
    // rejected by Core before Haymaker can spend Moxie.
    if (!lateHooks) { lateHooks = true; on('dnd5e.preUseActivity', guarded(automation.haymaker)); }
    if (enabled()) runtime.expireAll().catch(report);
  });
  const api = Object.freeze({
    muscleMass(actor, options = {}) {
      if (!env.game.user?.isGM) throw new Error('Somente o Mestre pode configurar Muscle Mass.');
      if (!enabled()) throw new Error('RPGUp DAS Pugilist não está ativo ou é incompatível.');
      return configureMuscleMass(actor, { ...options, isGM: true });
    },
    groundwork(actor, options = {}) {
      if (!env.game.user?.isGM) throw new Error('Somente o Mestre pode configurar Groundwork.');
      if (!enabled()) throw new Error('RPGUp DAS Pugilist não está ativo ou é incompatível.');
      return configureGroundwork(actor, { ...options, isGM: true });
    },
    bloodied(actor, options = {}) {
      if (!env.game.user?.isGM) throw new Error('Somente o Mestre pode corrigir Bloodied But Unbowed.');
      if (!enabled()) throw new Error('RPGUp DAS Pugilist não está ativo ou é incompatível.');
      return configureBloodied(actor, { ...options, isGM: true });
    },
    stickAndMove(actor, options = {}) {
      if (!env.game.user?.isGM) throw new Error('Somente o Mestre pode configurar Stick and Move.');
      if (!enabled()) throw new Error('RPGUp DAS Pugilist não está ativo ou é incompatível.');
      return configureStickAndMove(actor, { ...options, isGM: true });
    },
    // Optional, reversible item-level DAS rule. Does not touch activities.
    oneTwoPunch(actor, options = {}) {
      if (!env.game.user?.isGM) throw new Error('Somente o Mestre pode configurar One-Two Punch.');
      if (!enabled()) throw new Error('RPGUp DAS Pugilist não está ativo ou é incompatível.');
      return configureOneTwoPunch(actor, { ...options, isGM: true });
    },
    // Opt-in migration only. No actor data is changed on world load.
    ironChin(actor, options = {}) {
      if (!env.game.user?.isGM) throw new Error('Somente o Mestre pode corrigir Iron Chin.');
      if (!enabled()) throw new Error('RPGUp DAS Pugilist não está ativo ou é incompatível.');
      return migrateIronChin(actor, { ...options, isGM: true });
    },
    diagnostics(actor) {
      if (!env.game.user?.isGM) throw new Error('Diagnóstico disponível somente ao Mestre.');
      return { enabled: enabled(), versions: { foundry: env.game.version, dnd5e: env.game.system.version, core: env.game.modules.get('dnd5e-combat')?.version },
        registration, lastError, ...(actor ? { actor: actorDiagnostics(actor) } : {}) };
    },
    shutdown() {
      stopped = true;
      for (const [name, id] of hooks) env.Hooks.off(name, id);
      env.game.modules.get('dnd5e-combat')?.api?.content?.unregister(MODULE_ID);
    },
    idle: () => Promise.all([runtime.idle(), automation.idle()])
  });
  return api;
}

if (globalThis.Hooks && globalThis.game) install(globalThis);
