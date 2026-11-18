Status: implementado

# Levantamento: parcela pelo valor da parcela e relatório anual

Resultado da leitura de `App.tsx`, `src/EntryModal.tsx`, `src/ops.ts`, `src/calc.ts` e `src/Summary.tsx`. Decisões tomadas onde o pedido deixava aberto; qualquer uma pode ser mudada antes da implementação.

## 1. Parcela pelo valor da parcela

**Hoje:** no popup, "Parcelado" pede o **valor total** e o **número de parcelas**. `buildEntries` (`src/ops.ts`) divide o total em centavos e põe a sobra na primeira parcela. `App.tsx` recusa a compra se a parcela der menos de R$ 0,01.

**Novo:** "Parcelado" pede o **valor da parcela** e o **número de parcelas**. O app calcula o total (parcela × número) e mostra no formulário ("Total: R$ X").

**Decisões:**
- Todas as parcelas ficam iguais. A sobra de centavos deixa de existir e a regra "a sobra vai para a primeira" sai do código.
- O aviso "Valor pequeno demais" sai: com a parcela informada, ela já é um valor válido (> 0).
- Com "parcelas já pagas", o app continua criando só as restantes; o total mostrado é o da compra inteira.
- Editar uma parcela já existente não muda: o campo já é o valor daquela parcela.
- Dados já salvos não mudam (cada linha já guarda seu valor).
- "Recorrente" não muda (já é um valor por mês).

**Arquivos:** `src/ops.ts` (`buildEntries`), `src/EntryModal.tsx` (rótulo, texto de ajuda, prévia do total), `App.tsx` (`saveEntry`), testes em `src/ops.test.ts`.

## 2. Relatório anual

**Hoje:** a tela Relatórios mostra só o mês selecionado (gastos, receitas, categoria, forma de pagamento e os últimos meses).

**Novo:** uma tela "Relatório anual" no menu, com seletor de ano (anos que têm lançamentos; padrão: o ano atual). Conteúdo:
1. **Totais do ano:** receitas, gastos, saldo e média mensal de gastos.
2. **Mês que mais gastou e mês que menos gastou** (só meses com gasto).
3. **Gráfico dos 12 meses** (gastos), reaproveitando o gráfico existente.
4. **Gastos por categoria no ano** e **como pagou no ano**, reaproveitando as barras existentes.
5. **Os 5 maiores gastos do ano** (descrição, data, valor).
6. **Parcelado e recorrente x avulso:** quanto do gasto do ano veio de parcelas, de recorrências e de compras avulsas. Responde "outras coisas que foram gastas".

**Decisões:**
- Um lançamento conta no ano do seu mês de referência (`monthOf`): uma compra de cartão de dezembro após o fechamento conta em janeiro do ano seguinte, como já acontece nos relatórios mensais.
- Só leitura: o relatório não grava nada nos dados.
- Funções novas e testadas em `src/calc.ts`; a tela em `src/AnnualReport.tsx`, ligada em `App.tsx` e no menu (`Drawer`).
- Fora de escopo: exportar o relatório, comparar com o ano anterior, filtros.

## 3. Plano de entrega (uma PR por passo)

1. Este levantamento.
2. Parcela pelo valor da parcela.
3. Funções de cálculo do relatório anual, com testes.
4. Tela do relatório anual e item no menu.
