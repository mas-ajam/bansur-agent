import { vi } from 'vitest'

import type { BansurApiRequest } from '@/global'

/** Install a fake `window.bansurDesktop.api`, the preload bridge every REST helper sends through. */
export function installRestBridge(answer: (request: BansurApiRequest) => object) {
  const api = vi.fn(async (request: BansurApiRequest) => answer(request))

  Object.defineProperty(window, 'bansurDesktop', { configurable: true, value: { api } })

  return api
}
