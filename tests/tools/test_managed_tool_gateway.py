import os
import json
from datetime import datetime, timedelta, timezone, UTC
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import sys
from unittest.mock import patch

from tools import managed_gateway_auth


MODULE_PATH = Path(__file__).resolve().parents[2] / "tools" / "managed_tool_gateway.py"
MODULE_SPEC = spec_from_file_location("managed_tool_gateway_test_module", MODULE_PATH)
assert MODULE_SPEC and MODULE_SPEC.loader
managed_tool_gateway = module_from_spec(MODULE_SPEC)
sys.modules[MODULE_SPEC.name] = managed_tool_gateway
MODULE_SPEC.loader.exec_module(managed_tool_gateway)
is_managed_tool_gateway_ready = managed_tool_gateway.is_managed_tool_gateway_ready
resolve_managed_tool_gateway = managed_tool_gateway.resolve_managed_tool_gateway


def test_resolve_managed_tool_gateway_derives_vendor_origin_from_shared_domain():
    with patch.dict(
        os.environ,
        {
            "TOOL_GATEWAY_DOMAIN": "bansur-agent.pages.dev",
        },
        clear=False,
    ), patch.object(managed_tool_gateway, "managed_bansur_tools_enabled", return_value=True):
        result = resolve_managed_tool_gateway(
            "firecrawl",
            token_reader=lambda: "bansur-token",
        )

    assert result is not None
    assert result.gateway_origin == "https://firecrawl-gateway.bansur-agent.pages.dev"
    assert result.bansur_user_token == "bansur-token"
    assert result.managed_mode is True


def test_resolve_managed_tool_gateway_uses_vendor_specific_override():
    with patch.dict(
        os.environ,
        {
            "BROWSER_USE_GATEWAY_URL": "http://browser-use-gateway.localhost:3009/",
        },
        clear=False,
    ), patch.object(managed_tool_gateway, "managed_bansur_tools_enabled", return_value=True):
        result = resolve_managed_tool_gateway(
            "browser-use",
            token_reader=lambda: "bansur-token",
        )

    assert result is not None
    assert result.gateway_origin == "http://browser-use-gateway.localhost:3009"


def test_resolve_managed_tool_gateway_is_inactive_without_bansur_token():
    with patch.dict(
        os.environ,
        {
            "TOOL_GATEWAY_DOMAIN": "bansur-agent.pages.dev",
        },
        clear=False,
    ), patch.object(managed_tool_gateway, "managed_bansur_tools_enabled", return_value=True):
        result = resolve_managed_tool_gateway(
            "firecrawl",
            token_reader=lambda: None,
        )

    assert result is None


def test_resolve_managed_tool_gateway_is_disabled_without_subscription():
    with patch.dict(os.environ, {"TOOL_GATEWAY_DOMAIN": "bansur-agent.pages.dev"}, clear=False), \
         patch.object(managed_tool_gateway, "managed_bansur_tools_enabled", return_value=False):
        result = resolve_managed_tool_gateway(
            "firecrawl",
            token_reader=lambda: "bansur-token",
        )

    assert result is None


def test_read_bansur_access_token_refreshes_expiring_cached_token(tmp_path, monkeypatch):
    monkeypatch.delenv("TOOL_GATEWAY_USER_TOKEN", raising=False)
    monkeypatch.setenv("BANSUR_HOME", str(tmp_path))
    expires_at = (datetime.now(UTC) + timedelta(seconds=30)).isoformat()
    (tmp_path / "auth.json").write_text(json.dumps({
        "providers": {
            "bansur": {
                "access_token": "stale-token",
                "refresh_token": "refresh-token",
                "expires_at": expires_at,
            }
        }
    }))
    monkeypatch.setattr(
        "bansur_cli.auth.resolve_bansur_access_token",
        lambda refresh_skew_seconds=120: "fresh-token",
    )

    assert managed_tool_gateway.read_bansur_access_token() == "fresh-token"


def test_is_managed_tool_gateway_ready_skips_refresh_for_expired_cached_token(tmp_path, monkeypatch):
    monkeypatch.delenv("TOOL_GATEWAY_USER_TOKEN", raising=False)
    monkeypatch.setenv("BANSUR_HOME", str(tmp_path))
    expired_at = (datetime.now(UTC) - timedelta(seconds=30)).isoformat()
    (tmp_path / "auth.json").write_text(json.dumps({
        "providers": {
            "bansur": {
                "access_token": "expired-token",
                "refresh_token": "refresh-token",
                "expires_at": expired_at,
            }
        }
    }))
    refresh_calls = []

    def _record_refresh(*, refresh_skew_seconds=120, **_kwargs):
        refresh_calls.append(refresh_skew_seconds)
        return "fresh-token"

    monkeypatch.setattr(
        "bansur_cli.auth.resolve_bansur_access_token",
        _record_refresh,
    )

    with patch.dict(
        os.environ,
        {"TOOL_GATEWAY_DOMAIN": "bansur-agent.pages.dev"},
        clear=False,
    ), patch.object(managed_tool_gateway, "managed_bansur_tools_enabled", return_value=True):
        assert is_managed_tool_gateway_ready("modal") is True

    assert refresh_calls == []


def test_connector_gateway_origin_pins_the_deployed_connectors_host():
    # The connectors API is its own deployment on its own canonical host, so
    # the default resolution must not land on the media/vendor origin.
    with patch.dict(
        os.environ,
        {"TOOL_GATEWAY_DOMAIN": "bansur-agent.pages.dev", "TOOL_GATEWAY_SCHEME": "https"},
        clear=False,
    ):
        os.environ.pop("CONNECTOR_GATEWAY_URL", None)
        assert managed_gateway_auth.connector_gateway_origin() == (
            "https://connector-gateway.bansur-agent.pages.dev"
        )

def test_managed_gateway_origin_honors_the_harness_override():
    # TOOL_GATEWAY_URL pins the full media origin (the e2e harness sets it to a
    # loopback gateway), and the bearer gate must accept exactly that origin.
    with patch.dict(os.environ, {"TOOL_GATEWAY_URL": "http://127.0.0.1:3009/"}, clear=False):
        os.environ.pop("CONNECTOR_GATEWAY_URL", None)
        assert managed_gateway_auth.managed_gateway_origin() == "http://127.0.0.1:3009"
        assert managed_gateway_auth.is_managed_bansur_gateway_url(
            "http://127.0.0.1:3009/api/vendorx/generations"
        )
        assert not managed_gateway_auth.is_managed_bansur_gateway_url(
            "https://tools.bansur-agent.pages.dev/api/vendorx/generations"
        )

def test_connector_gateway_origin_honors_its_own_override():
    # CONNECTOR_GATEWAY_URL is the connectors host's own key: it moves the
    # connectors origin without touching the media origin, and the bearer gate
    # accepts the overridden origin.
    with patch.dict(
        os.environ,
        {
            "CONNECTOR_GATEWAY_URL": "http://127.0.0.1:3009/",
            "TOOL_GATEWAY_DOMAIN": "bansur-agent.pages.dev",
        },
        clear=False,
    ):
        os.environ.pop("TOOL_GATEWAY_URL", None)
        assert managed_gateway_auth.connector_gateway_origin() == "http://127.0.0.1:3009"
        assert managed_gateway_auth.managed_gateway_origin() == (
            "https://tool-gateway.bansur-agent.pages.dev"
        )
        assert managed_gateway_auth.is_managed_bansur_gateway_url(
            "http://127.0.0.1:3009/v1/connectors/search"
        )

def test_default_bearer_gate_accepts_both_deployed_hosts_only():
    # Exact (scheme, netloc) equality against each deployed origin. Both
    # first-party hosts are in; the retired `tools.` host, subdomain cousins,
    # and scheme downgrades are all out.
    with patch.dict(
        os.environ,
        {"TOOL_GATEWAY_DOMAIN": "bansur-agent.pages.dev", "TOOL_GATEWAY_SCHEME": "https"},
        clear=False,
    ):
        os.environ.pop("TOOL_GATEWAY_URL", None)
        os.environ.pop("CONNECTOR_GATEWAY_URL", None)
        for trusted in (
            "https://connector-gateway.bansur-agent.pages.dev/v1/connectors/execute",
            "https://tool-gateway.bansur-agent.pages.dev/api/vendorx/generations",
        ):
            assert managed_gateway_auth.is_managed_bansur_gateway_url(trusted)
        for untrusted in (
            "https://tools.bansur-agent.pages.dev/v1/connectors/execute",
            "https://evil-connector-gateway.bansur-agent.pages.dev.attacker.dev/v1/connectors",
            "https://connector-gateway.bansur-agent.pages.dev.attacker.dev/v1/connectors",
            "http://connector-gateway.bansur-agent.pages.dev/v1/connectors",
            "http://tool-gateway.bansur-agent.pages.dev/api/vendorx/generations",
        ):
            assert not managed_gateway_auth.is_managed_bansur_gateway_url(untrusted)


def test_read_bansur_provider_state_falls_back_to_global_root_for_share_auth_profiles(tmp_path, monkeypatch):
    # A profile created with ``share_auth`` has no auth.json of its own; it signs in with the
    # root identity. The connector gate must see that identity, or manage_connections vanishes
    # from the profile's tool list while every other credential reader still works.
    root = tmp_path / ".bansur"
    profile = root / "profiles" / "work"
    profile.mkdir(parents=True)
    (root / "auth.json").write_text(json.dumps({
        "version": 1,
        "providers": {"bansur": {"auth_method": "anonymous", "access_token": "tok"}},
    }))
    monkeypatch.setenv("BANSUR_HOME", str(profile))
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)

    import bansur_constants
    from bansur_cli import auth as auth_mod

    monkeypatch.setattr(bansur_constants, "get_default_bansur_root", lambda: root)
    monkeypatch.setattr(auth_mod, "get_bansur_home", lambda: profile)
    monkeypatch.setattr(auth_mod, "_global_auth_store_cache", None)
    monkeypatch.setattr(auth_mod, "_auth_file_path", lambda: profile / "auth.json")

    state = managed_tool_gateway._read_bansur_provider_state()

    assert state is not None
    assert state["auth_method"] == "anonymous"
