export interface AccountResolution {
  account: string;
  nearAccount: string;
}

export function extractAccount(
  hostname: string,
  gatewayDomain: string
): AccountResolution | null {
  const gatewayBase = gatewayDomain.replace(/^\./, "");
  const gatewayPrefix = `.${gatewayBase}`;

  if (hostname.endsWith(gatewayPrefix)) {
    const account = hostname.slice(0, -gatewayPrefix.length);
    if (account && !account.includes(".")) {
      return {
        account,
        nearAccount: `${account}.everything.near`,
      };
    }
  }

  if (hostname.endsWith(".near")) {
    const parts = hostname.slice(0, -5).split(".");
    if (parts.length >= 2 && parts[parts.length - 1] === "everything") {
      const account = parts.slice(0, -1).join(".");
      return {
        account,
        nearAccount: hostname,
      };
    }
  }

  return null;
}

export function buildFastFSUrl(nearAccount: string, gatewayDomain: string, path: string): string {
  return `https://${nearAccount}.fastfs.io/fastfs.near/${gatewayDomain}/${path}`;
}

export function buildConfigUrl(nearAccount: string, gatewayDomain: string): string {
  return buildFastFSUrl(nearAccount, gatewayDomain, "bos.config.json");
}

export function buildSecretsUrl(nearAccount: string, gatewayDomain: string): string {
  return buildFastFSUrl(nearAccount, gatewayDomain, "secrets.json");
}
