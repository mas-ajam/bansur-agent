import type { Usage } from '@bansur/shared/gateway-events'

export { usageFromTick } from '@bansur/shared/usage-tick'

export const ZERO: Usage = { calls: 0, input: 0, output: 0, total: 0 }
