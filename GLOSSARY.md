# Controle de Gastos

App pessoal de controle financeiro, 100% local, que registra o que entra e o que sai, acompanha cartões de crédito e investimentos e mostra relatórios do mês e do ano.

## Linguagem

### Lançamentos

**Lançamento**:
Um registro de dinheiro que saiu, entrou ou foi aplicado, com data, valor, categoria e forma de pagamento.
_Evitar_: Transação, movimentação

**Gasto**:
Lançamento de dinheiro que saiu. "Gastos" também é a soma de todos os gastos do mês, pagos ou não.
_Evitar_: Despesa, saída

**Receita**:
Lançamento de dinheiro que entrou. Só é registrada quando o dinheiro realmente entrou, por isso não tem situação de pendente. Não tem categoria para escolher e a descrição, obrigatória, diz o que é. "Receitas" também é a soma de todas as receitas do mês.
_Evitar_: Entrada, ganho

**Investimento**:
Lançamento de dinheiro aplicado, com banco, valor aplicado e data. Não é gasto nem receita: não entra em Gastos nem em Receitas, mas sai do Saldo, porque o dinheiro deixou a conta. Não tem cartão, forma de pagamento, parcelas, vencimento nem situação de pendente. Pode ter uma taxa, que é só uma anotação.
_Evitar_: Aplicação, aporte

**Valor atual**:
Quanto um investimento vale hoje, informado pela pessoa; o app não calcula índices nem cotações. Sem valor atual, o investimento conta pelo valor aplicado.
_Evitar_: Saldo do investimento, cotação

**Rendimento**:
O valor atual menos o valor aplicado de um investimento, e a porcentagem sobre o aplicado. Sem valor atual, é zero.
_Evitar_: Lucro, juros

**Carteira**:
O conjunto de todos os investimentos, de todos os meses, agrupados por banco, com o total aplicado, o valor atual e o rendimento.
_Evitar_: Portfólio

**Taxa de poupança**:
A parte da receita do mês que sobrou depois dos gastos: (receitas − gastos) ÷ receitas. Fica negativa quando os gastos passam da renda; sem receita não existe.
_Evitar_: Economia

**Reserva de emergência**:
Quantos meses de gastos a carteira cobre: o valor atual de todos os investimentos dividido pela média mensal de gastos dos últimos 6 meses (só meses com gasto). Abaixo de 3 meses é baixa, de 3 a 6 é boa, 6 ou mais é ótima. É um indicador, não um conselho financeiro.
_Evitar_: Colchão

**Pendente**:
Situação de um gasto que ainda não foi pago. Todo gasto nasce pendente, inclusive o pago por Pix. Receitas não têm situação.
_Evitar_: A pagar, em aberto

**Pago**:
Situação de um gasto cujo dinheiro já saiu. Uma compra no cartão de crédito só fica paga quando a fatura inteira é marcada como paga.
_Evitar_: Quitado, liquidado

**Vencimento**:
A data em que um gasto deve ser pago. Numa compra no cartão é sempre o vencimento da fatura; nos demais gastos a pessoa pode informá-lo; sem ele vale a data do lançamento.
_Evitar_: Prazo, data de pagamento

**Vencido**:
Gasto pendente cuja data de vencimento já passou.
_Evitar_: Atrasado

**Saldo**:
As receitas do mês menos os gastos do mês que não estão pendentes e menos o que foi investido no mês; muda conforme os gastos são marcados como pagos.
_Evitar_: Balanço, resultado

**Compra parcelada**:
Um gasto pago em várias parcelas, uma por mês. Informa-se o valor da parcela e o número de parcelas, e o total é parcela × número. Se parte já estava paga ao cadastrar, o app cria só as parcelas que faltam, numeradas a partir da próxima.
_Evitar_: Parcelamento

**Lançamento recorrente**:
Um gasto que repete o mesmo valor todo mês, por uma quantidade de meses definida pela pessoa, como um boleto pago em partes. Receitas não se repetem.
_Evitar_: Assinatura, fixo

### Cartões

**Cartão**:
Cartão de crédito cadastrado, com nome, limite, dia de fechamento e dia de vencimento, todos obrigatórios.

**Fatura**:
O conjunto de compras de um cartão que fecham no mesmo mês; uma compra feita depois do dia de fechamento entra na fatura seguinte. A compra aparece no mês da sua fatura, e não no mês em que foi cadastrada.
_Evitar_: Extrato, boleto do cartão

### Navegação

**Menu lateral**:
O painel que abre pelo lado da tela e reúne os cartões, os relatórios, o tema e as demais opções do app.
_Evitar_: Barra inferior, tabbar, sidebar, abas

**Relatórios**:
A tela dos gráficos e das informações resumidas do mês.
_Evitar_: Resumo, resumos, dashboard

**Relatório anual**:
A tela com os totais, médias e gráficos do ano inteiro, contando cada lançamento no ano do seu mês de referência; só leitura.
