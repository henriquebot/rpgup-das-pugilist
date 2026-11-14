# RPGUp DAS Pugilist

Add-on para **Foundry VTT 14.370, dnd5e 6.0.6 e DAS Core 0.282.1**. Contém a classe Pugilist do nível 1 ao 6 e somente a subclasse Squared Circle. Versão **0.2.0, pré-lançamento para validação**.

As cinco mecânicas prioritárias agora possuem complementos assistidos, mas ainda exigem validação dentro do Foundry. Swagger requer uma CD numérica conhecida; Haymaker automático cobre o fluxo normal de `activity.use`; Meat Shield depende da continuidade entre pagamento e repetição do ataque. Leia a matriz antes de usar em campanha.

## Instalar e utilizar

No instalador de módulos do Foundry, use o [manifesto v0.2.0](https://github.com/henriquebot/rpgup-das-pugilist/releases/download/v0.2.0/module.json). O [ZIP e as notas da versão](https://github.com/henriquebot/rpgup-das-pugilist/releases/tag/v0.2.0) são gerados pelo workflow de release.

1. Ative DAS Core e RPGUp DAS Pugilist no mundo de teste.
2. Abra o compêndio **RPGUp · Pugilist (1–6)** e arraste **Pugilist** para um personagem novo. Use os avanços nativos ao subir de nível.
3. No nível 3, selecione **Squared Circle** no avanço de subclasse e escolha Acrobacia ou Atletismo para Muscle Mass.
4. Use **Golpe Desarmado — Pugilist** e as atividades das características na ficha. O DAS conduz combate, alvos, reações, custos e escolhas. Haymaker é oferecido automaticamente antes de ataques elegíveis iniciados pelo fluxo normal; sua atividade manual continua como alternativa para integrações que chamem diretamente `rollAttack`.

Não há importação manual de JSON, macros obrigatórias ou dependência de `pugilist-das-pack.json`. A instalação inclui um compêndio LevelDB real com 22 documentos, atividades e efeitos próprios. Traços iniciais incluídos: dado de vida d10, salvaguardas de Força/Constituição, armaduras leves e armas simples. Equipamento inicial e escolhas de perícias iniciais não foram inventados nem importados do suplemento; confira esses campos com sua versão licenciada.

## Estado das mecânicas

“Implementado” significa que há código/dados e validação automatizada fora do Foundry. Não significa que o combate completo tenha sido testado dentro do aplicativo.

| Nível | Mecânica | Estado nesta versão |
|---|---|---|
| 1 | Fisticuffs | Ataque bônus nativo; dado d8/d10 apenas sob os requisitos de equipamento; modificador preservado; Sap nas improvisadas pelo fluxo nativo de ataque. Fórmulas importadas complexas não são reescritas. |
| 1 | Iron Chin | Fórmula alternativa nativa 12 + Con, sem escudo e com armadura leve ou nenhuma. Mantém outras fórmulas e bônus; o sistema escolhe a maior fórmula válida. |
| 2 | Moxie | Reserva 2/2/3/3/4 nos níveis 2–6; consumo nativo por atividade e recuperação curta/longa. |
| 2 | Brace Up | Atividade bônus de PV temporários; custo 1; origem rastreada; expira após 600 segundos do relógio do mundo. |
| 2 | One-Two Punch | DAS concede duas oportunidades de golpe desarmado pelo custo de uma ação bônus e 1 Moxie. |
| 2 | Stick and Move | DAS concede um golpe e oferece Dash/Disengage, com um único custo. |
| 2 | Bloodied But Unbowed | Reação opcional do DAS; restaura Moxie após uso confirmado; concede 4 × nível de PV temporários se estiver com metade dos PV máximos ou menos; expiração no descanso. |
| 2 | Swagger Streak | **Assistida:** após teste elegível com CD numérica e falha confirmada, pergunta ao proprietário; consome 1 Moxie pela atividade nativa, rola o dado, reembolsa e gasta o uso próprio se a falha persistir. CD ausente permanece manual e segura. |
| 3 | Heavy Hitter | **Assistida:** após um único alvo ser acertado por Golpe Desarmado próprio, oferece Agarrar ou Empurrar; cada efeito usa uma carta de uso com alvo exato e resolução do DAS. |
| 3 | Compression Lock | **Assistida:** no início do turno, o GM ativo consulta somente marcas de agarrão pareadas do DAS, pergunta ao proprietário e cria uma carta de dano separada para cada criatura ainda agarrada. |
| 3 | Inescapable | Pergunta e custo do DAS antes das salvaguardas de Grapple/Shove e testes de escapar pertinentes. |
| 3 | Stop and Drop | **Assistida:** lê `ChatMessage.system.mastery` do ataque. Sem maestria usada, acrescenta a opção de aplicar Agarrar e Empurrar; com maestria, Heavy Hitter continua limitado a um efeito. |
| 3 | Muscle Mass | Avanço nativo persistente: proficiência ou Expertise em Acrobacia/Atletismo. |
| 4 | ASI / talento | Avanço nativo AbilityScoreImprovement para personagens criados pelo RPGUp. Para personagens importados do 5etools, `api.asiLevel4(actor)` verifica a classe e os talentos já presentes, sem conceder ASI adicional. |
| 4 | Dig Deep | Efeito nativo de 10 minutos, resistências B/P/S; imunidade derivada às penalidades de Exhaustion 1–5, sem apagar níveis. Recuperação voluntária do uso recebe +1 Exhaustion; bloqueada com 6 níveis. |
| 5 | Extra Attack | Duas oportunidades na ação Attack pelo identificador nativo do DAS; não multiplica bônus/reações. |
| 5 | Haymaker | **Assistida:** pergunta antes de cada `activity.use` elegível, depois das guardas de legalidade. A atividade nativa arma o Core; ele maximiza os dados e reembolsa no acerto, mantendo o custo no erro. Chamadas diretas a `rollAttack` usam a atividade manual. |
| 6 | Moxie-Fueled Fists | Core oferece o tipo normal ou Force em golpes desarmados e improvisados, por ocorrência. |
| 6 | Meat Shield | **Assistida/parcial:** mantém a Meia Cobertura do DAS. Após erro contra o Pugilist, o GM ativo filtra vínculos, alcance 3D, reação e Moxie, consulta o proprietário, paga uma vez e repete a atividade original gratuitamente contra o alvo escolhido. A atomicidade em queda de conexão entre pagamento e repetição não é garantida pelo contrato público. |

Os motivos, arquivos e contratos pesquisados estão em [pesquisa DAS](docs/research-das.md), [pesquisa dnd5e](docs/research-dnd5e.md) e [ecossistema visual](docs/research-ecosystem.md). Os resumos de regras são originais e não substituem o suplemento licenciado de Benjamin Huffman / Sterling Vermin.

## Segurança, atualizações e personagens existentes

O módulo registra sete entradas exclusivas `rpgup-pugilist-*` por `dnd5e-combat.registerContent` / `api.content.register`. Heavy Hitter saiu da tabela declarativa porque seu follow-up incondicional não podia distinguir Stop and Drop. O módulo não modifica o motor, janelas ou arquivos DAS, nem substitui métodos. Compêndios, atividades e efeitos têm IDs estáveis. Os complementos usam hooks públicos de Foundry/dnd5e e dados derivados apenas de personagens que possuem a classe e as características deste add-on.

Não há migração automática de personagens DDB ou de outros módulos. Nomes traduzidos não são usados como identidade. O módulo não sobrescreve nem reconhece automaticamente uma classe importada apenas porque ela se chama Pugilist. Adicionar uma segunda classe/reserva equivalente pode causar duplicação; revise os itens antes de trocar um personagem existente. O diagnóstico relata identificadores duplicados. Atualizar o compêndio não modifica silenciosamente as cópias já colocadas nas fichas.

Versões diferentes das três referências exatas desativam os complementos, com aviso ao GM. O manifesto restringe a instalação às versões pesquisadas. Depois de desativar o módulo e recarregar o mundo, seus hooks e tabelas não existem; efeitos e itens nativos já adicionados permanecem documentos do próprio personagem. Não há limpeza destrutiva de fichas.

As novas janelas usam `CONFIG.queries`/`User.query`, com recusa como opção padrão e nenhuma mutação em cancelamento ou timeout. Compression, Stop and Drop e Meat Shield são executados apenas pelo GM ativo e possuem chaves de idempotência; o proprietário conectado responde quando disponível. **Concorrência real, troca de GM ativo, falhas de rede e recarga durante uma decisão não estão certificadas por testes Node.** Em Meat Shield, uma desconexão depois do consumo nativo e antes da nova rolagem pode exigir ajuste manual de Moxie/reação pelo GM.

Multiclasses com um aumento global de `flurryStrikes` (por exemplo, Heightened Focus do Monge) bloqueiam One-Two Punch/Stick and Move antes do custo, pois o Core aplicaria esse aumento também às oportunidades do Pugilist. As habilidades do Monge continuam intactas. Não foi implementado um motor alternativo para contornar essa limitação. A proficiência de armas improvisadas é acrescentada somente à ocorrência quando o cálculo nativo ainda não a concede; o documento da arma permanece intacto.

Brace Up mede tempo do mundo, não tempo de relógio do computador. PV temporários posteriores de outra fonte não são apagados. Uma edição direta de PV temporários na ficha encerra o rastreamento de origem; nesse caso o valor editado passa a ser administrado pela mesa. A expiração por tempo é executada pelo GM ativo, ou pelo proprietário ativo eleito na ausência de GM.

## Visuais e fichas

Ficha nativa e Tidy5e utilizam os mesmos documentos e atividades; nenhuma API privada de ficha é acessada. Babele pode traduzir nomes sem alterar os IDs.

DAS Combat UI, DAS Homebrew, DAS Animations, BLFX, Sequencer e JB2A são **opcionais**. Golpes desarmados usam a classificação nativa `unarmed`, que o DAS Animations 0.15.0 já reconhece; improvisadas usam a receita genérica existente. O add-on não dispara um segundo reprodutor. Não há aliases BLFX próprios, arquivos premium ou caminhos de assets inventados. Animações específicas de Brace Up, Dig Deep e Compression Lock não foram registradas; a ausência de módulos visuais não afeta a mecânica.

## Desenvolvimento e validação

Requer Node.js 22 ou superior e Git. Todos os downloads e saídas ficam neste repositório. As referências são fixadas por tag **e commit** em `tools/references.json`, sem redistribuir código do DAS ou dnd5e.

```sh
npm ci --ignore-scripts
npm run references
npm run check
```

`check` executa testes do add-on, compila o compêndio pela CLI oficial do Foundry, gera o ZIP e valida o manifesto/ZIP e os registros reais LevelDB. `dist/module.json`, `dist/rpgup-das-pugilist.zip` e `dist/SHA256SUMS` são os artefatos de distribuição. O workflow GitHub Actions repete esse processo. Ao publicar uma tag `v*`, o workflow de release valida a versão e publica um pré-lançamento com os artefatos.

A suíte inclui contratos reais do Core, execução de partes do runtime upstream com substitutos de documentos/queries/geometria, testes das cinco novas janelas, política e ciclo de vida, dados de avanço, isolamento e integração com o classificador real de animações. Essas categorias não equivalem a executar Foundry, canvas, banco de mundo ou sockets de vários jogadores. Consulte [VALIDATION.md](docs/VALIDATION.md) para os resultados efetivamente obtidos.

Para repetir a suíte oficial do Core na cópia de pesquisa: instale suas dependências com `npm ci --ignore-scripts` dentro de `.research/dnd5e-combat` e execute `npm run test:upstream` na raiz deste repositório. Nenhum arquivo upstream é corrigido pelo projeto.

O GM pode consultar o relatório pela API pública do add-on no console do navegador:

```js
game.modules.get('rpgup-das-pugilist').api.diagnostics()
```

Passar um Actor ao método acrescenta nível, esquema e identificadores duplicados. `api.shutdown()` cancela os hooks próprios e remove o registro externo nesta sessão; a desativação normal usa recarga de mundo. Não são macros necessárias ao jogador.

## Validação manual no Foundry

O usuário fará esta etapa no mundo isolado **G9 Ember [BG3]**. O roteiro mínimo está em [VALIDATION.md](docs/VALIDATION.md): inclui as cinco novas janelas, dois clientes GM/jogador, cancelamentos, recarga durante prompt, Tidy5e/Babele e módulos visuais. Nenhum resultado dentro do Foundry é alegado por esta versão.
