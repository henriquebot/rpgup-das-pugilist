# RPGUp DAS Pugilist 0.2.3

Atualização de compatibilidade para **Foundry VTT 14.370, D&D 5e 6.1.1 e DAS Core 0.290.0** (referência de animações opcionais: **DAS Animations 0.16.3**).

## Mudanças desde a v0.2.2

- Atualizados o manifesto, o bloqueio de versões do runtime, as dependências fixadas e os workflows de CI/release.
- O DAS mantém a API pública de registro `dnd5e-combat.registerContent`, o esquema das regras `maxDamage`, `flurry`, `basicActions`, `inescapable`, `grappleCover` e `weaponDamageTypes`; o sistema 6.1.1 ainda emite os hooks `preUseActivity`, `postUseActivity` e `preApplyDamage` utilizados pelo módulo.
- Testes de versão agora distinguem o conjunto exato auditado de versões antigas para impedir a ativação silenciosa de integrações incompatíveis.
- A suíte do módulo e os testes do Core passam a ser executados pelo GitHub Actions usando as novas tags; a compatibilidade de efeitos, dano, janelas e compêndio deve ser conferida no Foundry real.
- Não há migração automática nem alterações destrutivas de personagens, itens, inventário, efeitos ou recursos existentes.

## Haymaker e limitações

Haymaker continua oferecendo uma escolha antes do ataque elegível iniciado com `activity.use`; a atividade própria consome Moxie e o Core cuida da promessa `maxDamage` e do reembolso quando há dano de um acerto. Integrações que chamam `rollAttack` diretamente ainda exigem uso manual da atividade. A integração de personagens importados não foi ampliada para detectar automaticamente toda importação do DDB.

**Esta versão é candidata a testes, não está certificada para uso em campanha.** Validar com GM e jogador conectados: Haymaker (acerto, erro, crítico, dano com modificador), Heavy Hitter/Stop and Drop, Moxie, Fisticuffs, Bloodied, Dig Deep e animações. Confira o detalhamento em [COMPATIBILITY-2026-11-21.md](COMPATIBILITY-2026-11-21.md) e [VALIDATION.md](VALIDATION.md).
