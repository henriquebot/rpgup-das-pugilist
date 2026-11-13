# Pesquisa do ecossistema DAS

Referências públicas clonadas em `.research/`, somente para leitura. Nenhum arquivo de instalação ou mundo foi consultado. Estado conferido em 13/11/2026:

| Componente | Tag | Commit |
|---|---|---|
| DAS Homebrew | `v0.3.2` | `079f2a59e761b2a33c7086fc11824ee9500c8449` |
| DAS Combat UI | `v0.34.0` | `33dee5c31518d2d854b68bb63fa7afb84932d4c1` |
| DAS Animations | `v0.15.0` | `205a513fde5cf02ce452c04eb74cc580b3b7480c` |

Os checkouts estão destacados nas tags exatas. Homebrew e UI tinham HEADs mais recentes com árvores idênticas às tags; a referência adotada é a tag dereferenciada acima. Os manifestos declaram Foundry `14.370` verificado. As referências abaixo são caminhos nos respectivos repositórios; a documentação de APIs não substitui testes de comportamento dentro do Foundry.

Fontes primárias e licenças MIT: [Homebrew v0.3.2](https://github.com/Darshyne/darsh-homebrew/tree/079f2a59e761b2a33c7086fc11824ee9500c8449), [Combat UI v0.34.0](https://github.com/Darshyne/darsh-dnd-ui/tree/33dee5c31518d2d854b68bb63fa7afb84932d4c1), [Animations v0.15.0](https://github.com/Darshyne/darsh-animations/tree/205a513fde5cf02ce452c04eb74cc580b3b7480c). Os testes locais importam funções dos clones de referência em desenvolvimento; esses clones não são distribuídos no add-on. Não houve cópia de macros ou assets proprietários.

## Homebrew: referência, sem dependência obrigatória

O formato publicado em `module/scripts/core/packs.mjs:1–16` é `{format:"das-pack",formatVersion:1,id,title,version,authors,license,contentVersion,requires,sources,rules,items?}`. `sources` mapeia IDs de documentos com 16 caracteres para identificadores; `rules` mapeia identificadores para entradas do Core. `readPack` (`:126`) delega os validadores de regras e fontes ao Core, registra erros por identificador e separa avisos de campos desconhecidos. Homebrew **não define um segundo esquema de regras**.

`registrationPlan` (`:274`) filtra versão de conteúdo, versão do Core, dependências e estado habilitado. A ordenação é estável. `conflicts` (`:287`) reporta identificadores reivindicados por várias origens. `runtime/registry.mjs:35–49` registra cada pack sob `pack:<id>`, depois as criações do usuário; recargas de configuração removem e registram suas próprias fontes. O hook do Core é ouvido durante `init` e emitido pelo Core em `setup`.

Decisão: o add-on registra sua própria tabela diretamente pelo contrato público do Core. Não escreve nas configurações do Homebrew, não exige importação de JSON e não depende de `pugilist-das-pack.json`. Os identificadores e IDs de seus documentos devem permanecer próprios; conteúdo DDB não deve ser migrado por reconhecimento de nome.

Exemplos/testes examinados: `tests/packs.test.mjs` (migrações, entradas inválidas, dependências, conflitos, ordenação, exportação); `tests/creations.test.mjs` (receitas compiladas); `tests/core-contract.test.mjs` (API/hook comparados a `docs/reference/surface.json` do Core).

## Combat UI: o Core decide, a UI apresenta

`darsh-dnd-ui.mjs:1–8` declara a separação: a UI lê o estado e chama `activity.use()`, sem decidir regras. A API exportada em `:47` expõe estado, retratos, barra, grupo, iniciativa, prévia, rotas e temas. Não existe nessa versão uma API pública genérica para um terceiro abrir a janela de reação ou inserir uma escolha arbitrária.

O exemplo público relevante é `adapter/engine.mjs:250–256`: `dnd5e-combat.groupRollPrompt` recebe um objeto que a UI pode atender atribuindo a promessa a `prompt.result`. `runtime/roll-window.mjs` só assume a solicitação quando ninguém a assumiu e a preferência da janela está ativa; caso contrário o Core utiliza o fallback dnd5e. Essa extensão serve às solicitações de teste do Core, não autoriza reconstruir seu motor de ataque/reação.

`apps/roll-window.mjs:91` trata `AbortSignal`, `:99`/`:255` mostram o prazo, e `:416` fecha a janela e resolve sua promessa. `tests/awaiting.test.mjs` verifica que esperas secretas do GM não aparecem em retratos. A visibilidade é calculada pelo Core em `api.ui.awaiting()`, não pelo add-on.

Decisão: atividades nativas e regras declarativas devem percorrer as janelas e o orçamento existentes. Não importar classes internas de UI, não substituir `prompt.result` para demandas que não pertencem ao add-on e não publicar informações inferidas sobre CD/falha oculta. Uma capacidade sem ponto público adequado precisa constar como limitação, em vez de simular uma reação fiel.

## Animações: delegação e degradação segura

O registro público está documentado e implementado em `runtime/registry.mjs:1–11,29,40`: `Hooks.once("darsh-animations.register", register => register(source, {animations,without,sources,strikes}))`; a coleta acontece em `setup`. Também existe `api.register`; chamadas posteriores ao `ready` precisam de `api.sync()` para atualização da Auto-Rec. Repetir uma origem substitui sua tabela. Não há método público de cancelamento nessa versão; o add-on deve evitar registros visuais persistentes desnecessários.

`core/registry.mjs:22` valida cada entrada: gatilho reconhecido, tipo/ID de atividade, exatamente `alias` ou `template`, parâmetros com nomes válidos. Isso **não comprova que um alias BLFX exista ou seja puramente visual**. O próprio comentário de `data/animations.mjs:11–18` alerta que certas macros BLFX alteram tokens. `tests/table.test.mjs` e os catálogos premium não distribuídos fazem a verificação adicional quando o desenvolvedor do DAS possui esses arquivos.

Ataques desarmados já são reconhecidos por `activity.attack.type.classification === "unarmed"` em `core/strikes.mjs:39,59`; nenhum nome em inglês é necessário nesse caminho. Armas improvisadas também percorrem o reconhecimento genérico de ataques de arma. O registro `strikes:{identifier:"unarmedstrike"}` seria possível (`core/strikes.mjs:342–369`), mas é dispensável para uma atividade corretamente classificada.

`runtime/strikes.mjs:170–179` recusa reproduzir um golpe quando BLFX ou Automated Animations já o animam; exige Sequencer/JB2A disponíveis e fonte na cena exibida. `:250` em diante usa resolução e chave por ataque para evitar animações repetidas. `runtime/shared.mjs` reconhece `JB2A_DnD5e` e `jb2a_patreon` com o mesmo prefixo Sequencer, e trata PSFX como opcional. Sem fonte visual, o ataque continua mecânico.

Decisão: deixar golpes desarmados e improvisados sob o DAS Animations/BLFX existente; não chamar `Sequence`, não repetir animação no hook do add-on e não inventar caminhos para Haymaker, Brace Up, Dig Deep ou Compression Lock. Essas capacidades não recebem uma animação premium específica do add-on. Ausência dos módulos visuais é suportada porque nenhum cálculo depende deles.

## BLFX 3.6.0: fronteira de confiança

`runtime/sync.mjs:4–9,75–108` documenta o hook público `blfx.register.CustomAutoRec`; o DAS Animations faz a fusão com as entradas do GM porque a importação do BLFX substitui a Auto-Rec inteira. Exige módulo ativo, GM ativo e opção `blfxCustomAutoRecUpdates`; há espera limitada de 10 segundos pelo hook de confirmação. O DAS mantém a integração; o add-on não deve escrever nessas configurações ou duplicar sua sincronização.

O código premium BLFX 3.6.0 e seu catálogo privado não estão nestes repositórios públicos. Portanto esta pesquisa verifica o contrato público declarado pelo DAS Animations e os seus testes sintéticos, **não** valida uma API ou um alias diretamente contra o código proprietário instalado. Nenhum asset ou macro premium foi copiado. A reprodução visual em Foundry com BLFX, JB2A e Tidy5e/Babele não foi executada nesta etapa.

## Testes de referência consultados

- Homebrew: `tests/packs.test.mjs`, `tests/creations.test.mjs`, `tests/core-contract.test.mjs`.
- UI: `tests/awaiting.test.mjs`, `tests/roll-window.test.mjs`, `tests/core-contract.test.mjs`.
- Animations: `tests/registry.test.mjs`, `tests/blfx.test.mjs`, `tests/jb2a.test.mjs`, `tests/strikes.test.mjs`, `tests/sources.test.mjs`.

Os testes privados de catálogo são pulados upstream quando seus arquivos não existem. Esse resultado não deve ser convertido em alegação de teste premium completo. Testes puros de registro/receitas podem ser executados em Node sem Foundry; não cobrem renderização, sockets ou decisão de jogador.

`node --test tests/ecosystem-contract.test.mjs` foi executado contra o snapshot exato de Animations: cinco testes passaram, nenhum pulado. Verificou classificação de ataques desarmados com nomes traduzidos, receita para arma improvisada, recusa de gatilho visual inventado e detecção segura de módulos visuais ausentes. Não executou animações reais nem validou o catálogo BLFX premium.
