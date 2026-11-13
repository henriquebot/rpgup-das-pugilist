# Documentos dnd5e 6.0.6

Fonte clonada apenas para leitura em `.research/dnd5e`, tag `release-6.0.6`, commit `87e94dbd9f930135e0694cd7e7d49f210603cd2c`. Nenhum arquivo do sistema foi alterado. O diretório de pesquisa não faz parte da distribuição.

## Contratos verificados

| Necessidade | Fonte na tag | Decisão |
|---|---|---|
| Classe, dados de vida, níveis | `module/data/item/class.mjs:51`; `packs/_source/classes24/monk/monk.yml:99` | Item `class`, `hd.denomination`, `levels`, avanços nativos. |
| Subclasse e vínculo de classe | `module/data/item/subclass.mjs:45` | `classIdentifier: pugilist`, avanços nos níveis 3 e 6. |
| Características concedidas por nível | `module/data/advancement/item-grant-data.mjs:29`; classe Monk | ItemGrant com UUIDs de compêndio e `optional:false`, sem hook que adicione itens. |
| ASI / talento | `module/data/advancement/ability-score-improvement-data.mjs`; classe Monk linha 271 | Avanço AbilityScoreImprovement no nível 4; o sistema apresenta seu fluxo nativo. |
| Dado e reserva escalonados | `module/data/advancement/scale-value-data.mjs`; classe Monk linha 357 | `@scale.pugilist.fisticuffs`, `@scale.pugilist.moxie`. |
| Muscle Mass | `module/documents/advancement/trait.mjs:96–123,155–181,203–226` | Trait `mode:upgrade`, uma escolha entre `skills:acr` e `skills:ath`, aplicada no avanço da subclasse. Zero vira 1; proficiência 1 vira Expertise 2. O valor escolhido é persistido pelo avanço. |
| Consumo entre itens | `module/data/activity/base-activity.mjs:645–651,951–968`; `module/data/activity/fields/consumption-targets-field.mjs:239` | O esquema público de consumo permite `itemUses` cujo target é um identificador. A preparação nativa resolve o identificador para o item do ator. Não chamamos `_remapConsumptionTarget` ou outro método interno. |
| Recuperação | `module/data/shared/uses-field.mjs`; `packs/_source/classes24/monk/class-features/monks-focus.yml:45` | Uses `spent`, `max`, `recovery:[{period:sr,type:recoverAll}]`; Dig Deep usa `lr`. |
| Golpe desarmado e Agarrar/Empurrar | `packs/_source/equipment24/weapons/unarmed-strike.yml:1–132` | Item `weapon`, `identifier:unarmed-strike`, atividades ataque `classification:unarmed` e duas atividades de salvaguarda com IDs estáveis próprios. CD de Força e escolha de STR/DEX do defensor. Efeitos Grappled/Prone sem transferência. |
| Empurrar ou derrubar | DAS Core `module/scripts/adapter/basics.mjs:38–46,132`; `module/scripts/content/choices.mjs:22` | Efeito adicional com flag efetiva `dnd5e-combat.push:{distance:5,units:ft}`, igual ao item desarmado gerado pelo Core. O contrato existente para `unarmed-strike` apresenta uma escolha de efeito; não é registrada uma nova regra global. |
| Atividades bônus | Monk's Focus e Unarmed Strike | `activation.type:bonus`; o DAS administra o orçamento. Não há UI própria. |
| PV temporários | `packs/_source/classes24/fighter/class-features/second-wind.yml:54–112` e dados Heal | Atividade `heal`, parte de cura `types:[temphp]`, fórmula original. Uma duração na atividade não garante por si a remoção dos PV temporários; a limitação é explicitada. |
| Efeitos V14 | `packs/_source/classes24/barbarian/class-features/rage.yml:124–186` | Alterações em `system.changes`, com `type:add`, `phase:initial` e IDs estáveis; duração `{value:600,units:seconds,expiry:turnStart}`. Não usar o antigo array `changes` de V13. |

As referências a rotinas internas acima são evidência de como o esquema público funciona. Nenhuma delas é importada, sobrescrita ou chamada pelo add-on.

## Identificadores e compêndio

`src/ids.mjs` centraliza IDs imutáveis de 16 caracteres para itens, atividades e efeitos. O pack é `rpgup-das-pugilist.pugilist`. Reconhecimento não depende de nomes nem do idioma do Babele. Duas características usam identificadores nativos por exigência do Core: `unarmed-strike` e `extra-attack`; o módulo não registra regras globais para esses identificadores. Os demais traços possuem prefixo `rpgup-pugilist-`. Classe `pugilist`, subclasse `squared-circle`.

O gerador em `src/documents.mjs` produz 22 documentos: uma classe, uma subclasse, uma arma desarmada e 19 características. ASI é um avanço nativo, não um item redundante. Groundwork é um item agregador e suas três opções possuem documentos próprios. As descrições são resumos originais das mecânicas fornecidas, sem transcrição do suplemento.

Não são importadas nem modificadas características de DDB Importer. O usuário não deve misturar cópias importadas e as concedidas pela classe sem revisar as duplicatas: dois itens de recurso com mesmo identificador tornam a seleção nativa de consumo ambígua. O diagnóstico do add-on deve informar esse caso em vez de escolher silenciosamente.

## Limites dos dados

O pedido descreve integralmente as características até o nível 6, mas não detalha a tabela completa de traços iniciais, equipamento inicial ou perícias de classe. O dado de vida d10 segue a edição 2024 conforme a pesquisa de contexto do projeto. Salvaguardas Força/Constituição e treinamento em armadura leve/armas simples são declarados; a escolha inicial de perícias, ferramentas e equipamento não é inventada. Esses traços de criação de personagem precisam ser conferidos com o suplemento licenciado antes de afirmar equivalência integral da classe. Os dados não incluem níveis acima de 6.

O item desarmado conserva a fórmula básica `1 + @mod` no dado persistido. Fisticuffs é aplicado apenas no contexto elegível pelo adaptador isolado do módulo. Assim, desativar o módulo não deixa gravada uma alteração no ataque de outro item. Iron Chin contém um efeito de transferência com uma chave própria customizada, interpretada somente pelo add-on.

Dig Deep concede resistência por efeito nativo temporário e mantém os níveis reais de Exhaustion. Sua atividade voluntária de recuperação usa os tipos nativos `attribute` (custo -1 em Exhaustion) e `itemUses` (custo -1 no próprio item); a elegibilidade é filtrada pelo adaptador. Um marcador customizado próprio em `system.changes` permite ao adaptador acrescentar imunidade derivada a Exhaustion enquanto o efeito estiver ativo e o nível real for inferior a 6; a alteração não é persistida no personagem e não altera o nível registrado.

Não foram executados modelos de documento dentro do Foundry. Testes Node inspecionam integridade, referências e formas públicas verificadas; não substituem validação dos DataModels e do fluxo real de avanços em um runtime licenciado V14.

## Auditoria adicional dos dados

- `module/data/activity/base-activity.mjs:55–106` define os campos comuns e `visibility.identifier` / `visibility.level.min,max`. As atividades próprias usam `identifier:pugilist`, mínimo igual ao nível de aquisição e máximo 6. Esse filtro nativo complementa as verificações de elegibilidade do adaptador; não substitui a proteção de execução.
- `module/data/activity/utility-data.mjs:21–29` define `roll` apenas em atividades Utility. O gerador não adiciona esse campo a Attack, Save, Heal ou Damage. `range.value` é uma fórmula de texto (`range-field.mjs:22`), portanto a distância explícita é armazenada como `"5"`, não como número.
- `module/documents/advancement/subclass.mjs:63–80` cria o documento selecionado e preenche `classIdentifier` com o identificador da classe. `module/applications/advancement/advancement-manager.mjs:98,263,423` usa o nível da classe para avanços de subclasse e inclui seus fluxos durante evolução. O documento Squared Circle contém ItemGrant e Trait no nível 3, e ItemGrant no nível 6, sem scripts que recriem características.
- `module/documents/advancement/item-grant.mjs:96–137` registra os itens concedidos em `value.added`; `automaticApplicationValue:147–154` admite aplicação automática quando não há opções. Nossos ItemGrant têm itens obrigatórios e `spell:null`, conforme a classe Monk distribuída. A seleção da subclasse e a escolha da perícia continuam sendo os fluxos nativos interativos.
- `module/data/abstract/active-effect-data-model.mjs:27–50` estende alterações com `_id`, `conditions` e `replacement`; os valores opcionais ausentes recebem defaults nativos. `module/documents/active-effect.mjs:335–339` resolve origem a partir de `system.origin` quando um efeito é aplicado. Não é gravado início de efeito na geração: `start:null` segue os documentos oficiais e permite que a aplicação nativa determine o começo real.
- `module/documents/activity/mixin.mjs:1214–1227` preserva uma duração explícita de efeito e obtém a duração da atividade quando necessário. Dig Deep contém os 600 segundos no próprio efeito; o modelo não depende de um relógio criado pelo gerador.
- `module/data/actor/templates/attributes.mjs:309–345` filtra fórmulas pelo equipamento e usa a maior CA base, depois adiciona escudo, bônus e cobertura. Iron Chin adiciona somente uma alternativa; suas restrições de armadura são verificadas pelo adaptador. A fórmula não acrescenta Destreza e não grava uma CA fixa no personagem.
- Dig Deep utiliza chave própria customizada `flags.rpgup-das-pugilist.ignoreExhaustion`, com fase inicial. `module/data/active-effect/condition.mjs:61,88–94` suprime os efeitos de uma condição quando há imunidade; `module/documents/actor/actor.mjs:147–155,612–622` e `module/data/actor/templates/attributes.mjs:534–555` respeitam imunidade para penalidades, propriedades e movimento. O nível real continua em seu efeito Condition: `condition.mjs:139–162` aumenta/cria níveis sem consultar imunidade e `attributes.mjs:451` lê esse nível para `attributes.exhaustion`. O adaptador consulta o nível do efeito real, não o mapa derivado `system.conditions`, e não oferece imunidade no nível 6. Assim, não remove níveis nem previne que sejam registrados novos níveis.

Este exame é uma auditoria estática do código público da versão fixada. Não comprova que a criação, o arraste de documentos e o avanço de nível foram executados dentro do Foundry.
