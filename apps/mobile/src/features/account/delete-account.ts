import { apiClient } from '@/api/client';

/** Asks the API to delete the signed-in Account and everything we hold for it. Safe to retry. */
export async function deleteAccountOnServer(): Promise<void> {
  const response = await apiClient.account.$delete();
  if (!response.ok) throw new Error(`Account deletion responded ${response.status}`);
}
