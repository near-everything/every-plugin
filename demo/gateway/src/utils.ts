export interface AccountResolution {
  subdomain: string | null;
  nearAccount: string;
}

export function extractAccount(
  hostname: string,
  gatewayDomain: string,
  gatewayAccount: string
): AccountResolution | null {
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return {
      subdomain: null,
      nearAccount: gatewayAccount,
    };
  }

  if (hostname.endsWith(".localhost")) {
    const subdomain = hostname.slice(0, -".localhost".length);
    if (subdomain && !subdomain.includes(".")) {
      return {
        subdomain,
        nearAccount: `${subdomain}.${gatewayAccount}`,
      };
    }
  }

  const gatewayBase = gatewayDomain.replace(/^\./, "");

  if (hostname === gatewayBase) {
    return {
      subdomain: null,
      nearAccount: gatewayAccount,
    };
  }

  const gatewayPrefix = `.${gatewayBase}`;
  if (hostname.endsWith(gatewayPrefix)) {
    const subdomain = hostname.slice(0, -gatewayPrefix.length);
    if (subdomain && !subdomain.includes(".")) {
      return {
        subdomain,
        nearAccount: `${subdomain}.${gatewayAccount}`,
      };
    }
  }

  if (hostname.endsWith(".near")) {
    const accountParts = hostname.slice(0, -5).split(".");
    const gatewayParts = gatewayAccount.slice(0, -5).split(".");

    if (accountParts.length > gatewayParts.length) {
      const subdomain = accountParts.slice(0, accountParts.length - gatewayParts.length).join(".");
      return {
        subdomain,
        nearAccount: hostname,
      };
    }

    if (accountParts.join(".") === gatewayParts.join(".")) {
      return {
        subdomain: null,
        nearAccount: hostname,
      };
    }
  }

  return null;
}

export function buildSocialPath(nearAccount: string, gatewayDomain: string, filename: string): string {
  return `${nearAccount}/bos/gateways/${gatewayDomain}/${filename}`;
}

export function buildConfigPath(nearAccount: string, gatewayDomain: string): string {
  return buildSocialPath(nearAccount, gatewayDomain, "bos.config.json");
}

export function buildSecretsPath(nearAccount: string, gatewayDomain: string): string {
  return buildSocialPath(nearAccount, gatewayDomain, "secrets.json");
}
