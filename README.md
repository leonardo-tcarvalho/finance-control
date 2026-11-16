# Finance Control

App mobile (React Native + Expo, Android e iOS) de controle de gastos.

## Requisitos do projeto (definidos pelo autor)

1. **App de controle de gastos**, multiplataforma: Android e iOS, com React Native.
2. **100% local**: sem API, sem servidor, sem conta. Todos os dados ficam no dispositivo.
3. **Os dados vivem em um arquivo JSON**, e o app deve garantir que **o usuário nunca perca seus dados**.

## O que o app faz

- **Principal:** Receitas, Gastos e Saldo do mês, lista de lançamentos com busca e filtro por categoria, aviso de vencidos.
- **Lançamentos:** gasto, receita e estorno, com data, categoria e forma de pagamento (Pix, Débito, Dinheiro, Boleto, Outro ou cartão). Podem ser parcelados ou recorrentes por um número de meses.
- **Pendente e pago:** todo gasto nasce pendente, exceto Pix. Gastos sem cartão têm uma bolinha para marcar como pago e podem ter vencimento; passado o vencimento sem pagar, a linha fica vermelha.
- **Cartões:** limite, dia de fechamento e dia de vencimento obrigatórios. Cada cartão mostra a fatura do mês, o limite disponível e um botão para marcar a fatura como paga; uma compra no cartão só deixa de ser pendente quando a fatura é paga.
- **Relatórios:** gastos por categoria, por forma de pagamento e dos últimos meses.
- **Menu lateral:** Principal, Relatórios, cartões (do maior limite ao menor), tema claro/escuro, exportar e restaurar backup.

As regras de negócio e o vocabulário estão em [`GLOSSARY.md`](./GLOSSARY.md). Ideias adiadas ficam em [`docs/PENDENCIAS.md`](./docs/PENDENCIAS.md).

## Como o requisito "nunca perder dados" é atendido

- Arquivo principal `data.json` na pasta de documentos do app (`src/storage.ts`).
- Gravação atômica: escreve em arquivo temporário, valida, só então substitui o principal.
- Cópia da versão anterior (`data.prev.json`) a cada gravação.
- Um snapshot por dia em `backups/`, mantendo os 30 mais recentes.
- Na abertura, se o arquivo principal estiver ausente ou corrompido, recupera do `prev` e depois do backup mais recente.
- Exportar/restaurar backup manual via compartilhamento do sistema (Drive, iCloud, Arquivos...) em `src/backup.ts`. O arquivo inteiro é exportado e restaurado. É a proteção contra desinstalação ou perda do aparelho.
- Arquivos antigos continuam abrindo: campos novos são opcionais, e um gasto sem situação conta como pago.

## Rodando

```bash
npm install
npx expo start   # abra no Expo Go (Android/iOS)
npx tsc --noEmit # typecheck
```

## Estrutura

- `App.tsx`: tela principal, navegação e ligação entre as partes
- `src/types.ts`: modelo de dados
- `src/storage.ts`: persistência em JSON com recuperação
- `src/backup.ts`: exportar/importar backup
- `src/calc.ts`: totais, faturas, limite, filtros e agregações dos relatórios
- `src/status.ts`: pendente, pago, vencimento, vencido e Saldo
- `src/ops.ts`: criar e editar lançamentos (parcelas, recorrência, situação)
- `src/utils.ts`: datas, dinheiro e formatação
- `src/theme.ts`: paletas clara e escura
- `src/Drawer.tsx`, `src/Sheet.tsx`, `src/Field.tsx`: menu lateral, popup e campo de texto reutilizáveis
- `src/EntryModal.tsx`, `src/CardModal.tsx`: formulários de lançamento e de cartão
- `src/Summary.tsx`: tela de Relatórios
- `GLOSSARY.md`, `docs/PENDENCIAS.md`: vocabulário do domínio e pendências futuras
