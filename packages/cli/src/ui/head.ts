import type { ClientRuntimeConfig } from "../types";
import type { HeadScript } from "./types";

export interface RemoteScriptsOptions {
	assetsUrl: string;
	runtimeConfig?: ClientRuntimeConfig;
	containerName?: string;
	hydratePath?: string;
}

export function getRemoteEntryScript(assetsUrl: string): HeadScript {
	return {
		src: `${assetsUrl}/remoteEntry.js`,
	};
}

export function getThemeInitScript(): HeadScript {
	return {
		children: `(function(){var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}})();`,
	};
}

export function getHydrateScript(
	runtimeConfig: ClientRuntimeConfig | undefined,
	containerName = "ui",
	hydratePath = "./Hydrate",
): HeadScript {
	return {
		children: `
 window.__RUNTIME_CONFIG__=${JSON.stringify(runtimeConfig)};
 function __hydrate(){
  var container = window['${containerName}'];
  if (!container) {
    console.warn('[Hydrate] Container not ready yet, waiting...');
    window.__hydrateRetry = window.__hydrateRetry || 0;
    if (window.__hydrateRetry < 10) {
      window.__hydrateRetry++;
      setTimeout(__hydrate, 100);
      return;
    }
    console.error('[Hydrate] Container not found after 10 retries');
    return;
  }
  console.log('[Hydrate] Container available, starting init...');
  container.init({}).then(function(){
    return container.get('${hydratePath}');
  }).then(function(mod){
    return mod().hydrate();
  }).catch(function(e){
    console.error('[Hydrate] Failed:', e);
  });
}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',__hydrate);}else{__hydrate();}
    `.trim(),
	};
}

export function getRemoteScripts(options: RemoteScriptsOptions): HeadScript[] {
	const { assetsUrl, runtimeConfig, containerName, hydratePath } = options;

	return [
		getRemoteEntryScript(assetsUrl),
		getThemeInitScript(),
		getHydrateScript(runtimeConfig, containerName, hydratePath),
	];
}

export function getBaseStyles(): string {
	return `
*, *::before, *::after { box-sizing: border-box; }
html { height: 100%; height: 100dvh; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; color-scheme: light dark; }
body { min-height: 100%; min-height: 100dvh; margin: 0; background-color: var(--background); color: var(--foreground); -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
#root { min-height: 100vh; }
@supports (min-height: 100dvh) { #root { min-height: 100dvh; } }
  `.trim();
}
