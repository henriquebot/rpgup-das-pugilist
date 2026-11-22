# Auditoria de compatibilidade — 21/11/2026

## Referências inspecionadas

| Componente | Versão fixada | Commit/tag |
|---|---|---|
| Foundry VTT | 14.370 (Stable 12) | release publicada em 02/11/2026 |
| D&D 5e | 6.1.1 | `release-6.1.1` / `bc1b2c921e2f306dc5079f8de883ad64607118a6` |
| DAS Core | 0.290.0 | `v0.290.0` / `1499ff92b1ae4cdf72f91c7ed7a2e27d338fffae` |
| DAS Animations (opcional, testes) | 0.16.3 | `v0.16.3` / `6b1f7593395f6fb923545d0c73aecfdb028df8f7` |

## Contratos verificados no código upstream

- DAS 0.290.0: `runtime/content.mjs` ainda publica o hook de registro em `setup` e a API `api.content.register/unregister`, validando tabelas e mapas `sources`.
- DAS 0.290.0: `core/content.mjs` ainda documenta `flurry`, `basicActions`, `maxDamage` (com `weapons` e `refundOnHit`), `inescapable`, `grappleCover` e `weaponDamageTypes`.
- DAS 0.290.0: `runtime/maneuver-dice.mjs` ainda registra a promessa de Haymaker no `postUseActivity`, maximiza dados no `preRollDamageV2` e devolve usos do item no fluxo de acerto.
- D&D 5e 6.1.1: `module/documents/activity/mixin.mjs` ainda emite `dnd5e.preUseActivity` e `dnd5e.postUseActivity`; `module/documents/actor/actor.mjs` emite `dnd5e.preApplyDamage`.
- DAS Animations 0.16.3: permanecem `weaponRecipe`, `strikeForm`, `checkRegistration` e detecção dos renderizadores opcionais.

## Limites

A conferência de contratos públicos e os testes em Node **não** reproduzem o Foundry real, os documentos de compêndio carregados, os sockets do jogador, a ordem de resolução simultânea dos hooks, o BLFX Premium ou as fichas importadas. Mantenha a trava de versão exata até os testes na mesa e não prometa compatibilidade com versões futuras automaticamente.

## Roteiro de aceite no Foundry v14

1. Carregar o módulo num mundo de testes com DAS Core 0.290.0 e D&D 5e 6.1.1; conferir ausência de erros na inicialização e entradas do registro.
2. Criar Pugilist v0.2.3 a partir do compêndio e conferir progressão dos níveis 1 a 6, Fisticuffs e Moxie após descanso.
3. Testar Haymaker em ataque elegível com Moxie disponível: recusar, aceitar/acertar (dano máximo e reembolso), aceitar/errar (custo mantido), crítico, modificador, dois ataques seguidos, nenhuma ação duplicada.
4. Testar Heavy Hitter/Stop and Drop, One-Two Punch, Stick and Move, Brace Up, Bloodied, Dig Deep, Meat Shield e as salvaguardas; repetir com jogador proprietário e GM distintos.
5. Testar armas simples, improvisadas e golpes desarmados; verificar que nenhuma automação transborda para itens/classe Monge ou versões antigas.
6. Validar personagens existentes **somente em cópia do mundo**: não duplicar classe, itens, recursos ou progressão; o módulo não reconhece genericamente itens importados do DDB só pelo nome.

## Fontes históricas

Os arquivos `research-das.md`, `research-dnd5e.md` e `research-ecosystem.md` registram a pesquisa das versões anteriores e **não** devem ser apresentados como prova de compatibilidade das versões novas. O CI e este documento definem a nova linha-base.
