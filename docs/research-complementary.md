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

`atTurnStart` não é um gatilho genérico para qualquer característica. O consumidor efetivo `ui/pointer.mjs:941–964` exige `concentrationOn(item)` antes de oferecer a atividade. Adicionar uma concentração fictícia modificaria a regra do Pugilist. `grappleDamage`, por outro lado, aplica o dano sem uma escolha, por isso também não reproduz a habilidade opcional. Nenhum dos dois deve ser apresentado como implementação fiel de Compression Lock.

## Swagger Streak

Foi identificado um possível mecanismo declarativo para a trava: uma segunda consumação `itemUses` do próprio item com valor `"0"` faz `usesLeftFor` considerar sua disponibilidade, sem gastar seu uso em um sucesso. O consumidor nativo aceita custo zero (`data/activity/fields/consumption-targets-field.mjs`, `_usesConsumption`); `failRefund` gastaria o uso próprio apenas quando o teste permanecesse falho. Isso resolve somente a trava.

O runtime do Core ainda permite oferecer `rollBonus` em testes sem CD conhecida, e só decide reembolso/bloqueio quando `needed` é finito. Assim, essa combinação isolada não garante a regra em todos os testes. Não foi habilitada como uma automação completa.
