# Controle de Gastos

App pessoal de controle financeiro, 100% local, que registra o que entra e o que sai, acompanha cartões de crédito e mostra relatórios do mês.

## Linguagem

### Lançamentos

**Lançamento**:
Um registro de dinheiro que saiu, entrou ou voltou, com data, valor, categoria e forma de pagamento.
_Evitar_: Transação, movimentação

**Gasto**:
Lançamento de dinheiro que saiu.
_Evitar_: Despesa, saída (use "Gastos" também para o total mostrado no mês)

**Receita**:
Lançamento de dinheiro que entrou.
_Evitar_: Entrada, ganho

**Estorno**:
Lançamento de dinheiro devolvido por um gasto anterior; abate os gastos em vez de somar às receitas.
_Evitar_: Reembolso, devolução

**Compra parcelada**:
Um gasto cujo valor total é dividido em vários meses, uma parcela por mês.
_Evitar_: Parcelamento

**Lançamento recorrente**:
Um lançamento que repete o mesmo valor todo mês, por uma quantidade de meses definida pela pessoa.
_Evitar_: Assinatura, fixo

### Cartões

**Cartão**:
Cartão de crédito cadastrado, com nome e, opcionalmente, limite, dia de fechamento e dia de vencimento.

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
