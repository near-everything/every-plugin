export function getNearAccountId(linkedAccounts: any[]): string | null {
  const nearAccount = linkedAccounts.find(account => account.providerId === 'siwn');
  return (nearAccount?.accountId)?.split(":")[0] || nearAccount?.providerId || null;
}

export function getLinkedProviders(linkedAccounts: any[]): string[] {
  return linkedAccounts.map(account => account.providerId);
}

export function handleAccountLinkRefresh(
  _componentState: any,
  _setLinkedAccounts: React.Dispatch<React.SetStateAction<any[]>>,
  refreshAccounts: () => Promise<void>
) {
  refreshAccounts();

  const urlParams = new URLSearchParams(window.location.search);
  const hasCallback = urlParams.has('code') || urlParams.has('state') || urlParams.has('callbackUrl');

  if (hasCallback) {
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState(null, '', cleanUrl);

    setTimeout(() => {
      refreshAccounts();
    }, 1000);
  }

  return refreshAccounts;
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
