# Finance Control

App mobile (React Native + Expo, Android e iOS) de controle de gastos.

## Requisitos do projeto (definidos pelo autor)

1. **App de controle de gastos**, multiplataforma: Android e iOS, com React Native.
2. **100% local**: sem API, sem servidor, sem conta. Todos os dados ficam no dispositivo.
3. **Os dados vivem em um arquivo JSON**, e o app deve garantir que **o usuário nunca perca seus dados**.

## Baixar o app (Android)

O APK da versão atual fica nas [Releases](https://github.com/leonardo-tcarvalho/finance-control/releases/latest) do repositório: baixe o arquivo `Controle-de-Gastos-v1.0.0.apk` e instale no celular.

- Ao abrir o arquivo, o Android pede para liberar a instalação de "fontes desconhecidas" para o navegador ou app de arquivos usado. É normal para um app fora da Play Store.
- Uma versão nova instala por cima da anterior e mantém os dados, porque todas usam a mesma chave de assinatura.
- Os dados ficam só no aparelho. Use **Exportar backup** no menu antes de desinstalar ou trocar de celular.
- iOS: ainda não há versão instalável. Dá para testar pelo Expo Go (`npx expo start`).

## O que o app faz

- **Principal:** Receitas, Gastos e Saldo do mês, lista de lançamentos com busca e filtro por categoria, aviso de vencidos.
- **Lançamentos:** gasto e receita, com data, categoria e forma de pagamento (Pix, Débito, Dinheiro, Boleto, Outro ou cartão). Os gastos podem ser parcelados (informando quantas parcelas já foram pagas, se a compra já estava em andamento) ou recorrentes por um número de meses. Uma compra no cartão aparece no mês da fatura. O investimento tem só data, valor, banco e, se você quiser, valor atual e taxa.
- **Investimentos:** terceiro tipo de lançamento, com banco, valor aplicado e valor atual informado por você (o rendimento é a diferença). Não conta como gasto nem receita, mas o Saldo desconta o que foi aplicado. A Principal mostra o investido no mês e a carteira.
- **Saúde financeira:** nos Relatórios, taxa de poupança, parte da renda aplicada e reserva de emergência em meses de gasto e, quando o mês tem renda e parcelas, a parte da renda comprometida com parcelas; o relatório anual mostra o investido no ano e onde a carteira está.
- **Pendente e pago:** todo gasto nasce pendente. Gastos sem cartão podem ser marcados como pagos e ter vencimento; passado o vencimento sem pagar, a linha fica vermelha.
- **Cartões:** limite, dia de fechamento e dia de vencimento obrigatórios. Cada cartão mostra a fatura do mês, o limite disponível e um botão para marcar a fatura como paga; uma compra no cartão só deixa de ser pendente quando a fatura é paga.
- **Relatórios:** gastos por categoria, por forma de pagamento e dos últimos meses.
- **Limites opcionais:** no menu, em Opções, você define uma meta de gastos do mês (valor em reais, contando todos os gastos do mês, pagos ou pendentes) e um limite de parcelas na renda (porcentagem de 1 a 100). A meta aparece nos Relatórios com barra de progresso e aviso a partir de 80% e ao passar; o limite é comparado na linha de parcelas da Saúde financeira. Sem meta definida, o card da meta não aparece; sem limite, a linha de parcelas aparece sem comparação. Eles ficam nos dados e entram no backup.
- **Relatório anual:** totais e média mensal do ano, meses de maior e menor gasto, gráfico dos 12 meses, categorias, forma de pagamento, maiores gastos e quanto veio de parcelas, recorrências e compras avulsas (só leitura).
- **Menu lateral:** Principal, Relatórios, Relatório anual, cartões (do maior limite ao menor), tema claro/escuro, meta de gastos e limite de parcelas, exportar e restaurar backup.

As regras de negócio e o vocabulário estão em [`GLOSSARY.md`](./GLOSSARY.md). Ideias adiadas ficam em [`docs/PENDENCIAS.md`](./docs/PENDENCIAS.md).

## Como o requisito "nunca perder dados" é atendido

- Arquivo principal `data.json` na pasta de documentos do app (`src/services/storage.ts`).
- Gravação atômica: escreve em arquivo temporário, valida, só então substitui o principal.
- Cópia da versão anterior (`data.prev.json`) a cada gravação.
- Um snapshot por dia em `backups/`, mantendo os 30 mais recentes.
- Na abertura, se o arquivo principal estiver ausente ou corrompido, recupera do `prev` e depois do backup mais recente.
- Exportar/restaurar backup manual via compartilhamento do sistema (Drive, iCloud, Arquivos...) em `src/services/backup.ts`. O arquivo inteiro é exportado e restaurado. É a proteção contra desinstalação ou perda do aparelho.
- Arquivos antigos continuam abrindo: campos novos são opcionais, e um gasto sem situação conta como pago.

## Rodando

```bash
npm install
npx expo start   # abra no Expo Go (Android/iOS)
npx tsc --noEmit # typecheck
```

## Estrutura

```
App.tsx, index.ts        entrada do Expo
src/domain/             regra de negócio pura (types, calc, ops, status) e seus testes
src/services/           persistência e backup (arquivos do aparelho)
src/utils/              dinheiro, datas e formatação
src/theme/              paletas clara e escura
src/components/common/  peças reutilizáveis (Field, Sheet, Drawer, Icons)
src/components/modals/  popups (EntryModal, CardModal, RowActions)
src/screens/            telas de Relatórios e Relatório anual
```

Os testes ficam ao lado do código que testam (`*.test.ts`).


- `App.tsx`: tela principal, navegação e ligação entre as partes
- `src/domain/types.ts`: modelo de dados
- `src/services/storage.ts`: persistência em JSON com recuperação
- `src/services/backup.ts`: exportar/importar backup
- `src/domain/calc.ts`: totais, faturas, limite, filtros e agregações dos relatórios
- `src/domain/status.ts`: pendente, pago, vencimento, vencido e Saldo
- `src/domain/ops.ts`: criar e editar lançamentos (parcelas, recorrência, situação)
- `src/utils/index.ts`: datas, dinheiro e formatação
- `src/theme/index.ts`: paletas clara e escura
- `src/components/common/Drawer.tsx`, `src/components/common/Sheet.tsx`, `src/components/common/Field.tsx`: menu lateral, popup e campo de texto reutilizáveis
- `src/components/modals/EntryModal.tsx`, `src/components/modals/CardModal.tsx`: formulários de lançamento e de cartão
- `src/screens/Summary.tsx`: tela de Relatórios
- `GLOSSARY.md`, `docs/PENDENCIAS.md`: vocabulário do domínio e pendências futuras
