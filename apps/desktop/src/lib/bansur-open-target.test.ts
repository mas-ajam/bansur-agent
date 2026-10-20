import { describe, expect, it } from 'vitest'

import {
  normalizeBansurOpenString,
  pathFromBansurDeepLink,
  pathFromOpenDeepLink,
  resolveBansurOpenPath
} from './bansur-open-target'

describe('normalizeBansurOpenString', () => {
  it('accepts hash-router paths and strips a leading hash', () => {
    expect(normalizeBansurOpenString('/index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeBansurOpenString('#/index-network/intent/1')).toBe('/index-network/intent/1')
  })

  it('maps plugin-scoped bansur:// deep links to the same path', () => {
    expect(normalizeBansurOpenString('bansur://index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeBansurOpenString('bansur://index-network/intent/1?focus=true')).toBe(
      '/index-network/intent/1?focus=true'
    )
  })

  it('maps bansur://open/… deep links by stripping the open host', () => {
    expect(normalizeBansurOpenString('bansur://open/index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeBansurOpenString('bansur://open/settings/plugins')).toBe('/settings/plugins')
  })

  it('rejects reserved bansur kinds and unsafe paths', () => {
    expect(normalizeBansurOpenString('bansur://blueprint/morning-brief')).toBeNull()
    expect(normalizeBansurOpenString('bansur://plugin/install')).toBeNull()
    expect(normalizeBansurOpenString('https://example.com/x')).toBeNull()
    expect(normalizeBansurOpenString('/../etc/passwd')).toBeNull()
    expect(normalizeBansurOpenString('index-network')).toBeNull()
  })
})

describe('resolveBansurOpenPath', () => {
  it('merges structured path + params', () => {
    expect(resolveBansurOpenPath({ path: '/index-network/intent/1', params: { focus: 'true' } })).toBe(
      '/index-network/intent/1?focus=true'
    )
  })

  it('resolves href the same as a bare string', () => {
    expect(resolveBansurOpenPath({ href: 'bansur://index-network/intent/1' })).toBe('/index-network/intent/1')
  })
})

describe('pathFromBansurDeepLink', () => {
  it('builds the navigate path from a plugin-scoped deep-link payload', () => {
    expect(pathFromBansurDeepLink('index-network', 'intent/1')).toBe('/index-network/intent/1')
  })

  it('builds the navigate path from bansur://open/… payloads', () => {
    expect(pathFromOpenDeepLink('index-network/intent/1')).toBe('/index-network/intent/1')
    expect(pathFromBansurDeepLink('open', 'agent/42')).toBe('/agent/42')
  })

  it('ignores reserved kinds', () => {
    expect(pathFromBansurDeepLink('blueprint', 'morning-brief')).toBeNull()
    expect(pathFromBansurDeepLink('plugin', 'install')).toBeNull()
  })
})
