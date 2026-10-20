# Changelog

All notable changes to Bansur Agent are documented here.

## [Unreleased]

## [1.0.0] - 2026-10-20

### Added

- Initial Bansur Agent release — a rebrand of Hermes Agent
  (originally https://github.com/NousResearch/hermes-agent)
  by Nous Research (MIT License, see `LICENSE`), with the full codebase renamed end to end:
  - Product and display branding: Hermes Agent → Bansur Agent
  - Python packages and modules: `bansur_cli/`, `bansur_platform/`, `bansur_state_*.py`, `bansur_*.py`
  - CLI commands: `bansur`, `bansur-agent`, `bansur-acp`
  - Environment variables: `BANSUR_*`
  - Data directory: `~/.bansur-agent`
  - Desktop IPC channels: `bansur:*`
  - New Bansur Agent logo and icons
- References to third-party names are intentionally preserved where they identify external
  artifacts: the Nous Hermes 3/4 model families, the `hermes-parser`/`hermes-estree` npm
  packages, community plugin repositories, and the original MIT copyright notice in `LICENSE`.

### Changed

- All repository references point at the canonical repo,
  https://github.com/mas-ajam/bansur-agent — the update machinery, installers, the
  desktop updater, workflow repository gates, and the GHCR pull hints
  (`ghcr.io/mas-ajam/bansur-agent`). The Docker Hub image stays
  `bansur/bansur-agent`.
- The inherited free tier (anonymous "Bansur Portal" accounts) is opt-in and off by
  default: this build ships no account service, so a first run goes to provider
  setup instead of claiming a free identity. A deployment that runs its own
  account service can enable it with `bansur.guest: true`, or by pointing
  `BANSUR_PORTAL_BASE_URL` at the service.
