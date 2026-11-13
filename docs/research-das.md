# Pesquisa do contrato do DAS Core

Referência efetivamente inspecionada: `Darshyne/dnd5e-combat`, tag **v0.282.1**, commit **e0f901f737bff528c08767b41910c4bb58d1a55e**. O manifesto da branch principal também dizia 0.282.1, mas seu commit era diferente; a pesquisa foi revalidada após checkout da tag. Os caminhos abaixo são relativos ao repositório oficial; o clone de pesquisa fica fora da distribuição e não recebe alterações.

## Registro público e isolamento

`module/scripts/runtime/content.mjs:34–83` define `dnd5e-combat.registerContent`, emitido em `setup`. O add-on instala seu ouvinte na carga do módulo, antes de `setup`, e chama `register(moduleId, table, {sources})`. Alternativamente, a mesma função é publicada como `api.content.register`; `api.content.unregister` remove a tabela **e** o mapa de fontes (`:102–125`, `content/index.mjs:135–181`). Registrar outra vez a mesma fonte substitui sua tabela. Não é necessário DAS Homebrew nem importar um arquivo JSON.

A API valida cada entrada com o validador oficial. Entradas rejeitadas não são aplicadas; o retorno contém `accepted`, `rejected`, `sources` e `rejectedSources`. É necessário conferir esse retorno e expor diagnóstico, pois o registro não lança exceção para toda entrada inválida.

`api.content.identifierOf` e o mapa `sources` reconhecem documentos por identificador e fonte original, independentemente de tradução. `sources` só mapeia os IDs dos compêndios deste módulo. Nunca se registra uma entrada genérica para `unarmed-strike`, `extra-attack`, `monks-focus`, nem qualquer identificador de outra classe. Os documentos próprios de Unarmed Strike e Extra Attack usam os identificadores nativos necessários ao sistema, com flags de propriedade do add-on; isso não equivale a modificar as regras globais desses identificadores.

O Core combina tabelas externas sobre o conteúdo embarcado (`mergeEntries`). Portanto, reutilizar identificadores genéricos na tabela seria uma alteração global e foi rejeitado. Os oito registros de `scripts/content.mjs` pertencem apenas ao namespace `rpgup-pugilist-*`.

## Esquema e receitas

O contrato completo está documentado em `module/scripts/core/content.mjs`, com validação distribuída em `core/content/entry.mjs`, `extras.mjs`, `steps.mjs` e listas fechadas em `enums.mjs`. O esquema não aceita nomes inventados de eventos ou etapas.

`api.content.recipes` publica `version`, `list`, `facts`, `factOptions`, `fieldKinds`, `publicKeys`, `build` e `condition` (`runtime/content.mjs:126–137`). `core/recipes.mjs:452` produz `{entry, errors, issues}`; **a entrada construída ainda precisa passar no validador**. As receitas são uma camada de autoria, não novos gatilhos nem um motor paralelo. As regras curtas deste add-on são escritas diretamente no mesmo esquema para manter IDs de atividades explícitos.

`core/triggers.mjs:30–105` enumera os momentos reais, incluindo `isDamaged`, `isMissed`, `preAttackRoll`, `preDamageRoll`, `hit`, `failedSave`, `startOfTurn` e `endOfTurn`. Os hooks desses momentos são anunciados aos consumidores passivos por `runtime/triggers.mjs:42–72`; ouvir um hook anunciado não permite assumir que ele é uma janela assíncrona ou uma API de mutação do fluxo.

## Reuso das classes oficiais

* Monge: `content/monk.mjs` declara `flurry`, `basicActions`, `rollBonus`, salvaguardas e efeitos por IDs de atividade. `runtime/turn.mjs` mantém os ataques gratuitos no orçamento do DAS e o direcionamento passa pela interface já existente. **Não usar `martialArts: true`**: `runtime/monk.mjs:60–98` também passa ataques e dano para Destreza quando ela é melhor. Isso não corresponde a Fisticuffs.
* Guerreiro: `content/fighter.mjs` usa cura e usos nativos para Second Wind, `rollBonus.failRefund` para Tactical Mind, `hitRider` para manobras e `grantsAction` para Action Surge. A existência dessas regras não autoriza copiar IDs premium que não estejam nos documentos do add-on.
* Bárbaro: `content/barbarian.mjs` deixa resistências e bônus de dano nos efeitos e entrega ao Core duração, upkeep e escolhas. Uma habilidade parecida com Rage não deve ser declarada como `rage`, pois isso também habilita suas restrições e interações específicas.

## Janelas, jogador conectado e custos

`adapter/choices.mjs:34–85` encaminha decisões ao jogador conectado proprietário do ator usando a infraestrutura de queries do Foundry e, em falha de resposta, consulta o GM. Diálogos de combate têm prazo e alternativa padrão; as regras opcionais devem colocar a recusa primeiro. Os prompts de Heavy Hitter e Inescapable já fazem isso. O código de perguntas do Core é uma implementação interna; não se importa `askChoice` diretamente no add-on.

As reações usam `adapter/reactions.mjs:62–105` para disponibilidade e `:116–145` para recursos. `runtime/reactions.mjs:258–289` abre `isDamaged` após aplicação de dano. Uma declaração `use` chama a atividade nativa e respeita o orçamento de reação. O complemento de Bloodied But Unbowed só resolve as mudanças específicas após uma utilização bem-sucedida; o add-on não abre outra janela de reação.

`core/turn.mjs` mantém ação, bônus, reação e ataques concedidos por ação. A própria política do DAS é de aviso com confirmação de exceção pelo jogador; o add-on não muda essa política. `adapter/turn.mjs`, função `attacksPerAction`, reconhece **`extra-attack`**; um identificador inventado para a habilidade não concederia a segunda oportunidade de ataque.

Os custos de Moxie são `itemUses` em atividades dnd5e. A progressão usa `uses.max` e recuperação nativa curta/longa. O remapeamento nativo por `system.identifier` evita depender de um ID de item recém-importado. Nenhum custo deve ser deduzido de novo por um complemento se a atividade já o pagou.

A disponibilidade e o pagamento ficam com o Core e com a atividade nativa. Essa delegação não prova exclusão mútua entre vários clientes: por exemplo, `inescapableFor` calcula seu custo antes de esperar a query e registra apenas um aviso se a atualização falhar. O add-on não altera esse fluxo oficial. Os testes locais confirmam recusa sem gasto e aceitação com gasto em uma execução; concorrência distribuída e transações de documentos continuam sem certificação no Foundry.

## Matriz de implementação e limites do contrato

| Habilidade | Mecanismo comprovado | Cuidado / limite identificado |
|---|---|---|
| Fisticuffs | Ataque nativo com atividade bônus, escala própria e Sap por configuração da ocorrência | Complementos verificam equipamento e classe própria. Sap usa `dnd5e.preRollAttackV2`, sem alterar a arma. `martialArts` é omitido para evitar troca para Destreza. |
| Iron Chin | Preparação derivada da CA, fórmula 12 + Con | `effectWhile` não expressa precisamente armadura leve ou nenhuma **e** sem escudo; não usar efeito global incondicional. |
| Moxie | Usos/recuperação/escala dnd5e | Atividades separadas apontam para a reserva por identificador; não repetir desconto. |
| Brace Up | Atividade nativa de cura temporária, escala e duração | Expiração dos PV temporários precisa rastrear sua origem; não apagar PV temporários posteriores de outra fonte. |
| One-Two Punch | `flurry: {activity, strikes: 2}` | Orçamento, alvos e ataques gratuitos pertencem ao DAS; não criar dois ataques automáticos adicionais. |
| Stick and Move | `flurry` com uma oportunidade e `basicActions: {activity: {choose:["dash","disengage"]}}` | Uma atividade de ativação com uma escolha; não gastar bônus novamente. |
| Bloodied But Unbowed | Gatilho `isDamaged` com `use` da atividade de reação | Restauração e PV temporários são complemento após uso confirmado. Limite curto/longo e expiração especial devem permanecer nos dados. |
| Swagger Streak | Documento incluído; sem automação de utilização | `rollBonus` possui partes compatíveis, mas a regra completa exige falha confirmada, reembolso e trava também com CD desconhecida. Não há registro automático e a atividade fica bloqueada para não gastar Moxie incorretamente. |
| Heavy Hitter | `hitFollowUp`, unarmed, `choose:1`, Grapple/Shove pelos IDs próprios | União das atividades e um prompt pelo Core; não substituir o ataque/dano original. |
| Compression Lock | Documento incluído; sem automação de utilização | `grappleDamage` causa dano obrigatório, sem pergunta. `atTurnStart` exige concentração ativa em `ui/pointer.mjs:956–958`. Nenhuma das alternativas reproduz a regra; a atividade fica bloqueada. |
| Inescapable | `inescapable: {activity}` | `adapter/grapple-rules.mjs:54–77` pergunta antes de debitar. Alvos válidos: `adapter/saves.mjs` e escape em `runtime/grapple.mjs`. Herdado: custo calculado antes de `await` e falha de atualização apenas logada; concorrência multiusuário ainda precisa teste real. |
| Stop and Drop | Documento incluído; não automatizado | `hitFollowUp.choose:2` não verifica uso de maestria no ataque (`runtime/follow-ups.mjs:26–43`). O add-on mantém somente a escolha única de Heavy Hitter. |
| Muscle Mass | Avanço nativo de perícia | Especialização quando já proficiente exige escolha persistente e idempotente; não incrementar todo prepare/refresh. |
| ASI | Avanço nativo AbilityScoreImprovement | Usar o sistema de avanço, sem edição permanente de atributos por hook. |
| Dig Deep | Resistências/duração/uso nativos e mudança customizada do efeito próprio | `applyDigDeep` acrescenta imunidade derivada a Exhaustion somente nos níveis 1–5, sem persistir essa imunidade nem alterar o contador. O nível vem do efeito nativo e o nível 6 preserva seu resultado normal. |
| Extra Attack | Item próprio com `system.identifier = extra-attack` | `attacksPerAction` do Core limita a multiplicação à ação Attack, sem aumentar ataques de reação/bônus. |
| Haymaker | Pré-ativação funcional: `maxDamage`, tipos de arma, `refundOnHit:true` | A atividade deve ser usada antes do ataque elegível. O Core maximiza os dados/reembolsa no acerto e perde a promessa no erro; falta a oferta automática antes de cada ataque. |
| Moxie-Fueled Fists | `weaponDamageTypes` com `weapons:["unarmed","improv"]`, `types:["force"]` | `adapter/messages.mjs:207–254` mistura o tipo normal com Force por ocorrência sem editar equipamento. |
| Meat Shield | Parcial: cobertura condicional por `grappleCover:"half"` | Redirecionamento não habilitado: `redirect` refaz a mesma atividade (`runtime/reactions.mjs:298–312`), mas não filtra previamente alcance dos substitutos. A atividade de reação fica bloqueada. |

## Agarrões, cobertura, maestria e dano

`adapter/grapple.mjs:17–46` resolve o agarrador por `effect.system.origin.activity`, com fallback para UUID de origem; um estado Grappled colocado à mão não possui dono comprovado. A origem inclui atividade e ator, inclusive atores sintéticos. `grappleSceneOf`, `grappleFacts` e marcas mantêm o contexto da cena; o add-on não deve concluir que qualquer criatura Grappled é sua vítima.

O Core usa essas relações em cobertura e em Grapple/Shove. `adapter/grapple-rules.mjs` agrega regras do portador; `grappleCover` é contra criaturas que ele não agarra. Cobertura não é um bônus permanente de CA.

Para Shove, o Core já registra `unarmed-strike` com `choice.effects:"one"` (`content/choices.mjs:22`). A atividade própria pode carregar os dois perfis, prone e pushed. O perfil de empurrão segue exatamente o dado oficial de `adapter/basics.mjs:42–46`: `flags["dnd5e-combat"].push = {distance:5, units:"ft"}`. `adapter/apply-effects.mjs:97` lê esse perfil por `pushOf` e realiza o deslocamento, sem criar uma condição fictícia. Não há sobreposição global de conteúdo no add-on.

Sap das armas improvisadas usa somente a configuração pública da rolagem. Em dnd5e 6.0.6, o hook `dnd5e.preRollAttackV2` ocorre após a normalização das opções da arma. `config.mastery` chega às opções do dado e ao campo `message.system.mastery`; o DAS resolve a marca, o Desvantagem e a expiração. `scripts/improvised.mjs` exige arma `improv`, classificação `weapon` e Fisticuffs elegível, e preserva uma escolha explícita já recebida. Não importa métodos internos nem aplica a marca diretamente.

`core/max-dice.mjs` maximiza partes de fórmula sem transformar os modificadores em dados. `runtime/maneuver-dice.mjs:120–147` aplica a maximização ao dano escolhido pelo próprio Core, incluindo partes dos críticos; promessa e reembolso são do Core. Não se deve escrever uma segunda rotina de dano, reembolsar o recurso novamente nem recalcular o acerto.

## Dig Deep sem apagar Exhaustion

A mudança customizada do próprio efeito de Dig Deep é consumida no hook público `applyActiveEffect`, na fase inicial. O complemento verifica o item da classe, lê o efeito nativo de condição e acrescenta `exhaustion` ao conjunto **derivado** de imunidades somente quando seu nível real está entre 1 e 5.

O contrato foi conferido em dnd5e 6.0.6: `Actor5e.conditionRollReductions` exclui condições imunes (`module/documents/actor/actor.mjs:147–156`), `hasConditionEffect` faz a mesma exclusão (`:612–633`), e a redução de movimento consulta `traits.ci.value` (`module/data/actor/templates/attributes.mjs:551–560`). O contador permanece no efeito de condição: `prepareExhaustionLevel` lê seu `system.level`, independentemente de a condição estar suprimida. O complemento lê essa fonte diretamente para não depender de um valor derivado ainda em preparação. Não há atualização persistente do contador ou das imunidades.

Ao chegar ao nível 6, o complemento não acrescenta a imunidade; o sistema conserva `conditions[6] = ["dead"]`. A retirada, desativação ou expiração do efeito de Dig Deep deixa as penalidades voltarem pelo preparo nativo dos dados. Os testes são contratos e preparação em Node; o resultado não foi certificado dentro do Foundry. Detalhes da pesquisa estão em [research-complementary.md](research-complementary.md).

## Testes efetivamente executáveis sem Foundry

`tests/contract.test.mjs` importa o **validador e os módulos puros reais**, sem cópia e sem alteração, do clone fixado. Cobre validação da tabela/mapas, ausência de sobreposição de classes, registro repetido e remoção limpa no registro real, IDs de follow-up, ações básicas/flurry, orçamento real de Attack versus bônus/reação, maximização de dados com modificadores/críticos, recusa de declarações inseguras e rejeição de esquema fictício. Esses testes não são integração de combate dentro do Foundry.

`tests/das-runtime.test.mjs` executa também as funções e hooks **reais** do runtime upstream, com substitutos mínimos de documentos, queries e geometria: Heavy Hitter e combinações sem duplicação; agarrões com zero/uma/várias vítimas e separação de cenas/origem; recusa/aceitação/falta de Moxie de Inescapable; disponibilidade da reação Bloodied; cobertura Meat Shield contra vários atacantes e agarrados, incluindo retirada do registro; Haymaker armado pela atividade, arma inelegível, dados críticos/adicionais, reembolso único, erro e expiração por mudança de turno. Os substitutos não executam banco de documentos, DiceRoll, canvas ou clientes conectados; este resultado é integração de código em Node e não Foundry ponta a ponta.

`tests/improvised.test.mjs` verifica o complemento Sap e a passagem da configuração pelo builder nativo da versão pesquisada, além da resolução/expiração pelas funções reais de maestria do Core. A contagem e o resultado atualizados da suíte completa devem vir da execução final de `npm run check` e de seu relatório de validação; não se mantém uma contagem parcial fixa neste documento de arquitetura.

Os testes oficiais relevantes lidos incluem `content.test.mjs` (inclusive registro, substituição e remoção de tabelas/fontes), `hit-follow-up.test.mjs`, `grapple-rules.test.mjs`, `max-dice.test.mjs`, `turn.test.mjs` e `roll-bonus-paid.test.mjs`. A suíte do add-on nunca deve declarar uma habilidade ponta a ponta apenas por passar na validação. Os prompts remotos, concorrência, cenas, aplicação dos documentos e o fluxo de combate precisam de Foundry descartável; não há autorização para operar o aplicativo ou mundos pessoais do usuário.

## Fonte primária

Código da versão pesquisada: [DAS Core v0.282.1](https://github.com/Darshyne/dnd5e-combat/tree/e0f901f737bff528c08767b41910c4bb58d1a55e). Os comentários do esquema não são substitutos da leitura da implementação; os limites acima foram encontrados justamente comparando ambos.
