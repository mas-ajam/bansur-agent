"""User-facing copy for assistant-start failures must match the failure's actual cause.

When init dies waiting for a cross-process auth lock — the profile auth-store lock or the shared
Bansur store lock, both on the ``resolve_bansur_access_token`` init path (#124533) — the cause is
contention with another bansur process (a dashboard or a slow credential refresh), so the generic
/model / `bansur setup` hints would send the user re-checking credentials that are fine.
"""

from __future__ import annotations

import pytest

from tui_gateway.user_messages import agent_init_failed_message


@pytest.mark.parametrize("exc_text", [
    "Timed out waiting for auth store lock (/home/u/.bansur/profiles/coder/auth.lock); "
    "another bansur process (pid 4242) probably still holds it",
    "Timed out waiting for auth store lock (/home/u/.bansur/profiles/coder/auth.lock)",
    "Timed out waiting for shared Bansur auth lock (/home/u/.bansur/shared/bansur.lock)",
], ids=["auth-store-with-holder", "auth-store-no-holder", "shared-bansur-store"])
def test_auth_lock_timeout_contention_gets_the_wait_copy(exc_text):
    message = agent_init_failed_message(TimeoutError(exc_text))
    assert "/model" not in message
    assert "bansur setup" not in message
    assert "lock" in message and "dashboard" in message  # actionable: what holds it, what to do


def test_generic_timeout_keeps_the_model_setup_hints():
    # A TimeoutError that is NOT an auth lock (e.g. a network connect timeout) must not
    # be misread as lock contention.
    message = agent_init_failed_message(TimeoutError("connect timed out"))
    assert "/model" in message and "bansur setup" in message


def test_other_init_failures_keep_the_model_setup_hints():
    message = agent_init_failed_message(RuntimeError("provider bootstrap failed"))
    assert "/model" in message and "bansur setup" in message
