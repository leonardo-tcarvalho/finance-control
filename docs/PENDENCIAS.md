# Pendências futuras

Ideias já conversadas e adiadas de propósito. Não fazem parte do que está sendo construído agora.

## Meta de gastos do mês

Uma meta de quanto a pessoa planeja gastar por mês, com barra de progresso e aviso ao chegar perto ou passar. Existiu na tela principal e foi retirada do app por não ser prioridade. Se voltar, o lugar combinado é dentro dos Relatórios, contando todos os gastos do mês, pagos ou pendentes.

## Parcelamento: informar o valor da parcela, não o total

Hoje, ao lançar uma compra parcelada, a pessoa digita o valor cheio e o número de parcelas, e o app divide (`buildEntries` em `src/ops.ts`). Isso ficou ruim de usar. O combinado é inverter: a pessoa digita o **valor da parcela** e o **número de parcelas**, e o app calcula o total (parcela × número). Cuidados ao implementar: a sobra de centavos deixa de existir (todas as parcelas ficam iguais), então revisar a regra "a sobra vai para a primeira parcela" e o aviso "Valor pequeno demais"; mostrar o total calculado no formulário; revisar a edição de uma parcela de um grupo.

## Relatório anual

Um relatório do ano inteiro, para mostrar também outras coisas que foram gastas ao longo dos meses (o detalhamento exato ainda não foi definido: conversar antes de implementar). Pode aproveitar `monthlySeries`, `spendByCategory` e `spendByPayment` em `src/calc.ts`.

## Ordem combinada

Implementar os dois itens acima **depois** de corrigir os pontos da auditoria: carregar sem apagar dados bons, restaurar backup sem perder o estado atual, testes das regras de dinheiro e data, e validação mais rígida na importação.
