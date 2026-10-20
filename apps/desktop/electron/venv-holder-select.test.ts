import assert from 'node:assert/strict'

import { test } from 'vitest'

import { hasWindowsPathPrefix, isExternalVenvHolder, isBansurOwnedVenvDaemon } from './venv-holder-select'

const SCRIPTS = 'C:\\Bansur\\venv\\Scripts'

test('matches the hindsight daemon shim (exe under venv Scripts + hindsight cmdline)', () => {
  assert.equal(
    isBansurOwnedVenvDaemon(
      'C:\\Bansur\\venv\\Scripts\\pythonw.exe',
      'C:\\Bansur\\venv\\Scripts\\pythonw.exe -m hindsight_api.main --daemon --idle-timeout 300 --port 9177',
      SCRIPTS
    ),
    true
  )
})

test('Windows path prefix match is ordinal case-insensitive', () => {
  assert.equal(
    isBansurOwnedVenvDaemon(
      'c:\\bansur\\venv\\scripts\\python.exe',
      'python.exe -m hindsight_api.main --daemon',
      'C:\\Bansur\\venv\\Scripts'
    ),
    true
  )
})

test('excludes external venv holders that are not the hindsight daemon', () => {
  // a user terminal running the bansur CLI from the venv — must NOT be killed
  assert.equal(isBansurOwnedVenvDaemon('C:\\Bansur\\venv\\Scripts\\bansur.exe', 'bansur chat -q "hi"', SCRIPTS), false)
  // an unrelated python script using the venv interpreter
  assert.equal(
    isBansurOwnedVenvDaemon('C:\\Bansur\\venv\\Scripts\\python.exe', 'python C:\\tools\\import.py', SCRIPTS),
    false
  )
})

test('excludes exes outside the venv even when the cmdline mentions hindsight', () => {
  assert.equal(
    isBansurOwnedVenvDaemon('C:\\Other\\pythonw.exe', 'pythonw -m hindsight_api.main --daemon', SCRIPTS),
    false
  )
})

test('prefix boundary: sibling dirs (ScriptsX) do not match', () => {
  assert.equal(hasWindowsPathPrefix('C:\\Bansur\\venv\\ScriptsX\\python.exe', SCRIPTS), false)
  assert.equal(hasWindowsPathPrefix('C:\\Bansur\\venv\\Scripts\\python.exe', SCRIPTS), true)
})

test('null/undefined fields never match', () => {
  assert.equal(isBansurOwnedVenvDaemon(null, 'x', SCRIPTS), false)
  assert.equal(isBansurOwnedVenvDaemon('C:\\Bansur\\venv\\Scripts\\pythonw.exe', null, SCRIPTS), false)
  assert.equal(isBansurOwnedVenvDaemon(undefined, undefined, SCRIPTS), false)
})

// --- isExternalVenvHolder (#62311) ------------------------------------------

test('matches the autostart gateway shim (bansur.exe under venv Scripts)', () => {
  assert.equal(
    isExternalVenvHolder(
      'C:\\Bansur\\venv\\Scripts\\bansur.exe',
      '"C:\\Bansur\\venv\\Scripts\\bansur.exe" gateway run --external-supervisor',
      SCRIPTS
    ),
    true
  )
})

test('matches the dashboard scheduled task (python -m bansur_cli / -m bansur)', () => {
  assert.equal(
    isExternalVenvHolder(
      'C:\\Bansur\\venv\\Scripts\\python.exe',
      '"C:\\Bansur\\venv\\Scripts\\python.exe" -m bansur_cli.main dashboard',
      SCRIPTS
    ),
    true
  )
  assert.equal(
    isExternalVenvHolder('C:\\Bansur\\venv\\Scripts\\pythonw.exe', 'pythonw.exe -m bansur serve', SCRIPTS),
    true
  )
})

test('never matches an unrelated process that merely borrows the venv interpreter', () => {
  // a user's own script running on the venv python — NOT Bansur, must NOT be killed
  assert.equal(
    isExternalVenvHolder('C:\\Bansur\\venv\\Scripts\\python.exe', 'python C:\\tools\\import.py', SCRIPTS),
    false
  )
  // hindsight daemon is selected by isBansurOwnedVenvDaemon, not here
  assert.equal(
    isExternalVenvHolder('C:\\Bansur\\venv\\Scripts\\pythonw.exe', 'pythonw -m hindsight_api.main --daemon', SCRIPTS),
    false
  )
})

test('never matches a process outside the venv, even with bansur in the cmdline', () => {
  // an editor / shell whose command line mentions the install root (#62445 regression guard)
  assert.equal(
    isExternalVenvHolder('C:\\Windows\\System32\\cmd.exe', 'cmd /c cd C:\\Bansur\\venv\\Scripts && dir', SCRIPTS),
    false
  )
  assert.equal(isExternalVenvHolder('C:\\Other\\bansur.exe', 'bansur gateway run', SCRIPTS), false)
})

test('sibling-dir and boundary safety for the external selector', () => {
  assert.equal(isExternalVenvHolder('C:\\Bansur\\venv\\ScriptsX\\bansur.exe', 'bansur gateway run', SCRIPTS), false)
  assert.equal(isExternalVenvHolder(null, 'bansur gateway run', SCRIPTS), false)
  assert.equal(isExternalVenvHolder('C:\\Bansur\\venv\\Scripts\\bansur.exe', null, SCRIPTS), false)
})
