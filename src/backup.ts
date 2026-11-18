import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { AppData } from './types';
import { parseData, rescueFile } from './storage';
import { today } from './utils';

/** Opens the share sheet so the user can save the JSON to Drive/iCloud/Files/WhatsApp, etc. */
export async function exportBackup(data: AppData): Promise<void> {
  const f = new File(Paths.cache, `finance-control-backup-${today()}.json`);
  if (f.exists) f.delete();
  f.create();
  await f.write(JSON.stringify(data, null, 2)); // async: must finish before sharing
  if (!(await Sharing.isAvailableAsync())) throw new Error('Compartilhamento indisponível neste dispositivo');
  await Sharing.shareAsync(f.uri, { mimeType: 'application/json', dialogTitle: 'Salvar backup' });
}

/** Lets the user pick a previously exported JSON file. Returns null if cancelled. */
export async function pickBackup(): Promise<AppData | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/*', '*/*'], copyToCacheDirectory: true });
  if (res.canceled) return null;
  const text = await new File(res.assets[0].uri).text();
  try {
    return parseData(text);
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error('O arquivo não é um backup válido do app.');
    throw e;
  }
}

/** For the load-error screen: shares the raw data file untouched so it can be kept or inspected. */
export async function shareRawData(): Promise<void> {
  const f = rescueFile();
  if (!f) throw new Error('Nenhum arquivo de dados encontrado');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Compartilhamento indisponível neste dispositivo');
  await Sharing.shareAsync(f.uri, { mimeType: 'application/json', dialogTitle: 'Salvar arquivo de dados' });
}
