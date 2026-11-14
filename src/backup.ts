import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { AppData } from './types';
import { parseData } from './storage';

/** Opens the share sheet so the user can save the JSON to Drive/iCloud/Files/WhatsApp, etc. */
export async function exportBackup(data: AppData): Promise<void> {
  const f = new File(Paths.cache, `finance-control-backup-${new Date().toISOString().slice(0, 10)}.json`);
  if (f.exists) f.delete();
  f.create();
  f.write(JSON.stringify(data, null, 2));
  if (!(await Sharing.isAvailableAsync())) throw new Error('Compartilhamento indisponível neste dispositivo');
  await Sharing.shareAsync(f.uri, { mimeType: 'application/json', dialogTitle: 'Salvar backup' });
}

/** Lets the user pick a previously exported JSON file. Returns null if cancelled. */
export async function pickBackup(): Promise<AppData | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/*', '*/*'], copyToCacheDirectory: true });
  if (res.canceled) return null;
  return parseData(await new File(res.assets[0].uri).text());
}
