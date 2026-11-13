# RPGUp DAS Pugilist 0.2.0

Pré-lançamento para Foundry 14.370, dnd5e 6.0.6 e DAS Core 0.282.1.

## Novidades

- Swagger Streak assistido para testes elegíveis com CD conhecida, incluindo reembolso e bloqueio em falha persistente.
- Compression Lock opcional no início do turno, restrito aos agarrões pareados do próprio Pugilist.
- Heavy Hitter e Stop and Drop condicionados ao acerto, alvo único e maestria registrada na mensagem.
- Meat Shield com filtro prévio de vínculo, alcance, reação e Moxie, seguido da repetição gratuita do ataque contra o alvo escolhido.
- Haymaker oferecido antes de usos normais de ataques elegíveis; maximização e reembolso continuam pertencendo ao DAS.
- Novos testes de cancelamento, falta de recursos, alvos inválidos, repetição e eleição do executor.

O compêndio LevelDB contém 22 documentos e não migra personagens existentes. Fichas e módulos visuais permanecem opcionais e são reconhecidos somente por contratos públicos/IDs estáveis.

## Limites

Nenhum teste foi executado dentro do Foundry por instrução do usuário. Swagger sem CD e chamadas diretas a `rollAttack` usam funcionamento manual seguro. Meat Shield não pode garantir atomicidade se a conexão cair depois do pagamento e antes da nova rolagem. Consulte `README.md` e `docs/VALIDATION.md` antes de usar em campanha.
