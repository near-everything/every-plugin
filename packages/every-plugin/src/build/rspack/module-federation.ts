import type { PluginInfo } from './utils';
import { getPluginSharedDependencies } from '../shared-deps';

export function buildSharedDependencies(pluginInfo: PluginInfo) {
  return getPluginSharedDependencies();
}
