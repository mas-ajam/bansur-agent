---
sidebar_position: 1
title: "Bansur Portal"
description: "One subscription, 300+ frontier models, and the Tool Gateway — the recommended way to run Bansur Agent"
---

# Bansur Portal

[Bansur Portal](https://portal.bansur-agent.pages.dev) is Bansur's unified subscription gateway and **the recommended way to run Bansur Agent**. One OAuth login replaces the juggling act of separate accounts, API keys, and billing relationships across every model lab, search API, image generator, and browser provider you'd otherwise need to wire up by hand.

If you only have time to set up one thing, set up this. The fastest path:

```bash
bansur setup --portal
```

That single command runs the Portal OAuth, lets you pick a Bansur model, sets Bansur as your inference provider in `config.yaml`, and turns on the Tool Gateway. You're ready to `bansur chat` immediately after.

Don't have a subscription yet? [portal.bansur-agent.pages.dev/manage-subscription](https://portal.bansur-agent.pages.dev/manage-subscription) — sign up, then come back and run the command above.

## What's in the subscription

### 300+ frontier models, one bill

The Portal proxies a curated catalog of agentic models from across the ecosystem — billed against your Bansur subscription instead of one credit balance per lab.

| Family | Models |
|--------|--------|
| **Anthropic Claude** | Opus 4.7, Opus 4.6, Sonnet 4.6, Haiku 4.5 |
| **OpenAI** | GPT-5.5, GPT-5.5 Pro, GPT-5.4 Mini, GPT-5.4 Nano, GPT-5.3 Codex |
| **Google Gemini** | Gemini 3 Pro Preview, Gemini 3 Flash Preview, Gemini 3.1 Pro Preview, Gemini 3.1 Flash Lite Preview |
| **DeepSeek** | DeepSeek V4 Pro |
| **Qwen** | Qwen3.7-Max, Qwen3.6-35B-A3B |
| **Kimi / Moonshot** | Kimi K2.6 |
| **GLM / Zhipu** | GLM-5.1 |
| **MiniMax** | MiniMax M2.7 |
| **xAI** | Grok 4.3 |
| **NVIDIA** | Nemotron-3 Super 120B-A12B |
| **Tencent** | Hunyuan 3 Preview |
| **Xiaomi** | MiMo V2.5 Pro |
| **StepFun** | Step 3.5 Flash |
| **Bansur** | Hermes-4-70B, Hermes-4-405B (chat, see [note below](#a-note-on-hermes-4)) |
| **+ everything else** | 280+ additional models — the full agentic frontier |

Under the hood, the Portal routes each model to the backend best suited for it — some models go through OpenRouter, others through proprietary or secondary providers, and the routing for a given model can change over time. Everything is billed against your Bansur subscription either way. Switch between Claude Sonnet 4.6 for code and Gemini 3 Pro for long context with `/model` mid-session — no new credentials, no top-ups, no surprise zero-balance errors.

:::note
Because routing is per-model and not always through OpenRouter, OpenRouter-specific request extensions (such as `provider` routing preferences, `session_id` sticky routing, or top-level `cache_control`) are not part of the Portal's API contract and may be ignored depending on which backend serves the model.
:::

### The Bansur Tool Gateway

The same subscription unlocks the [Tool Gateway](../user-guide/features/tool-gateway.md), which routes Bansur Agent's tool calls through Bansur-managed infrastructure. Five backends, one login:

| Tool | Partner | What it does |
|------|---------|--------------|
| **Web search & extract** | Bansur-managed | Agent-grade search and full-page extraction. No search API key, no rate limit babysitting. |
| **Image generation** | FAL | Nine models under one endpoint: FLUX 2 Klein 9B, FLUX 2 Pro, Z-Image Turbo, Nano Banana Pro (Gemini 3 Pro Image), GPT Image 1.5, GPT Image 2, Ideogram V3, Recraft V4 Pro, Qwen Image. |
| **Text-to-speech** | OpenAI TTS | High-quality TTS without a separate OpenAI key. Enables [voice mode](../user-guide/features/voice-mode.md) across messaging platforms. |
| **Cloud browser automation** | Browser Use | Headless Chromium sessions for `browser_navigate`, `browser_click`, `browser_type`, `browser_vision`. No Browserbase account needed. |
| **Cloud terminal sandbox** | Modal | Serverless terminal sandboxes for code execution (optional add-on). |

Without the gateway, hooking each of those up means a web search account, a FAL account, a Browser Use account, an OpenAI key, and a Modal account — five separate signups, five separate dashboards, five separate top-up flows. With the gateway, all of it routes through one subscription.

You can also enable just specific gateway tools (e.g. web search but not image generation) — see [Mixing the gateway with your own backends](#mixing-the-gateway-with-your-own-backends) below.

### No credentials in your dotfiles

Because everything routes through one OAuth-authenticated Portal session, you don't accumulate a `.env` file with a dozen long-lived API keys. The refresh token at `~/.bansur/auth.json` is the only credential on disk, and Bansur mints short-lived JWTs from it per request — see [Token handling](#token-handling) below.

### Cross-platform parity

[Native Windows](../user-guide/windows-native.md) makes per-tool API key setup its rough edge — installing a web search account, a FAL account, a Browser Use account, an OpenAI key from Windows is the highest-friction part of getting a useful agent. A Portal subscription smooths that out: one OAuth covers the model and every gateway tool, so Windows users get the same experience as macOS/Linux without manually configuring four backends.

## A note on Hermes 4

Bansur's own **Hermes 4** family (Hermes-4-70B, Hermes-4-405B) is available through the Portal at heavily discounted rates. These are **frontier hybrid-reasoning chat models** — strong at math, science, instruction following, schema adherence, roleplay, and long-form writing.

They are **not recommended for use inside Bansur Agent**, however. Hermes 4 is tuned for chat and reasoning, not the rapid-fire tool-calling loop the agent relies on. Use them for research workflows or via the [subscription proxy](../user-guide/features/subscription-proxy.md) from other tooling — but for agent work, pick a frontier agentic model from the catalog instead:

```bash
/model anthropic/claude-sonnet-4.6     # best general-purpose agentic model
/model openai/gpt-5.5-pro              # strong reasoning + tool calling
/model google/gemini-3-pro-preview     # huge context window
/model deepseek/deepseek-v4-pro        # cost-effective coder
```

The Portal's own [model info page](https://portal.bansur-agent.pages.dev/info) carries the same warning, so this isn't a Bansur-side opinion — it's the official guidance from Bansur.

## Setup

### Fresh install — one command

```bash
bansur setup --portal
```

This runs the full setup in one shot:

1. Opens your browser to portal.bansur-agent.pages.dev for OAuth login
2. Stores the refresh token at `~/.bansur/auth.json`
3. Lets you pick a Bansur model from the curated list (or skip to keep your current one)
4. Sets Bansur as your inference provider in `~/.bansur/config.yaml` (when you pick a model)
5. Turns on the Tool Gateway (web, image, TTS, browser routing)
6. Returns you to your terminal ready to `bansur chat`

If you don't have a subscription yet, sign up at [portal.bansur-agent.pages.dev/manage-subscription](https://portal.bansur-agent.pages.dev/manage-subscription) first.

### Existing install — add Portal alongside other providers

If you already have Bansur configured with OpenRouter, Anthropic, or any other provider and you want to add the Portal alongside them:

```bash
bansur model
# pick "Bansur Portal" from the provider list
# browser opens, sign in, done
```

Your existing providers stay configured. You can switch between them with `/model` mid-session or `bansur model` between sessions — the Portal becomes one of your available providers, not your only one.

### Headless / SSH / remote setup

OAuth needs a browser, but the loopback callback runs on the machine where Bansur is running. For remote hosts, see [OAuth over SSH / Remote Hosts](../guides/oauth-over-ssh.md) — the same patterns work for the Portal as for any other OAuth-based provider (`ssh -L` port forwarding).

### Profile setup {#profile-setup}

If you use [Bansur profiles](../user-guide/profiles.md), the Portal refresh token is automatically shared across all profiles via a shared token store. Sign in once on any profile, and the rest pick it up automatically — no need to repeat the OAuth flow per profile.

## Using the Portal day-to-day

### Inspecting what's wired up

```bash
bansur portal            # log in to Bansur Portal + set it up (one-shot onboarding)
bansur portal info       # login status, subscription info, model + gateway routing
bansur portal status     # alias for `portal info`
bansur portal tools      # detailed Tool Gateway catalog with per-tool routing
bansur portal open       # open the subscription management page in your browser
```

`bansur portal` (with no subcommand) is the human-readable alias for `bansur auth add bansur --type oauth` — it logs you in, lets you pick a Bansur model, sets Bansur as your inference provider, and offers the Tool Gateway opt-in (identical to `bansur setup --portal`, and the same Bansur flow as the first-time quick setup).

`bansur portal info` gives you the high-level overview:

```
  Bansur Portal
  ───────────
  Auth:    ✓ logged in
  Portal:  https://portal.bansur-agent.pages.dev
  Model:   ✓ using Bansur as inference provider

  Tool Gateway
  ────────────
  Web search & extract  via Bansur Portal
  Image generation      via Bansur Portal
  Text-to-speech        via Bansur Portal
  Browser automation    via Bansur Portal
  Cloud terminal        not configured
```

### Switching models

Inside a session:

```bash
/model anthropic/claude-sonnet-4.6
/model openai/gpt-5.5-pro
/model google/gemini-3-pro-preview
```

Or open the picker:

```bash
/model
# arrow keys, enter to select
```

Outside a session (the full setup wizard, useful when adding a new provider):

```bash
bansur model
```

### Mixing the gateway with your own backends

If you already have, say, a Browserbase account and want to keep using it while routing web search and image generation through Bansur, that's supported. Use `bansur tools` to pick backends per tool:

```bash
bansur tools
# → Web search       → "Bansur Subscription"
# → Image generation → "Bansur Subscription"
# → Browser          → "Browserbase"  (your existing key)
# → TTS              → "Bansur Subscription"
```

The Tool Gateway is opt-in per tool, not all-or-nothing. The managed backends show up in `bansur tools` whether or not you're logged into Bansur Portal — if you pick "Bansur Subscription" before authenticating, Bansur runs the Portal login inline (it won't change your inference provider or touch your other tools). See the [Tool Gateway docs](../user-guide/features/tool-gateway.md) for the full per-tool configuration matrix.

### Subscription management

Manage your plan, view usage, or upgrade/cancel at any time:

- **Web:** [portal.bansur-agent.pages.dev/manage-subscription](https://portal.bansur-agent.pages.dev/manage-subscription)
- **CLI shortcut:** `bansur portal open` (opens the same page in your default browser)

## Configuration reference

After `bansur setup --portal`, `~/.bansur/config.yaml` will look like:

```yaml
model:
  provider: bansur
  default: anthropic/claude-sonnet-4.6     # or whatever model you picked
  base_url: https://inference-api.bansur-agent.pages.dev/v1
```

The Tool Gateway settings live under their respective tool sections — each category has a single selection key, and picking **Bansur Subscription** in `bansur tools` (or `bansur setup --portal`) writes the value `bansur`:

```yaml
web:
  backend: bansur          # web search/extract routes through Tool Gateway

image_gen:
  provider: bansur

tts:
  provider: bansur

browser:
  cloud_provider: bansur
```

The runtime always follows the stored selection — direct API keys left in `.env` are ignored while a category is set to `bansur`, and picking a direct provider (e.g. `image_gen.provider: fal`) without its key produces a clear error rather than silently rerouting through the gateway. (Older configs used a legacy `use_gateway: true` flag; it is read as equivalent to `bansur` but is no longer written.)

The OAuth refresh token is stored separately at `~/.bansur/auth.json` (not in `config.yaml` — credentials and configuration are kept separate by design).

## Token handling

Bansur mints a short-lived JWT from your stored Portal refresh token on each inference call rather than reusing a long-lived API key. The token lifecycle is fully automatic — refresh, mint, retry on transient 401 — and you never see it.

Long-running gateway and dashboard processes also run a background keepalive that refreshes the token before it expires, so idle agents don't pay a 401 round-trip on their first request of each credential lifetime. The keepalive derives its tick from the lifetime the Portal actually issued (several ticks per lifetime), bounded above by:

```yaml
bansur:
  keepalive_interval_seconds: 900   # upper bound on the tick; 0 disables the keepalive
```

If the Portal invalidates the refresh token (password change, manual revoke, session expiry), the invalid refresh token is **quarantined locally** so Bansur stops replaying it and you don't see a stream of identical 401s. The next call surfaces a clear "re-authentication required" message. Run `bansur auth add bansur` to log in again; the quarantine clears on the next successful login.

## Troubleshooting

### `bansur portal info` shows "not logged in"

You haven't completed the OAuth flow, or your refresh token was wiped. Run:

```bash
bansur portal
```

or use `bansur model` and re-select Bansur Portal.

### Got a "re-authentication required" message mid-session

Your Portal refresh token was invalidated (password change, manual revoke, or session expiry). Run `bansur auth add bansur` and your next request will use the new credentials. Any quarantine on the old token clears automatically on successful re-login.

### Want to use a specific provider model that the Portal doesn't expose

The Portal routes each model to a suitable backend — some through OpenRouter, others through proprietary or secondary providers — so most models OpenRouter supports are generally available. If a specific model isn't appearing in `/model`, try the OpenRouter-style slug directly:

```bash
/model anthropic/claude-opus-4.6
```

If a model is genuinely missing, [open an issue](https://github.com/bansur/agent/issues) — we surface the Portal's catalog to Bansur and gaps usually mean a routing config we can update.

### Bills not appearing on my Portal account

Check `bansur portal info` first — if it shows you're using a different provider (`Model: currently openrouter` instead of `using Bansur as inference provider`), your local config has drifted. Run `bansur model`, pick Bansur Portal, and the next request will route through your subscription.

## See also

- **[Tool Gateway](../user-guide/features/tool-gateway.md)** — Full details on every gateway tool, per-tool config, and pricing
- **[Subscription proxy](../user-guide/features/subscription-proxy.md)** — Use your Portal subscription from non-Bansur tools (other agents, scripts, third-party clients)
- **[Voice mode](../user-guide/features/voice-mode.md)** — Voice conversations using the Portal's OpenAI TTS
- **[AI Providers](./providers.md)** — Full provider catalog if you want to compare alternatives
- **[OAuth over SSH](../guides/oauth-over-ssh.md)** — Login from remote hosts or browser-only environments
- **[Profiles](../user-guide/profiles.md)** — Multiple Bansur configurations sharing one Portal login
