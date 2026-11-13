# Complementos públicos pesquisados

Referências: DAS Core `v0.282.1`, commit `e0f901f737bff528c08767b41910c4bb58d1a55e`; dnd5e `release-6.0.6`, commit `87e94dbd9f930135e0694cd7e7d49f210603cd2c`. Esta pesquisa e os testes associados usam arquivos locais dos clones de referência. Não operam a interface do Foundry nem acessam mundos de campanha.

## Sap em armas improvisadas

O hook documentado `dnd5e.preRollAttackV2` recebe a configuração da ocorrência. A atividade nativa normaliza suas opções de maestria antes desse hook (`module/documents/activity/attack.mjs:115–133`; emissão em `module/dice/basic-roll.mjs:98–100`). Portanto, preencher `config.mastery` nesse ponto evita alterar o documento da arma ou o conjunto global de maestrias.

A cadeia efetiva foi conferida: `AttackActivity._buildAttackConfig` copia `process.mastery` para `config.options.mastery` (`attack.mjs:252–276`); `rollAttack` grava essa opção no `system.mastery` da mensagem (`:171–178`). O Core lê esse campo em `adapter/mastery.mjs:25` e decide acerto, erro, marca Sap e expiração em `runtime/mastery.mjs`/`core/mastery.mjs`.

`scripts/improvised.mjs` limita esse complemento a uma atividade de ataque com classificação `weapon`, item de tipo `weapon`, subtipo `improv`, e Pugilist próprio que cumpre Fisticuffs. Ele preserva qualquer escolha explícita recebida, inclusive `false` ou string vazia. Nenhum efeito de Sap é aplicado diretamente pelo add-on.

`tests/improvised.test.mjs` verifica níveis 1–6; personagens sem a classe; armas, armaduras e escudo inelegíveis; classificação de magia/desarmado; nomes traduzidos; preservação de escolha e dados do item. Executa também o método de configuração exato extraído da versão de referência, com substitutos de serviços, e as funções reais de resolução/expiração de Sap do DAS. São testes de contratos/comportamento em Node, sem execução dentro do Foundry; a contagem atualizada pertence ao relatório final de `npm run check`.

Armas improvisadas não constam em `DND5E.weaponProficienciesMap` (`module/config.mjs:430–435`). A classe, portanto, não recebe sua proficiência simplesmente por conceder armas simples. `scripts/improvised.mjs` acrescenta o bônus somente quando `weapon.system.prof.hasProficiency` é falso, usando `config.rolls[0].parts/data`; o builder nativo preserva essas partes/dados ao juntar o cálculo normal (`attack.mjs:277–278`). Não altera `system.proficient` da arma nem acrescenta novamente um bônus já concedido.

O Core aumenta todo `flurry` pelo maior `flurryStrikes` do portador (`runtime/turn.mjs:617–621`). Isso também afetaria os ataques externos do Pugilist. Para evitar um benefício indevido em multiclasses, a guarda pré-uso consulta a API pública `api.content.inspect(actor)` (`adapter/content.mjs:257–262`) e recusa apenas a atividade própria cujo número de ataques seria aumentado, antes do consumo. Não modifica os itens de Monge ou o orçamento do DAS.

## Dig Deep e Exhaustion

O sistema consulta `traits.ci.value` para a redução dos testes (`Actor5e.conditionRollReductions`, `module/documents/actor/actor.mjs:147–156`), efeitos de condições (`hasConditionEffect`, `:612–633`) e redução de movimento (`module/data/actor/templates/attributes.mjs:551–560`). Uma mudança customizada do efeito próprio pode derivar a supressão dessas penalidades sem gravar zero no contador.

O nível deve ser lido do efeito de condição nativo, pois `prepareExhaustionLevel` deriva `attributes.exhaustion` de `effect.system.level` em uma etapa posterior. O nível 6 não pode receber essa supressão: `module/config.mjs:3685–3694` associa esse nível a `dead`. A imunidade derivada também suprime a atividade do efeito de condição (`data/active-effect/condition.mjs:56–58`), por isso não deve ser descrita como simplesmente apagar uma penalidade de rolagem. A documentação de implementação final deve informar como preserva o nível registrado e a transição 5→6.

## Compression Lock

`atTurnStart` não é um gatilho genérico para qualquer característica. O consumidor efetivo `ui/pointer.mjs:941–964` exige `concentrationOn(item)`; `grappleDamage` aplica dano sem escolha. O complemento usa o hook público `combatTurnChange`, no GM ativo, e aceita apenas pares exatos entre a marca `flags.dnd5e-combat.grappling` do agarrador e o efeito Grappled da vítima. Depois da confirmação, cria uma carta de uso por alvo no formato público observado em `adapter/areas.mjs:287–317`, deixando dano e aplicação com o DAS.

## Swagger Streak

Foi identificado um possível mecanismo declarativo para a trava: uma segunda consumação `itemUses` do próprio item com valor `"0"` faz `usesLeftFor` considerar sua disponibilidade, sem gastar seu uso em um sucesso. O consumidor nativo aceita custo zero (`data/activity/fields/consumption-targets-field.mjs`, `_usesConsumption`); `failRefund` gastaria o uso próprio apenas quando o teste permanecesse falho. Isso resolve somente a trava.

O runtime do Core permite oferecer `rollBonus` em testes sem CD conhecida e só decide reembolso/bloqueio quando `needed` é finito. Por isso a declaração não foi usada. O complemento observa os hooks pós-rolagem documentados em `Actor5e`, exige `roll.options.target` finito e falha real, usa a atividade nativa para pagar Moxie e, se o total continuar abaixo da CD, atualiza em uma única operação os dois itens: devolve Moxie e gasta o uso recuperável de Swagger.

## Heavy Hitter e Stop and Drop

`adapter/mastery.mjs:25` define a maestria realmente usada como `attackMessage.system.mastery`. `runtime/follow-ups.mjs` não possui filtro equivalente, portanto Heavy Hitter foi retirado da tabela declarativa. No passo público `dnd5e-combat.resolution` `done`, o complemento exige a atividade própria de Golpe Desarmado, um único alvo acertado e vivo e a característica própria. Ele cria cartas de Agarrar/Empurrar com alvo exato. A opção dupla aparece somente quando Stop and Drop existe e o campo de maestria está vazio.

## Meat Shield

O Core já publica `api.gap(a,b)`, que devolve a distância 3D em células, e `api.ui.budget(combatant)`, que expõe a reação disponível. O complemento converte alcance pelas unidades públicas do dnd5e, filtra e revalida as vítimas antes do gasto e usa a atividade de reação própria para consumir Moxie/orçamento. A repetição segue `runtime/reactions.mjs:298–312`: mesma atividade, `consume:false`, custo livre e alvo exato. A diferença é o filtro prévio de alcance. Como as APIs não oferecem transação conjunta para os dois documentos, uma queda depois do pagamento e antes da repetição permanece uma limitação documentada.

## Haymaker

`dnd5e.preUseActivity` é síncrono (`documents/activity/mixin.mjs:249–257`). O próprio DAS usa o padrão de cancelar, perguntar assincronamente e repetir o uso com um marcador. O handler do add-on é registrado em `ready`, depois das rotas de legalidade do Core, e só intercepta ataques próprios elegíveis. A atividade Haymaker arma a declaração nativa `maxDamage`; maximização, descarte no erro e reembolso no acerto continuam integralmente no DAS. Uma integração que ignore `activity.use` e chame `rollAttack` diretamente não emite esse hook, então permanece coberta pela atividade manual.
