export function getNearAccountId(linkedAccounts: any[]): string | null {
  const nearAccount = linkedAccounts.find(account => account.providerId === 'siwn');
  return (nearAccount?.accountId)?.split(":")[0] || nearAccount?.providerId || null;
}

export function getProviderConfig(provider: string) {
  switch (provider) {
    case 'siwn':
      return {
        name: 'NEAR',
        icon: '🔗',
        color: 'text-white',
        backgroundColor: 'bg-[#000000]'
      };
    default:
      return {
        name: provider?.charAt(0).toUpperCase() + provider?.slice(1) || "Unknown",
        icon: '🔗',
        color: 'text-muted-foreground',
        backgroundColor: 'bg-gray-100'
      };
  }
}
