# Levantamento: investimentos e saúde financeira

Resultado da leitura de `src/types.ts`, `src/storage.ts`, `src/ops.ts`, `src/status.ts`, `src/calc.ts`, `src/EntryModal.tsx`, `src/Summary.tsx`, `src/AnnualReport.tsx` e `App.tsx`. Onde o pedido deixava algo aberto, a decisão está escrita aqui e pode ser mudada antes da implementação.

## 1. Pontos de saúde financeira avaliados

| Ponto | Decisão | Motivo |
|---|---|---|
| Registrar investimentos (banco, valor aplicado, rendimento) | **Entra** | Pedido principal. |
| Mostrar o investido no resumo geral | **Entra** | Pedido. |
| Taxa de poupança do mês (quanto da receita sobrou) | **Entra** | Cálculo simples sobre dados que já existem. |
| Parte da renda aplicada no mês | **Entra** | Mede o hábito de investir. |
| Reserva de emergência: quantos meses de gasto o investido cobre | **Entra** | Indicador mais usado de saúde financeira. |
| Investido e rendimento no relatório anual | **Entra** | Fecha o ciclo com o relatório que já existe. |
| Rendimento calculado sozinho (CDI, taxa, projeção) | **Fora** | Exige índices externos e o app é 100% local. O valor atual é informado pela pessoa. |
| Metas de investimento, alertas, cotações | **Fora** | Fora do pedido; aumenta muito o escopo. |
| Resgate parcial, vender uma aplicação | **Fora** | Primeira versão: o valor atual informado já reflete o que sobrou. |
| Comprometimento da renda com parcelas | **Adiado** | Útil, mas fica para uma próxima rodada. |

## 2. Modelo escolhido

Investimento é um **terceiro tipo de lançamento** (`'investment'`), ao lado de Gasto e Receita, no mesmo popup.

Campos de um investimento:
- **Valor aplicado** (`amountCents`) e **data**.
- **Banco** (`bank`): escolhido numa lista de instituições comuns, com "Outro" para digitar.
- **Valor atual** (`currentValueCents`), opcional: o quanto vale hoje, informado pela pessoa. Se vazio, não está rendendo (ou não se sabe).
- **Taxa informada** (`ratePct`), opcional, só como anotação (ex.: "100% do CDI" ou "11% ao ano"); não entra em nenhum cálculo.
- Sem cartão, sem forma de pagamento, sem parcelas, sem pendente/pago.

**Rendimento** = valor atual − valor aplicado (e a porcentagem sobre o aplicado). Sem valor atual, o rendimento é zero.

**Efeito nos totais:**
- Investir **não é gasto** e **não é receita**: não entra em Gastos nem em Receitas.
- O **Saldo** passa a descontar o que foi aplicado (o dinheiro saiu da conta). O resumo mostra uma linha **Investido** (aplicado) e o **rendimento** quando houver.
- A aplicação aparece no resumo geral (tela Principal) e nos relatórios.

**Indicadores de saúde:**
- Taxa de poupança = (receitas − gastos) ÷ receitas, no mês.
- Parte aplicada = aplicado no mês ÷ receitas do mês.
- Reserva de emergência = valor atual (ou aplicado, se sem valor atual) de todos os investimentos ÷ média mensal de gastos dos últimos 6 meses com gasto; mostrado em meses.

**Compatibilidade:** arquivos antigos continuam válidos (campos novos são opcionais). A importação passa a aceitar `type: 'investment'` com as validações dos campos novos. Uma versão antiga do app não abre arquivo com investimento.

## 3. Plano de entrega

Todas as PRs entram na branch `release`; no fim uma PR `release` → `main`. Commits pequenos, cada um compila e passa nos testes.

1. **Levantamento** (este arquivo).
2. **Modelo e regras:** tipo e campos, lista de bancos, validação na importação, totais, saldo, carteira por banco, regras de criação/edição, com testes.
3. **Cadastro:** botão Investimento no popup, banco, valor atual, taxa, campos de gasto escondidos, validação.
4. **Lista e resumo geral:** linha do investimento, ações, cartão "Investido", saldo ajustado, atualizar valor atual.
5. **Saúde financeira e relatórios:** indicadores, cartão de saúde, investido no relatório anual, glossário, README.
