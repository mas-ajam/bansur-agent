import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'

import type { DesktopProfileRoute } from './desktop-profile'
import type { HudModifierApi, HudModifierStatus } from './hud-modifier-types'
import { customWindowControlsEnabled } from './window-controls'

// Which translucency the OS can back. Asked synchronously because the renderer
// needs it before its first paint, and answered by main because deciding it
// needs `os.release()` — a sandboxed preload may only require electron, events,
// timers and url, so importing node:os here throws before contextBridge runs
// and takes the ENTIRE bridge down with it (window.bansurDesktop undefined =>
// "Desktop IPC bridge is unavailable"). No reply means no glass, which degrades
// to an ordinary opaque window rather than a page thinned over nothing.
const translucencySupport = ipcRenderer.sendSync('bansur:translucency:support')
const hudWindowing = ipcRenderer.sendSync('bansur:hud:windowing')
const hudNativeDrag = hudWindowing?.nativeDrag === true

const launchFlags: { localModels?: boolean; assumeFreshInstall?: boolean } | undefined =
  ipcRenderer.sendSync('bansur:feature-flags')

// Local, sanitized skin payload for the first renderer theme paint. This does
// not wait on `gateway.ready`, so an unreachable remote primary cannot force
// the built-in palette over the skin configured on this machine.
const localSkin = ipcRenderer.sendSync('bansur:skin:local')

import { unwrapExpectedNotFound } from './api-expected-404'

contextBridge.exposeInMainWorld('bansurDesktop', {
  glassSupported: translucencySupport?.glass === true,
  translucencySupported: translucencySupport?.translucency === true,
  // Launch-flag fact: the app was started with --local, so the renderer may
  // show the local-models surfaces. Static for the window's lifetime.
  localModelsEnabled: launchFlags?.localModels === true,
  // Dev-only launch fact: an unpackaged app started with --fresh-install, so
  // onboarding treats this launch as a fresh install. Always false when packaged.
  assumeFreshInstall: launchFlags?.assumeFreshInstall === true,
  localSkin: localSkin && typeof localSkin === 'object' ? localSkin : null,
  getConnection: (profile, opts) => ipcRenderer.invoke('bansur:connection', profile, opts),
  // Loopback origin that hosts YouTube's player for the file:// renderer.
  getEmbedHostOrigin: () => ipcRenderer.invoke('bansur:embed-host:origin'),
  // Registry-scoped backend resolution: { connectionId, profile } → descriptor.
  getConnectionFor: payload => ipcRenderer.invoke('bansur:connection:for', payload),
  getProfileRoutes: profiles => ipcRenderer.invoke('bansur:plugin-profile-routes', profiles),
  revalidateConnection: () => ipcRenderer.invoke('bansur:connection:revalidate'),
  getGatewayWsUrl: profile => ipcRenderer.invoke('bansur:gateway:ws-url', profile),
  // Registry-scoped fresh WS URL: { connectionId, profile } → result shape of
  // getGatewayWsUrl, minted against that connection's backend.
  getGatewayWsUrlFor: payload => ipcRenderer.invoke('bansur:gateway:ws-url-for', payload),
  // { connectionId, profile, pluginId, path } → one-use local plugin socket URL, null, or { refused: 'permission' }.
  getPluginWsUrl: payload => ipcRenderer.invoke('bansur:plugin:ws-url', payload),
  // Union agent roster across every registered connection.
  getAgentRoster: () => ipcRenderer.invoke('bansur:agents:roster'),
  openSessionWindow: (sessionId, opts) => ipcRenderer.invoke('bansur:window:openSession', sessionId, opts),
  openSessionInTerminal: (sessionId, opts) => ipcRenderer.invoke('bansur:window:openInTerminal', sessionId, opts),
  openWindow: (options?: DesktopProfileRoute) => ipcRenderer.invoke('bansur:window:openInstance', options),
  openBrowserWindow: tabId => ipcRenderer.invoke('bansur:window:openBrowser', tabId),
  windowRelay: {
    send: payload => ipcRenderer.send('bansur:window:relay', payload),
    onMessage: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('bansur:window:relay', listener)

      return () => ipcRenderer.removeListener('bansur:window:relay', listener)
    }
  },
  onBrowserPopoutClosed: callback => {
    const listener = (_event, tabId) => callback(tabId)
    ipcRenderer.on('bansur:browser-popout:closed', listener)

    return () => ipcRenderer.removeListener('bansur:browser-popout:closed', listener)
  },
  claimAmbientCue: key => ipcRenderer.invoke('bansur:ambient:claim', key),
  windowControls: {
    custom: customWindowControlsEnabled(),
    minimize: () => ipcRenderer.send('bansur:window-control', 'minimize'),
    toggleMaximize: () => ipcRenderer.send('bansur:window-control', 'toggle-maximize'),
    close: () => ipcRenderer.send('bansur:window-control', 'close')
  },
  wakeIndicator: {
    getState: () => ipcRenderer.invoke('bansur:wake-indicator:get'),
    setState: state => ipcRenderer.send('bansur:wake-indicator:set', state),
    onState: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('bansur:wake-indicator:state', listener)

      return () => ipcRenderer.removeListener('bansur:wake-indicator:state', listener)
    }
  },
  chatOnboarding: {
    size: mode => ipcRenderer.send('bansur:window:size', mode)
  },
  petOverlay: {
    // Main renderer → main process: window lifecycle + drag. `request` is
    // `{ bounds, screen }`; resolves with the screen bounds it actually used.
    open: request => ipcRenderer.invoke('bansur:pet-overlay:open', request),
    close: () => ipcRenderer.invoke('bansur:pet-overlay:close'),
    setBounds: bounds => ipcRenderer.send('bansur:pet-overlay:set-bounds', bounds),
    setIgnoreMouse: ignore => ipcRenderer.send('bansur:pet-overlay:ignore-mouse', ignore),
    // Flip the overlay focusable (and focus it) while the composer needs keys.
    setFocusable: focusable => ipcRenderer.send('bansur:pet-overlay:set-focusable', focusable),
    // Main renderer → overlay (forwarded by main): push the latest pet state.
    pushState: payload => ipcRenderer.send('bansur:pet-overlay:state', payload),
    // Overlay → main renderer (forwarded by main): pop back in / composer submit.
    control: payload => ipcRenderer.send('bansur:pet-overlay:control', payload),
    // Overlay subscribes to state pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('bansur:pet-overlay:state', listener)

      return () => ipcRenderer.removeListener('bansur:pet-overlay:state', listener)
    },
    // Main renderer subscribes to overlay control messages.
    onControl: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('bansur:pet-overlay:control', listener)

      return () => ipcRenderer.removeListener('bansur:pet-overlay:control', listener)
    }
  },
  // HUD mode: the chrome-free floating chat. A full app renderer (own gateway)
  // sized as a floating bar, so it mounts the real composer. Main owns the
  // window; `onChanged` keeps every window's toggle truthful.
  hud: {
    nativeDrag: hudNativeDrag,
    windowing: {
      clientPlacement: hudWindowing?.clientPlacement !== false,
      controlDrag: hudWindowing?.controlDrag === true,
      nativeDrag: hudNativeDrag,
      solid: hudWindowing?.solid === true,
      workspaceTransfer: hudWindowing?.workspaceTransfer === true
    },
    open: request => ipcRenderer.invoke('bansur:hud:open', request),
    close: () => ipcRenderer.invoke('bansur:hud:close'),
    setIgnoreMouse: ignore => ipcRenderer.send('bansur:hud:ignore-mouse', ignore),
    beginMove: () => ipcRenderer.send('bansur:hud:begin-move'),
    endMove: () => ipcRenderer.send('bansur:hud:end-move'),
    moveBy: delta => ipcRenderer.send('bansur:hud:move-by', delta),
    setWorkspaceTransfer: transferring => ipcRenderer.send('bansur:hud:workspace-transfer', transferring),
    setBounds: bounds => ipcRenderer.send('bansur:hud:set-bounds', bounds),
    resetLayout: () => ipcRenderer.invoke('bansur:hud:reset-layout'),
    // Whether the band covers the window below the bar. Main pairs it with the
    // user's translucency setting to decide the native frost (macOS vibrancy /
    // Windows 11 DWM backdrop) — see hudFrostFor.
    setFrost: showing => ipcRenderer.invoke('bansur:hud:frost', showing),
    // The HUD tells main which session it is on; main hands that back to the
    // app window when the HUD closes, so the app can re-home onto it.
    setSession: sessionId => ipcRenderer.send('bansur:hud:session', sessionId),
    onGoto: callback => {
      const listener = (_event, sessionId) => callback(sessionId)
      ipcRenderer.on('bansur:hud:goto', listener)

      return () => ipcRenderer.removeListener('bansur:hud:goto', listener)
    },
    onChanged: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('bansur:hud:changed', listener)

      return () => ipcRenderer.removeListener('bansur:hud:changed', listener)
    },
    // Linux only, and silent elsewhere: where the cursor is, in page
    // coordinates, or null when it has left the window. Stands in for the
    // mousemove that `setIgnoreMouseEvents(true, { forward: true })` delivers on
    // macOS and Windows but not here.
    onCursor: callback => {
      const listener = (_event, point) => callback(point)
      ipcRenderer.on('bansur:hud:cursor', listener)

      return () => ipcRenderer.removeListener('bansur:hud:cursor', listener)
    },
    // Main's game-overlay watch: whether a fullscreen app (a game) is under
    // the HUD, so the renderer can step back to the low-opacity overlay
    // treatment while one owns the screen.
    onGameOverlay: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('bansur:hud:game-overlay', listener)

      return () => ipcRenderer.removeListener('bansur:hud:game-overlay', listener)
    }
  },
  hudModifier: {
    getSettings: () => ipcRenderer.invoke('bansur:hud-modifier:settings:get'),
    setEnabled: enabled => ipcRenderer.invoke('bansur:hud-modifier:settings:set', enabled),
    openPermissionSettings: () => ipcRenderer.invoke('bansur:hud-modifier:permission'),
    onStatus: callback => {
      const listener = (_event: Electron.IpcRendererEvent, status: HudModifierStatus) => callback(status)
      ipcRenderer.on('bansur:hud-modifier:status', listener)

      return () => ipcRenderer.removeListener('bansur:hud-modifier:status', listener)
    }
  } satisfies HudModifierApi,
  // macOS native screenshot gesture; captures require a main-issued request.
  screenshot:
    process.platform === 'darwin'
      ? {
          getSettings: () => ipcRenderer.invoke('bansur:screenshot:settings:get'),
          setEnabled: enabled => ipcRenderer.invoke('bansur:screenshot:settings:set', enabled),
          openPermissionSettings: kind => ipcRenderer.invoke('bansur:screenshot:permission', kind),
          capture: requestId => ipcRenderer.invoke('bansur:screenshot:capture', requestId),
          onStatus: callback => {
            const listener = (_event, status) => callback(status)
            ipcRenderer.on('bansur:screenshot:status', listener)

            return () => ipcRenderer.removeListener('bansur:screenshot:status', listener)
          },
          onRequest: callback => {
            const channel = 'bansur:screenshot:request'
            const listener = (_event, requestId) => callback(requestId)

            if (ipcRenderer.listenerCount(channel) === 0) {
              ipcRenderer.send('bansur:screenshot:subscribe', true)
            }

            ipcRenderer.on(channel, listener)

            return () => {
              ipcRenderer.removeListener(channel, listener)

              if (ipcRenderer.listenerCount(channel) === 0) {
                ipcRenderer.send('bansur:screenshot:subscribe', false)
              }
            }
          }
        }
      : undefined,
  // Quick Entry: the global-hotkey mini composer window. Main owns the OS
  // shortcut + the persisted preference; the quick window only captures text
  // and hands it back, and the primary renderer submits it through the normal
  // prompt path.
  quickEntry: {
    getSettings: () => ipcRenderer.invoke('bansur:quick-entry:settings:get'),
    setSettings: patch => ipcRenderer.invoke('bansur:quick-entry:settings:set', patch),
    // Invoke returns the delivery result so the draft is not lost (#85590).
    submit: payload => ipcRenderer.invoke('bansur:quick-entry:submit', payload),
    // Main cannot invoke the primary renderer, so it receives this ack (#85590).
    ackSubmit: (correlationId, result) => ipcRenderer.send('bansur:quick-entry:ack', { correlationId, result }),
    dismiss: () => ipcRenderer.send('bansur:quick-entry:dismiss'),
    // Primary renderer → main → quick window: gateway connection state + the
    // recent-session options the target picker offers. Main caches the latest
    // payload so a freshly spawned quick window starts from truth.
    pushState: payload => ipcRenderer.send('bansur:quick-entry:state', payload),
    // Quick window subscribes to those pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('bansur:quick-entry:state', listener)

      return () => ipcRenderer.removeListener('bansur:quick-entry:state', listener)
    },
    // Main → primary renderer: a submit captured by the quick window.
    onSubmit: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('bansur:quick-entry:submit', listener)

      return () => ipcRenderer.removeListener('bansur:quick-entry:submit', listener)
    },
    // Main → quick window: you were just summoned (reset draft + refocus).
    onShown: callback => {
      const listener = () => callback()
      ipcRenderer.on('bansur:quick-entry:shown', listener)

      return () => ipcRenderer.removeListener('bansur:quick-entry:shown', listener)
    },
    // Main → quick window: the outcome of a submit whose relay already timed
    // out. Delivery is now KNOWN — reconcile the unknown state instead of
    // leaving the user to resend a prompt that may already be delivered.
    onLateResult: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('bansur:quick-entry:late-result', listener)

      return () => ipcRenderer.removeListener('bansur:quick-entry:late-result', listener)
    }
  },
  getBootProgress: () => ipcRenderer.invoke('bansur:boot-progress:get'),
  getConnectionConfig: profile => ipcRenderer.invoke('bansur:connection-config:get', profile),
  saveConnectionConfig: payload => ipcRenderer.invoke('bansur:connection-config:save', payload),
  applyConnectionConfig: payload => ipcRenderer.invoke('bansur:connection-config:apply', payload),
  testConnectionConfig: payload => ipcRenderer.invoke('bansur:connection-config:test', payload),
  // Opt-in OS-keychain encryption for stored gateway secrets (default off —
  // see secret-storage-policy.ts). get never touches the OS keychain.
  getSecretStorageEncryption: () => ipcRenderer.invoke('bansur:secret-storage:get'),
  setSecretStorageEncryption: (on: boolean) => ipcRenderer.invoke('bansur:secret-storage:set', on),
  // v2 multi-connection registry: named agent sources (local / remote / cloud / ssh).
  connections: {
    list: () => ipcRenderer.invoke('bansur:connections:list'),
    save: payload => ipcRenderer.invoke('bansur:connections:save', payload),
    remove: id => ipcRenderer.invoke('bansur:connections:remove', id),
    setPrimary: id => ipcRenderer.invoke('bansur:connections:set-primary', id),
    setLaunchMode: mode => ipcRenderer.invoke('bansur:connections:set-launch-mode', mode),
    setLastUsed: id => ipcRenderer.invoke('bansur:connections:set-last-used', id),
    test: id => ipcRenderer.invoke('bansur:connections:test', id),
    updateManaged: id => ipcRenderer.invoke('bansur:connections:update-managed', id),
    // Fan out `bansur update` to every eligible registered connection.
    // Optional excludeIds skips rows the caller updates through another path.
    updateAll: options => ipcRenderer.invoke('bansur:connections:update-all', options),
    // Registry lifecycle push (main → renderer): a connection was removed or
    // materially edited, so secondaries scoped to it must be disposed (and,
    // for edits, re-dialed at the new target).
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('bansur:connections:changed', listener)

      return () => ipcRenderer.removeListener('bansur:connections:changed', listener)
    }
  },
  sshConfigHosts: () => ipcRenderer.invoke('bansur:ssh-config:hosts'),
  sshResolveHost: host => ipcRenderer.invoke('bansur:ssh-config:resolve', host),
  probeConnectionConfig: remoteUrl => ipcRenderer.invoke('bansur:connection-config:probe', remoteUrl),
  // `options` lets a registry-editor draft sign in BEFORE it is saved: the
  // main process settles the draft's connection id up front so the login
  // window writes into the per-connection cookie jar the saved entry will
  // read (not the legacy shared jar an unsaved URL would fall back to).
  oauthLoginConnectionConfig: (remoteUrl, options) =>
    ipcRenderer.invoke('bansur:connection-config:oauth-login', remoteUrl, options),
  oauthLogoutConnectionConfig: remoteUrl => ipcRenderer.invoke('bansur:connection-config:oauth-logout', remoteUrl),
  // Bansur Cloud: one portal login powers discovery + silent per-agent sign-in
  // (cloud-auto-discovery Phase 3).
  cloud: {
    status: () => ipcRenderer.invoke('bansur:cloud:status'),
    login: () => ipcRenderer.invoke('bansur:cloud:login'),
    logout: () => ipcRenderer.invoke('bansur:cloud:logout'),
    discover: org => ipcRenderer.invoke('bansur:cloud:discover', org),
    agentSignIn: dashboardUrl => ipcRenderer.invoke('bansur:cloud:agent-sign-in', dashboardUrl)
  },
  profile: {
    getDefault: () => ipcRenderer.invoke('bansur:profile:default:get'),
    setDefault: (route: DesktopProfileRoute) => ipcRenderer.invoke('bansur:profile:default:set', route),
    onDefaultChanged: (callback: (route: DesktopProfileRoute | null) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, route: DesktopProfileRoute | null) => callback(route)
      ipcRenderer.on('bansur:profile:default:changed', listener)

      return () => ipcRenderer.removeListener('bansur:profile:default:changed', listener)
    },
    get: () => ipcRenderer.invoke('bansur:profile:get'),
    remember: name => ipcRenderer.invoke('bansur:profile:remember', name),
    set: name => ipcRenderer.invoke('bansur:profile:set', name)
  },
  // The handler resolves an expected 404 with a sentinel instead of rejecting
  // (Electron logs a stack for every rejected invoke). Turn it back into the
  // rejection the renderer expects — see electron/api-expected-404.ts.
  api: request => ipcRenderer.invoke('bansur:api', request).then(unwrapExpectedNotFound),
  notify: payload => ipcRenderer.invoke('bansur:notify', payload),
  claimStartupLatency: () => ipcRenderer.invoke('bansur:startup-latency:claim'),
  requestMicrophoneAccess: () => ipcRenderer.invoke('bansur:requestMicrophoneAccess'),
  readWindowBelow: () => ipcRenderer.invoke('bansur:window:readBelow'),
  readFileDataUrl: filePath => ipcRenderer.invoke('bansur:readFileDataUrl', filePath),
  readFileDataUrlForAttach: filePath => ipcRenderer.invoke('bansur:readFileDataUrlForAttach', filePath),
  dataUrlReadMax: {
    get: () => ipcRenderer.invoke('bansur:data-url-read-max:get'),
    set: maxMb => ipcRenderer.invoke('bansur:data-url-read-max:set', maxMb)
  },
  readFileText: filePath => ipcRenderer.invoke('bansur:readFileText', filePath),
  readPluginSource: (filePath: string) => ipcRenderer.invoke('bansur:readPluginSource', filePath),
  selectPaths: options => ipcRenderer.invoke('bansur:selectPaths', options),
  selectSavePath: options => ipcRenderer.invoke('bansur:selectSavePath', options),
  saveTextFileAs: request => ipcRenderer.invoke('bansur:saveTextFileAs', request),
  writeClipboard: text => ipcRenderer.invoke('bansur:writeClipboard', text),
  readClipboard: () => ipcRenderer.invoke('bansur:readClipboard'),
  saveGatewayFile: payload => ipcRenderer.invoke('bansur:saveGatewayFile', payload),
  saveImageFromUrl: url => ipcRenderer.invoke('bansur:saveImageFromUrl', url),
  contextMenuEdit: command => ipcRenderer.invoke('bansur:context-menu:edit', command),
  contextMenuCopyImage: () => ipcRenderer.invoke('bansur:context-menu:copy-image'),
  contextMenuSpellcheck: action => ipcRenderer.invoke('bansur:context-menu:spellcheck', action),
  contextMenuGuestAddWord: payload => ipcRenderer.invoke('bansur:context-menu:guest-add-word', payload),
  onContextMenuSpellcheck: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('bansur:context-menu-spellcheck', listener)

    return () => ipcRenderer.removeListener('bansur:context-menu-spellcheck', listener)
  },
  saveImageBuffer: (data, ext, name) => ipcRenderer.invoke('bansur:saveImageBuffer', { data, ext, name }),
  capturePreview: payload => ipcRenderer.invoke('bansur:capturePreview', payload),
  savePastedText: text => ipcRenderer.invoke('bansur:savePastedText', { text }),
  saveClipboardImage: () => ipcRenderer.invoke('bansur:saveClipboardImage'),
  getPathForFile: file => {
    try {
      return webUtils.getPathForFile(file) || ''
    } catch {
      return ''
    }
  },
  normalizePreviewTarget: (target, baseDir) => ipcRenderer.invoke('bansur:normalizePreviewTarget', target, baseDir),
  watchPreviewFile: url => ipcRenderer.invoke('bansur:watchPreviewFile', url),
  watchDirectory: dir => ipcRenderer.invoke('bansur:watchDirectory', dir),
  stopPreviewFileWatch: id => ipcRenderer.invoke('bansur:stopPreviewFileWatch', id),
  setActiveWork: payload => ipcRenderer.send('bansur:active-work', payload),
  setTitleBarTheme: payload => ipcRenderer.send('bansur:titlebar-theme', payload),
  setNativeTheme: mode => ipcRenderer.send('bansur:native-theme', mode),
  setTranslucency: payload => ipcRenderer.send('bansur:translucency', payload),
  setKeepAwake: mode => ipcRenderer.send('bansur:keep-awake', mode),
  // Once per computer, after a timed sleep interrupted a turn with keep-awake off.
  onKeepAwakeOffer: callback => {
    const listener = () => callback()
    ipcRenderer.on('bansur:keep-awake-offer', listener)

    return () => ipcRenderer.removeListener('bansur:keep-awake-offer', listener)
  },
  minimizeToTray: {
    get: () => ipcRenderer.invoke('bansur:minimize-to-tray:get'),
    set: on => ipcRenderer.invoke('bansur:minimize-to-tray:set', on),
    onChanged: callback => {
      const listener = (_event, status) => callback(status)
      ipcRenderer.on('bansur:minimize-to-tray:changed', listener)

      return () => ipcRenderer.removeListener('bansur:minimize-to-tray:changed', listener)
    }
  },
  setDisableF12: blocked => ipcRenderer.send('bansur:devtools:disable-f12', blocked),
  setF12ShortcutActive: active => ipcRenderer.send('bansur:f12ShortcutActive', Boolean(active)),
  onF12Shortcut: callback => {
    const listener = (_event, input) => callback(input)
    ipcRenderer.on('bansur:f12-shortcut', listener)

    return () => ipcRenderer.removeListener('bansur:f12-shortcut', listener)
  },
  setPreviewShortcutActive: active => ipcRenderer.send('bansur:previewShortcutActive', Boolean(active)),
  setPreviewGuestHidden: (webContentsId, hidden) =>
    ipcRenderer.send('bansur:preview-guest-hidden', { webContentsId, hidden: Boolean(hidden) }),
  openExternal: url => ipcRenderer.invoke('bansur:openExternal', url),
  freeTierChallenge: {
    // Load the account service's challenge page in a hidden window (revealed
    // only if the page asks for the human). Resolves with how it ended.
    run: request => ipcRenderer.invoke('bansur:freeTierChallenge:run', request)
  },
  mcpOauth: {
    // One-shot loopback listener for MCP OAuth against remote backends: bind
    // on this machine, hand redirectUri to mcp.servers.oauth.start, then wait
    // for the provider redirect and relay code/state via oauth.callback.
    listen: () => ipcRenderer.invoke('bansur:mcp-oauth:listen'),
    wait: (id, timeoutMs) => ipcRenderer.invoke('bansur:mcp-oauth:wait', id, timeoutMs),
    cancel: id => ipcRenderer.invoke('bansur:mcp-oauth:cancel', id)
  },
  openPreviewInBrowser: url => ipcRenderer.invoke('bansur:openPreviewInBrowser', url),
  reachPreviewUrl: url => ipcRenderer.invoke('bansur:preview:reach', url),
  setActiveConnectionRoute: route => ipcRenderer.send('bansur:connection:active-route', route),
  fetchLinkTitle: url => ipcRenderer.invoke('bansur:fetchLinkTitle', url),
  resolveFavicon: url => ipcRenderer.invoke('bansur:resolveFavicon', url),
  sanitizeWorkspaceCwd: cwd => ipcRenderer.invoke('bansur:workspace:sanitize', cwd),
  settings: {
    getDefaultProjectDir: () => ipcRenderer.invoke('bansur:setting:defaultProjectDir:get'),
    setDefaultProjectDir: dir => ipcRenderer.invoke('bansur:setting:defaultProjectDir:set', dir),
    pickDefaultProjectDir: () => ipcRenderer.invoke('bansur:setting:defaultProjectDir:pick')
  },
  preparedSubmissions: {
    read: () => ipcRenderer.invoke('bansur:prepared-submissions:read'),
    update: (key, entry) => ipcRenderer.invoke('bansur:prepared-submissions:update', key, entry),
    compareAndSet: (key, expected, entry) =>
      ipcRenderer.invoke('bansur:prepared-submissions:compare-and-set', key, expected, entry)
  },
  zoom: {
    // Current zoom of this window, as { level, percent }.
    get: () => ipcRenderer.invoke('bansur:zoom:get'),
    // Synchronous zoom factor (1 = 100%). Coordinate math needs it in the
    // same tick as the event it converts, so no IPC round-trip here.
    factor: () => webFrame.getZoomFactor(),
    setPercent: percent => ipcRenderer.send('bansur:zoom:set-percent', percent),
    // Fires on every zoom change, including the Ctrl/Cmd +/-/0 shortcuts,
    // so the settings UI can stay in sync with the keyboard.
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('bansur:zoom:changed', listener)

      return () => ipcRenderer.removeListener('bansur:zoom:changed', listener)
    }
  },
  revealLogs: () => ipcRenderer.invoke('bansur:logs:reveal'),
  getRecentLogs: () => ipcRenderer.invoke('bansur:logs:recent'),
  // Fire-and-forget: persists a renderer error-boundary catch (with component
  // stack) to desktop.log so crashes survive the window (#79428).
  reportRendererError: report => ipcRenderer.send('bansur:logs:renderer-error', report),
  logLine: (line: string): void => ipcRenderer.send('bansur:logs:renderer-line', line),
  readDir: dirPath => ipcRenderer.invoke('bansur:fs:readDir', dirPath),
  gitRoot: startPath => ipcRenderer.invoke('bansur:fs:gitRoot', startPath),
  revealPath: targetPath => ipcRenderer.invoke('bansur:fs:reveal', targetPath),
  openDir: dirPath => ipcRenderer.invoke('bansur:fs:openDir', dirPath),
  desktopPluginsRoot: () => ipcRenderer.invoke('bansur:fs:desktopPluginsRoot'),
  reconcileDesktopPlugins: () => ipcRenderer.invoke('bansur:fs:reconcileDesktopPlugins'),
  logsRoot: (profile?: string) => ipcRenderer.invoke('bansur:fs:logsRoot', profile),
  renamePath: (targetPath, newName) => ipcRenderer.invoke('bansur:fs:rename', targetPath, newName),
  writeTextFile: (filePath, content) => ipcRenderer.invoke('bansur:fs:writeText', filePath, content),
  trashPath: targetPath => ipcRenderer.invoke('bansur:fs:trash', targetPath),
  git: {
    worktreeList: repoPath => ipcRenderer.invoke('bansur:git:worktreeList', repoPath),
    worktreeAdd: (repoPath, options) => ipcRenderer.invoke('bansur:git:worktreeAdd', repoPath, options),
    worktreeRemove: (repoPath, worktreePath, options) =>
      ipcRenderer.invoke('bansur:git:worktreeRemove', repoPath, worktreePath, options),
    branchSwitch: (repoPath, branch) => ipcRenderer.invoke('bansur:git:branchSwitch', repoPath, branch),
    branchList: repoPath => ipcRenderer.invoke('bansur:git:branchList', repoPath),
    baseBranchList: repoPath => ipcRenderer.invoke('bansur:git:baseBranchList', repoPath),
    repoStatus: repoPath => ipcRenderer.invoke('bansur:git:repoStatus', repoPath),
    fileDiff: (repoPath, filePath) => ipcRenderer.invoke('bansur:git:fileDiff', repoPath, filePath),
    scanRepos: (roots, options) => ipcRenderer.invoke('bansur:git:scanRepos', roots, options),
    review: {
      list: (repoPath, scope, baseRef) => ipcRenderer.invoke('bansur:git:review:list', repoPath, scope, baseRef),
      diff: (repoPath, filePath, scope, baseRef, staged) =>
        ipcRenderer.invoke('bansur:git:review:diff', repoPath, filePath, scope, baseRef, staged),
      stage: (repoPath, filePath) => ipcRenderer.invoke('bansur:git:review:stage', repoPath, filePath),
      unstage: (repoPath, filePath) => ipcRenderer.invoke('bansur:git:review:unstage', repoPath, filePath),
      revert: (repoPath, filePath) => ipcRenderer.invoke('bansur:git:review:revert', repoPath, filePath),
      revParse: (repoPath, ref) => ipcRenderer.invoke('bansur:git:review:revParse', repoPath, ref),
      commit: (repoPath, message, push) => ipcRenderer.invoke('bansur:git:review:commit', repoPath, message, push),
      commitContext: repoPath => ipcRenderer.invoke('bansur:git:review:commitContext', repoPath),
      push: repoPath => ipcRenderer.invoke('bansur:git:review:push', repoPath),
      shipInfo: repoPath => ipcRenderer.invoke('bansur:git:review:shipInfo', repoPath),
      prList: (repoPath, branches, numbers) =>
        ipcRenderer.invoke('bansur:git:review:prList', repoPath, branches, numbers),
      createPr: repoPath => ipcRenderer.invoke('bansur:git:review:createPr', repoPath)
    }
  },
  terminal: {
    attach: id => ipcRenderer.invoke('bansur:terminal:attach', id),
    cwd: id => ipcRenderer.invoke('bansur:terminal:cwd', id),
    dispose: id => ipcRenderer.invoke('bansur:terminal:dispose', id),
    resize: (id, size) => ipcRenderer.invoke('bansur:terminal:resize', id, size),
    start: options => ipcRenderer.invoke('bansur:terminal:start', options),
    write: (id, data) => ipcRenderer.invoke('bansur:terminal:write', id, data),
    onData: (id, callback) => {
      const channel = `bansur:terminal:${id}:data`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    },
    onExit: (id, callback) => {
      const channel = `bansur:terminal:${id}:exit`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    }
  },
  onClosePreviewRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('bansur:close-preview-requested', listener)

    return () => ipcRenderer.removeListener('bansur:close-preview-requested', listener)
  },
  onPreviewNav: callback => {
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('bansur:preview-nav', listener)

    return () => ipcRenderer.removeListener('bansur:preview-nav', listener)
  },
  onOpenFolderRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('bansur:open-folder-requested', listener)

    return () => ipcRenderer.removeListener('bansur:open-folder-requested', listener)
  },
  onOpenUpdatesRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('bansur:open-updates', listener)

    return () => ipcRenderer.removeListener('bansur:open-updates', listener)
  },
  onDeepLink: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('bansur:deep-link', listener)

    return () => ipcRenderer.removeListener('bansur:deep-link', listener)
  },
  signalDeepLinkReady: () => ipcRenderer.invoke('bansur:deep-link-ready'),
  probePluginRepo: payload => ipcRenderer.invoke('bansur:plugin:probe', payload),
  installDesktopPlugin: payload => ipcRenderer.invoke('bansur:plugin:installDesktop', payload),
  removeDesktopPlugin: payload => ipcRenderer.invoke('bansur:plugin:removeDesktop', payload),
  onWindowStateChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('bansur:window-state-changed', listener)

    return () => ipcRenderer.removeListener('bansur:window-state-changed', listener)
  },
  onFocusSession: callback => {
    const listener = (_event, sessionId) => callback(sessionId)
    ipcRenderer.on('bansur:focus-session', listener)

    return () => ipcRenderer.removeListener('bansur:focus-session', listener)
  },
  onNotificationAction: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('bansur:notification-action', listener)

    return () => ipcRenderer.removeListener('bansur:notification-action', listener)
  },
  onNotificationActivate: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('bansur:notification-activate', listener)

    return () => ipcRenderer.removeListener('bansur:notification-activate', listener)
  },
  onExternalOpenFailed: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('bansur:external-open-failed', listener)

    return () => ipcRenderer.removeListener('bansur:external-open-failed', listener)
  },
  onPreviewFileChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('bansur:preview-file-changed', listener)

    return () => ipcRenderer.removeListener('bansur:preview-file-changed', listener)
  },
  onBackendExit: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('bansur:backend-exit', listener)

    return () => ipcRenderer.removeListener('bansur:backend-exit', listener)
  },
  // Soft gateway-mode apply finished tearing down the primary backend. Renderer
  // should wipe session lists + re-dial without a window reload.
  onConnectionApplied: callback => {
    const listener = () => callback()
    ipcRenderer.on('bansur:connection:applied', listener)

    return () => ipcRenderer.removeListener('bansur:connection:applied', listener)
  },
  onPowerResume: callback => {
    const listener = () => callback()
    ipcRenderer.on('bansur:power-resume', listener)

    return () => ipcRenderer.removeListener('bansur:power-resume', listener)
  },
  // AC ↔ battery transitions; renderers slow their backstop polls on battery.
  getOnBattery: () => ipcRenderer.invoke('bansur:power-battery:get'),
  onBatteryChanged: callback => {
    const listener = (_event, onBattery) => callback(Boolean(onBattery))
    ipcRenderer.on('bansur:power-battery', listener)

    return () => ipcRenderer.removeListener('bansur:power-battery', listener)
  },
  onBootProgress: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('bansur:boot-progress', listener)

    return () => ipcRenderer.removeListener('bansur:boot-progress', listener)
  },
  // First-launch bootstrap progress -- emitted by the install.ps1 stage
  // runner in main.ts (apps/desktop/electron/bootstrap-runner.ts).
  // Renderer's install overlay subscribes to live events and queries the
  // current snapshot via getBootstrapState() to recover after a devtools
  // reload mid-bootstrap.
  getBootstrapState: () => ipcRenderer.invoke('bansur:bootstrap:get'),
  probeLocalBackend: () => ipcRenderer.invoke('bansur:local-backend:probe'),
  continueBootstrapLocal: () => ipcRenderer.invoke('bansur:bootstrap:continue-local'),
  recycleBackend: profile => ipcRenderer.invoke('bansur:backend:recycle', profile),
  resetBootstrap: () => ipcRenderer.invoke('bansur:bootstrap:reset'),
  updateHold: {
    recheck: () => ipcRenderer.invoke('bansur:update-hold:recheck'),
    quit: () => ipcRenderer.invoke('bansur:update-hold:quit'),
    startAnyway: (request: { holdId: string; confirmed: true }) =>
      ipcRenderer.invoke('bansur:update-hold:start-anyway', request)
  },
  repairBootstrap: () => ipcRenderer.invoke('bansur:bootstrap:repair'),
  cancelBootstrap: () => ipcRenderer.invoke('bansur:bootstrap:cancel'),
  onBootstrapEvent: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('bansur:bootstrap:event', listener)

    return () => ipcRenderer.removeListener('bansur:bootstrap:event', listener)
  },
  getVersion: () => ipcRenderer.invoke('bansur:version'),
  relaunchApp: () => ipcRenderer.invoke('bansur:app:relaunch'),
  getMachineProfile: () => ipcRenderer.invoke('bansur:machine:profile'),
  getRemoteDisplayReason: () => ipcRenderer.invoke('bansur:get-remote-display-reason'),
  uninstall: {
    summary: () => ipcRenderer.invoke('bansur:uninstall:summary'),
    run: mode => ipcRenderer.invoke('bansur:uninstall:run', { mode }),
    openAppsSettings: () => ipcRenderer.invoke('bansur:uninstall:openAppsSettings')
  },
  updates: {
    check: opts => ipcRenderer.invoke('bansur:updates:check', opts),
    apply: opts => ipcRenderer.invoke('bansur:updates:apply', opts),
    setChannel: name => ipcRenderer.invoke('bansur:updates:channel:set', name),
    onProgress: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('bansur:updates:progress', listener)

      return () => ipcRenderer.removeListener('bansur:updates:progress', listener)
    },
    takePendingRun: () => ipcRenderer.invoke('bansur:updates:metric:take'),
    ackPendingRun: sent => ipcRenderer.invoke('bansur:updates:metric:ack', sent),
    onPendingRun: callback => {
      const listener = () => callback()
      ipcRenderer.on('bansur:updates:metric:pending', listener)

      return () => ipcRenderer.removeListener('bansur:updates:metric:pending', listener)
    }
  },
  desktopMetrics: {
    setEnabled: (on, profile) => ipcRenderer.invoke('bansur:desktop-metrics:set-enabled', on, profile),
    takeRendererCrashes: () => ipcRenderer.invoke('bansur:desktop-metrics:crash:take'),
    ackRendererCrashes: sent => ipcRenderer.invoke('bansur:desktop-metrics:crash:ack', sent)
  },
  themes: {
    fetchMarketplace: id => ipcRenderer.invoke('bansur:vscode-theme:fetch', id),
    searchMarketplace: query => ipcRenderer.invoke('bansur:vscode-theme:search', query)
  },
  // Find-in-page (Ctrl/Cmd+F): delegates to Electron's
  // webContents.findInPage on the IPC sender's window so a Cmd+F pressed
  // in a secondary session window searches THAT window, not the primary.
  // `onFoundInPage` returns the unsubscribe fn; the renderer wires it via
  // `initFindInPageListener` in store/find-in-page.ts and tears it down
  // when the FindBar unmounts.
  findInPage: (query, options) => ipcRenderer.invoke('bansur:find-in-page', query, options),
  stopFindInPage: () => ipcRenderer.invoke('bansur:stop-find-in-page'),
  onFoundInPage: callback => {
    const listener = (_event, result) => callback(result)
    ipcRenderer.on('bansur:found-in-page', listener)

    return () => ipcRenderer.removeListener('bansur:found-in-page', listener)
  },
  // Main-process `before-input-event` forwards Ctrl/Cmd+F here so renderer
  // can open the FindBar even when the GTK compositor has already grabbed
  // the chord at the windowing layer (#81727).
  onOpenFindBarRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('bansur:open-find-bar', listener)

    return () => ipcRenderer.removeListener('bansur:open-find-bar', listener)
  }
})
