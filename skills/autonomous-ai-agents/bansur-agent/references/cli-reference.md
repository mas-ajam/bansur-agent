# Bansur CLI Reference

Live sources when anything looks stale: `bansur --help`, `bansur <command> --help`,
https://bansur-agent.pages.dev/docs/reference/cli-commands

### Global Flags

```
bansur [flags] [command]        (no subcommand = interactive chat)

  --version, -V             Show version
  -z, --oneshot PROMPT      One-shot: print ONLY the final response (for scripts/pipes)
  -m MODEL  --provider P    Model/provider override for this invocation
  -t, --toolsets LIST       Comma-separated toolsets for this invocation
  --resume, -r SESSION      Resume session by ID or title
  --continue, -c [NAME]     Resume by name, or most recent session
  --worktree, -w            Isolated git worktree mode (parallel agents)
  --skills, -s SKILL        Preload skills (comma-separate or repeat)
  --profile, -p NAME        Use a named profile
  --yolo                    Skip dangerous command approval
  --tui / --cli             Force the Ink TUI / classic REPL
  --ignore-rules            Skip AGENTS.md/SOUL.md/memory/skill injection
  --safe-mode               Disable ALL customizations (troubleshooting)
  --pass-session-id         Include session ID in system prompt
```

### Chat

```
bansur chat [flags]
  -q, --query TEXT          Single query, non-interactive
  --image PATH              Attach a local image to a single query
  -Q, --quiet               Suppress banner, spinner, tool previews
  --checkpoints             Enable filesystem checkpoints (/rollback)
  --max-turns N             Cap tool-calling iterations
  --source TAG              Session source tag (default: cli)
```
(plus the global flags above)

### Configuration

```
bansur setup [section]      Wizard (model|tts|terminal|gateway|tools|agent)
bansur model                Interactive model/provider picker
bansur fallback [add|remove|list]  Fallback provider chain
bansur config [show|edit|get|set|unset|path|env-path|check|migrate]
bansur login / logout       OAuth sign-in / clear stored auth
bansur doctor [--fix]       Check dependencies and config
bansur status [--full]      Component summary (--full: every section)
```

### Tools & Skills

```
bansur tools [list|enable NAME|disable NAME]   Per-platform toolsets (curses UI with no args)

bansur skills list|browse|search QUERY|inspect ID
bansur skills install ID    Hub identifier OR a direct https://…/SKILL.md URL
bansur skills config        Enable/disable skills per platform
bansur skills check|update|uninstall|publish PATH
bansur skills tap add REPO  Add a GitHub repo as a skill source
bansur bundles              Skill bundles (one /<name> alias loads several skills)
```

### MCP Servers

```
bansur mcp add NAME (--url or --command) | remove | list | test NAME
bansur mcp catalog | install NAME     Curated catalog install
bansur mcp configure NAME             Toggle tool selection
bansur mcp serve                      Run Bansur as an MCP server
```
Details (transport, tool discovery, catalog): `references/native-mcp.md`.

### Gateway (Messaging Platforms)

```
bansur gateway run|install|start|stop|restart|status|setup
```

20+ platforms: Telegram, Discord, Slack, WhatsApp (Baileys + Business Cloud API), iMessage (Photon — `bansur photon setup`), Signal, Email, SMS, Matrix, Mattermost, Teams, LINE, SimpleX, ntfy, Google Chat, Home Assistant, DingTalk, Feishu, WeCom, Weixin, API Server, Webhooks. Open WebUI connects via the API Server adapter. Most adapters ship under `plugins/platforms/`.
Docs: https://bansur-agent.pages.dev/docs/user-guide/messaging/

### Sessions

```
bansur sessions list|browse|rename ID TITLE|delete ID|export OUT|prune|stats
```

### Cron / Webhooks

```
bansur cron list|create SCHED|edit ID|pause|resume|run ID|remove|status
    Schedules: '30m', 'every 2h', '0 9 * * *', ISO timestamp
bansur webhook subscribe NAME|list|remove NAME|test NAME
```
Webhook payloads/routes: `references/webhooks.md`.

### Profiles

```
bansur profile list|create NAME (--clone|--clone-all|--clone-from)|use|show|delete
bansur profile rename A B | alias NAME | export NAME | import FILE
bansur profile migrate-identity A B   Retry a completed rename's session/routing identity migration
```

### Credentials & Pools

```
bansur auth                 Interactive credential manager
bansur auth add [PROVIDER]  Add OAuth or API-key credential (bansur, openai-codex, qwen-oauth, …)
bansur auth list|remove P IDX|reset PROVIDER|status
```
Multiple credentials per provider form a pool that rotates automatically and skips exhausted keys.

### Other

```
bansur desktop / gui        Native desktop app
bansur dashboard            Web admin panel + embedded chat (--stop / --status)
bansur proxy                OpenAI-compatible local proxy backed by an OAuth provider
bansur portal               Quick setup / sign in via Bansur Portal
bansur kanban <verb>        Multi-agent work-queue board
bansur project              Named multi-folder workspaces
bansur skin list|use|set    Switch/tweak skins (see references/themes.md)
bansur pets <verb>          Pet mascots (see references/petdex.md)
bansur memory setup|status|off|reset   Memory provider
bansur secrets bitwarden|onepassword   External secret stores
bansur moa                  Mixture-of-Agents slots
bansur hooks / security / backup / import / checkpoints / console
bansur logs [-f] [errors]   View agent/error logs
bansur send                 One-off message through a gateway platform
bansur pairing / plugins / insights / journey / computer-use
bansur acp                  ACP server (IDE integration)
bansur completion bash|zsh|fish
bansur update / uninstall / claw migrate
```

Plugin- and provider-supplied subcommands (e.g. `bansur photon setup`) only appear once their plugin is installed/active.

### Where to Find Things

| Looking for... | Location |
|---|---|
| Config options | `bansur config edit` · [Configuration docs](https://bansur-agent.pages.dev/docs/user-guide/configuration) |
| Tools / toolsets | `bansur tools list` · [Tools reference](https://bansur-agent.pages.dev/docs/reference/tools-reference) |
| Skills catalog | `bansur skills browse` · [Skills catalog](https://bansur-agent.pages.dev/docs/reference/skills-catalog) |
| Provider setup | `bansur model` · [Providers guide](https://bansur-agent.pages.dev/docs/integrations/providers) |
| Env variables | `bansur config env-path` · [Env vars reference](https://bansur-agent.pages.dev/docs/reference/environment-variables) |
| Gateway logs | `~/.bansur/logs/gateway.log` (or `bansur logs`) |
| Sessions | `bansur sessions browse` (reads state.db) |
