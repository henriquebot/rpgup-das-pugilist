# Validação e limites

## Portabilidade da v0.2.3 (21/11/2026)

Alvo atualizado: Foundry 14.370, dnd5e 6.1.1, DAS Core 0.290.0 e referência opcional DAS Animations 0.16.3. O CI foi reconfigurado para clonar precisamente essas tags e executar os contratos reais mais o empacotamento. **O sucesso histórico da v0.2.2 não comprova a nova v0.2.3**; a execução do CI novo e o roteiro no Foundry continuam indispensáveis. As pesquisas `research-*.md` descrevem o estado histórico das tags antigas; a auditoria de portabilidade está em `docs/COMPATIBILITY-2026-11-21.md`.


O teste dentro do Foundry ficou a cargo do usuário por instrução expressa. Nenhum aplicativo pessoal, módulo instalado ou mundo de campanha foi operado durante esta entrega. As referências completas estão em `tools/references.json`; `.research` é ignorado pelo Git e não entra no ZIP.

## O que a automação externa verifica

- Formato, progressão, referências, namespaces, imports, ausência de patches e isolamento de outras classes.
- Decisões das cinco novas janelas em um ambiente Node controlado: acerto/erro, sucesso/falha, cancelamento, falta de recurso, múltiplos alvos, vínculo de agarrão inválido, maestria, repetição e eleição do GM.
- Funções reais do DAS 0.282.1 para registro, orçamento, agarrões, cobertura, Haymaker, maximização/reembolso e animações, sem alterar os fontes fixados.
- Compilação oficial do compêndio, abertura do LevelDB gerado, manifesto, imports e conteúdo do ZIP.
- Suíte oficial do DAS Core executada na cópia fixada e limpa.

Esses testes não executam canvas, DataModels completos, DiceRoll real, banco de mundo, sockets, fichas ou dois navegadores Foundry.

## Resultado histórico da v0.2.2 (antes desta atualização)

- `npm run check`: **93 testes aprovados**, nenhum ignorado; compêndio com **22 Items**; ZIP, manifesto e LevelDB validados; round trip oficial preservou atividades, avanços e efeitos.
- `npm run test:upstream`: **174 arquivos e 1.814 testes do DAS aprovados**, nenhum ignorado, na tag fixada e sem alterações em fontes upstream.
- Artefato local: `dist/rpgup-das-pugilist.zip`, SHA-256 registrado em `dist/SHA256SUMS`. O workflow de release reconstrói o pacote da tag em ambiente limpo.

## Matriz das cinco prioridades

| Mecânica | Cobertura automatizada fora do Foundry | Limite que permanece |
|---|---|---|
| Swagger Streak | Filtra habilidade e CD, confirma falha, cancela sem gasto, consome Moxie uma vez, soma o bônus, reembolsa e bloqueia em falha persistente, ignora a mesma rolagem repetida. | Testes sem CD conhecida ficam manuais; query, rolagem e recuperação por descanso precisam de runtime real. |
| Compression Lock | Somente marcas pareadas do DAS, zero/uma/várias vítimas, cancelamento e idempotência por turno. | Criação/resolução efetiva das cartas e troca de GM ativo exigem Foundry. |
| Stop and Drop | Um alvo acertado, cancelamento, rejeição de erro/múltiplos alvos, leitura da maestria e prevenção de duplicata. | Salvaguardas, efeitos e interação visual da carta são resolvidos pelo DAS no Foundry. |
| Meat Shield | Alcance pelo `api.gap`, conversão de unidade, vínculo, alvo vivo, reação, Moxie, cancelamento, pagamento único e repetição gratuita contra alvo exato. | Não há transação pública única envolvendo dois documentos; queda após pagar e antes da repetição requer conferência manual. |
| Haymaker | Pergunta por ataque, cancelamento, falta de Moxie, bypass contra recursão, gasto único e entrega da promessa ao DAS. | Integrações que chamam `rollAttack` diretamente não passam por `preUseActivity`; a atividade manual é o fallback. |

## Roteiro obrigatório no mundo isolado

Validar em **G9 Ember [BG3]**, sem usar a campanha original, com Foundry 14.370, dnd5e 6.0.6 e DAS 0.282.1:

1. Usar um personagem novo do compêndio, níveis 2, 3, 5 e 6, e confirmar avanços/recuperações em descanso curto e longo.
2. Swagger: falha com CD, bônus que passa, bônus que continua falhando, cancelamento, CD ausente e segunda tentativa antes/depois do descanso.
3. Compression: nenhum agarrado, um, vários, condição Grappled manual não vinculada, vítima solta durante a pergunta e dois inícios do mesmo turno.
4. Heavy Hitter/Stop and Drop: erro, acerto único, múltiplos alvos, ataque com e sem maestria, cancelamento e os dois testes de resistência.
5. Meat Shield: atacante agarrado, vítima fora do alcance, alcance longo, sem reação, sem Moxie, cancelamento, repetição acertando/errando e interrupção de conexão entre decisão e rolagem.
6. Haymaker: acerto, erro, crítico, dano com modificador, cancelamento, recurso insuficiente, ataques seguidos e chamada por macro/módulo que use diretamente `rollAttack`.
7. Repetir com GM + jogador proprietário conectados, depois desconectar o jogador durante um prompt e trocar o GM ativo.
8. Conferir ficha nativa, Tidy5e, Babele e módulos visuais opcionais: uma única animação, uma única carta e nenhum consumo duplicado.
9. Criar um personagem Monge/Pugilist de teste e confirmar que características do Monge não são alteradas; a guarda de `flurryStrikes` deve recusar somente as atividades Pugilist incompatíveis.

Até esse roteiro ser concluído, o estado correto das cinco mecânicas é **assistido e aguardando validação no Foundry**, não “certificado integralmente”.
