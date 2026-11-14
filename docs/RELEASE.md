# RPGUp DAS Pugilist 0.2.1

Pré-lançamento de validação para Foundry 14.370, dnd5e 6.0.6 e DAS Core 0.282.1.

## Atualizações desde a v0.2.0

- Integração revisada do Pugilist com DAS, preservando atividades e dados de personagens já existentes.
- Groundwork: tratamento da atividade e referências de efeitos na integração.
- Muscle Mass: seleção nativa de proficiência ou Expertise em Acrobacia/Atletismo, com migração reversível para casos reconhecidos.
- Dig Deep: ativação normal e recuperação de uso mediante Exaustão, sem conceder efeitos duplicados e com migração condicionada à aprovação do GM.
- Unarmed Strike (Pugilist): mantém os ataques originais, evita duplicatas e encaminha Agarrar/Empurrar para as atividades nativas do DAS.
- Nível 4 (ASI/talento): auditoria somente de leitura de personagens importados; não concede talentos ou atributos automaticamente, prevenindo duplicação quando há talento previamente aplicado.
- Atualizada a verificação de duplicatas de Fisticuffs: itens sem proveniência válida não anulam a origem legítima.

## Validação e limitações

O CI verificou os testes do add-on (216/216) e a suíte original do DAS (1.814/1.814), além do empacotamento. Esta versão ainda precisa de validação prática no Foundry v14 com o personagem Kyros. Nenhuma migração de ficha é executada silenciosamente; quando aplicável, ela depende de condições e confirmação do GM. Atualizar o compêndio não substitui automaticamente itens já presentes em personagens.

Os limites da v0.2.0 permanecem: testes Node não reproduzem todo o fluxo de canvas, sockets e múltiplos clientes; Swagger sem CD conhecida e chamadas diretas a `rollAttack` podem exigir resolução manual; Meat Shield não garante atomicidade em caso de desconexão após o consumo do recurso.

Consulte `README.md` e `docs/VALIDATION.md` antes de utilizar em campanha.
