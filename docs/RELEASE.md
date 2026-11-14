# RPGUp DAS Pugilist 0.2.2

Pré-lançamento de validação para Foundry 14.370, dnd5e 6.0.6 e DAS Core 0.282.1.

## Correções desde a v0.2.1

- Corrigida a leitura do máximo original de usos (`system.uses.max`) nos validadores de Swagger Streak, One-Two Punch, Stick and Move, Bloodied But Unbowed e Dig Deep.
- O dnd5e pode apresentar o máximo já calculado na ficha; a validação consulta primeiro o valor de origem preservado pelo documento, sem aceitar fórmulas ou recursos não reconhecidos.
- Novos testes asseguram reconhecimento de máximos numéricos derivados e recusa segura de origens incompatíveis.
- Nenhum atributo ou talento, inclusive Sentinel e Força do personagem de teste, é modificado. Nenhuma migração da ficha acontece ao carregar o mundo.

## Utilização com personagens importados

Atualize o módulo e reinicie o mundo. Execute o diagnóstico de GM e, onde a API retornar `ready`, aplique as integrações opcionais no próprio ator (preferencialmente em uma rotina em lote com cópia de segurança). O módulo preserva os itens e atividades de origem; atualizações do compêndio não substituem itens de atores.

## Limitações

A compilação e os testes automatizados não substituem a validação real no Foundry v14. As limitações documentadas da v0.2.1 permanecem. Consulte README e docs/VALIDATION.md.
