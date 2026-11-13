import { MODULE_ID } from '../src/ids.mjs';
import { CONTENT, SOURCES } from './content.mjs';
import { applyIronChin, applyDigDeep, applyFisticuffsDamage, activityAllowed, actorDiagnostics } from './policy.mjs';
import { createRuntime } from './runtime.mjs';
import { applyImprovisedSap } from './improvised.mjs';

export function compatible(game) {
  return game?.system?.id === 'dnd5e' && game.system.version === '6.0.6'
    && game.version === '14.370' && game.modules?.get('dnd5e-combat')?.active === true
    && game.modules.get('dnd5e-combat').version === '0.282.1';
}

export function install(env) {
  const hooks = [];
  const runtime = createRuntime(env);
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
  on('dnd5e.preRollDamageV2', guarded(applyFisticuffsDamage));
  on('dnd5e.preUseActivity', guarded(activity => {
    if (!activityAllowed(activity)) {
      env.ui?.notifications?.warn('Pugilist: pré-requisito não atendido ou atividade sem automação segura nesta versão. Consulte o README.');
      return false;
    }
  }));
  on('dnd5e.postUseActivity', asyncGuarded(runtime.bloodied));
  on('dnd5e.preApplyDamage', guarded(runtime.trackTemporaryHp));
  on('preUpdateActor', guarded(runtime.manualTemporaryHp));
  on('updateWorldTime', asyncGuarded(runtime.expireAll));
  on('dnd5e.restCompleted', asyncGuarded(runtime.rest));
  on('dnd5e-combat.registerContent', register);
  on('ready', () => {
    const mod = env.game.modules.get(MODULE_ID);
    if (mod) mod.api = api;
    if (!enabled()) { if (env.game.user?.isGM) env.ui?.notifications?.warn(env.game.i18n.localize('RPGUPPUGILIST.Unsupported')); return; }
    if (!registration) register((...args) => env.game.modules.get('dnd5e-combat').api.content.register(...args));
    if (enabled()) runtime.expireAll().catch(report);
  });
  const api = Object.freeze({
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
    idle: runtime.idle
  });
  return api;
}

if (globalThis.Hooks && globalThis.game) install(globalThis);
