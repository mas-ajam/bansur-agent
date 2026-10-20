# Changelog

All notable changes to Bansur Agent are documented here.

## [Unreleased]

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
