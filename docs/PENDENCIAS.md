# Pendências futuras

Ideias já conversadas e adiadas de propósito. Não fazem parte do que está sendo construído agora.

## Meta de gastos do mês

Uma meta de quanto a pessoa planeja gastar por mês, com barra de progresso e aviso ao chegar perto ou passar. Existiu na tela principal e foi retirada do app por não ser prioridade. Se voltar, o lugar combinado é dentro dos Relatórios, contando todos os gastos do mês, pagos ou pendentes.

## Relatório anual

Um relatório do ano inteiro, para mostrar também outras coisas que foram gastas ao longo dos meses (o detalhamento exato ainda não foi definido: conversar antes de implementar). Pode aproveitar `monthlySeries`, `spendByCategory` e `spendByPayment` em `src/calc.ts`.

## Ordem combinada

O relatório anual vem **depois** de corrigir os pontos da auditoria: carregar sem apagar dados bons, restaurar backup sem perder o estado atual, testes das regras de dinheiro e data, e validação mais rígida na importação.
