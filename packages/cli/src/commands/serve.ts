import { startService } from '@tooned/service';

export async function runServe(): Promise<void> {
  await startService();
}
