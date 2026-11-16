# Controle de Gastos

App pessoal de controle financeiro, 100% local, que registra o que entra e o que sai, acompanha cartões de crédito e mostra relatórios do mês.

## Linguagem

### Lançamentos

**Lançamento**:
Um registro de dinheiro que saiu, entrou ou voltou, com data, valor, categoria e forma de pagamento.
_Evitar_: Transação, movimentação

**Gasto**:
Lançamento de dinheiro que saiu. "Gastos" também é a soma de todos os gastos do mês, pagos ou não.
_Evitar_: Despesa, saída

**Receita**:
Lançamento de dinheiro que entrou. Só é registrada quando o dinheiro realmente entrou, por isso não tem situação de pendente. "Receitas" também é a soma de todas as receitas do mês.
_Evitar_: Entrada, ganho

**Pendente**:
Situação de um gasto que ainda não foi pago. Todo gasto nasce pendente, exceto os pagos por Pix, que nascem pagos. Estornos e receitas não têm situação.
_Evitar_: A pagar, em aberto

**Pago**:
Situação de um gasto cujo dinheiro já saiu. Uma compra no cartão de crédito só fica paga quando a fatura inteira é marcada como paga.
_Evitar_: Quitado, liquidado

**Vencimento**:
A data em que um gasto deve ser pago. Numa compra no cartão é sempre o vencimento da fatura; nos demais gastos a pessoa pode informá-lo, e o Pix não tem.
_Evitar_: Prazo, data de pagamento

**Vencido**:
Gasto pendente cuja data de vencimento já passou.
_Evitar_: Atrasado

**Saldo**:
As receitas do mês menos os gastos do mês que não estão pendentes; muda conforme os gastos são marcados como pagos.
_Evitar_: Balanço, resultado

**Estorno**:
Lançamento de dinheiro devolvido por um gasto anterior; abate os gastos em vez de somar às receitas.
_Evitar_: Reembolso, devolução

**Compra parcelada**:
Um gasto cujo valor total é dividido em vários meses, uma parcela por mês.
_Evitar_: Parcelamento

**Lançamento recorrente**:
Um gasto que repete o mesmo valor todo mês, por uma quantidade de meses definida pela pessoa, como um boleto pago em partes. Receitas não se repetem.
_Evitar_: Assinatura, fixo

### Cartões

**Cartão**:
Cartão de crédito cadastrado, com nome, limite, dia de fechamento e dia de vencimento, todos obrigatórios.

**Fatura**:
O conjunto de compras de um cartão que fecham no mesmo mês; uma compra feita depois do dia de fechamento entra na fatura seguinte.
_Evitar_: Extrato, boleto do cartão

### Navegação

**Menu lateral**:
O painel que abre pelo lado da tela e reúne os cartões, os relatórios, o tema e as demais opções do app.
_Evitar_: Barra inferior, tabbar, sidebar, abas

**Relatórios**:
A tela dos gráficos e das informações resumidas do mês.
_Evitar_: Resumo, resumos, dashboard
