import { resolveGatewayWsUrl } from '@bansur/shared'

import type { BansurConnection } from '@/global'

export function resolveDesktopGatewayWsUrl(
  desktop: Window['bansurDesktop'],
  connection: BansurConnection
): Promise<string> {
  // Only a registry-scoped descriptor may use the *For bridge (see
  // BansurConnection.registryScoped); an absent bridge fails closed rather
  // than minting the peer's URL against the local pool.
  const { connectionId, profile, registryScoped } = connection

  if (!registryScoped || !connectionId) {
    return resolveGatewayWsUrl(desktop, connection)
  }

  const mint = desktop.getGatewayWsUrlFor

  return resolveGatewayWsUrl({ getGatewayWsUrl: mint ? () => mint({ connectionId, profile }) : undefined }, connection)
}
