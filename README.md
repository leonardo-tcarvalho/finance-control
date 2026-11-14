# Finance Control

App mobile (React Native + Expo, Android e iOS) de controle de gastos.

## Requisitos do projeto (definidos pelo autor)

1. **App de controle de gastos**, multiplataforma: Android e iOS, com React Native.
2. **100% local**: sem API, sem servidor, sem conta. Todos os dados ficam no dispositivo.
3. **Os dados vivem em um arquivo JSON**, e o app deve garantir que **o usuário nunca perca seus dados**.

## Como o requisito "nunca perder dados" é atendido

- Arquivo principal `data.json` na pasta de documentos do app (`src/storage.ts`).
- Gravação atômica: escreve em arquivo temporário, valida, só então substitui o principal.
- Cópia da versão anterior (`data.prev.json`) a cada gravação.
- Um snapshot por dia em `backups/`, mantendo os 30 mais recentes.
- Na abertura, se o arquivo principal estiver ausente ou corrompido, recupera do `prev` e depois do backup mais recente.
- Exportar/restaurar backup manual via compartilhamento do sistema (Drive, iCloud, Arquivos...) em `src/backup.ts`. É a proteção contra desinstalação ou perda do aparelho.

## Rodando

```bash
npm install
npx expo start   # abra no Expo Go (Android/iOS)
npx tsc --noEmit # typecheck
```

## Estrutura

- `App.tsx`: tela única (resumo do mês, formulário, lista, backup)
- `src/types.ts`: modelo de dados e categorias
- `src/storage.ts`: persistência em JSON com recuperação
- `src/backup.ts`: exportar/importar backup
