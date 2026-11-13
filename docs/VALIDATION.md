# Validação fora do Foundry

O teste dentro do Foundry ficou a cargo do usuário por instrução expressa. Nenhum aplicativo pessoal, módulo instalado ou mundo de campanha foi operado.

As referências completas são listadas em `tools/references.json`. O diretório `.research` é ignorado pelo Git e não entra no ZIP.

## Categorias

- **Estática:** formato dos documentos, progressão, referências, namespaces, imports, ausência de patches e dependências opcionais.
- **Unidade e ciclo de vida em Node:** requisitos, dados derivados, reserva, PV temporários, duração, descanso, habilitação, rejeição e desligamento usando documentos substitutos.
- **Integração de código upstream em Node:** validadores, registro, orçamento, follow-ups, cobertura, agarrões, reações, Haymaker e animações executam funções reais do DAS fixado. Sockets, banco Foundry, canvas e DiceRoll não são executados de ponta a ponta.
- **Pacote:** compilação oficial do compêndio, abertura real LevelDB, manifesto e arquivos/imports do ZIP.
- **Suíte oficial do DAS:** executada sem modificar o código upstream, com quatro workers e limite de inicialização de 30 segundos para evitar saturação da máquina compartilhada.

## Resultados obtidos

- Suíte oficial do DAS Core: **174 arquivos, 1.814 testes aprovados**, nenhum ignorado, sem alteração de fontes upstream. Uma primeira execução paralela atingiu o timeout de inicialização do teste de carregamento; a repetição completa com quatro workers e timeout30s passou integralmente.
- O pacote foi compilado pela CLI oficial, com **22 registros Item** no LevelDB. A extração de volta pela mesma CLI preservou todos os documentos, atividades, avanços e efeitos embutidos.
- Suíte final do add-on: **80 testes aprovados**, nenhum ignorado, via `npm run check`. Os testes usam Node, fontes upstream e substitutos de ambiente conforme as categorias acima. O workflow repete a suíte do add-on e a suíte oficial do Core.

As mecânicas não automatizadas ficam explicitamente fora da certificação; passar pelo validador não é evidência de que elas funcionam.

## Pontos reservados ao teste no Foundry

Avanços e aplicação efetiva de efeitos pela ficha; queries de decisão em clientes GM/jogador; resolução completa de combate; concorrência e desconexões; renderização Tidy5e/Babele; efeitos visuais BLFX/JB2A presentes. Não há alegação de aprovação desses pontos.
