"""Bansur Portal provider profile."""

from typing import Any

from agent.portal_tags import get_affinity_scope, get_conversation_context, bansur_portal_tags
from agent.transports.codex import _cache_scope_from_session_id
from providers import register_provider
from providers.base import ProviderProfile


class BansurProfile(ProviderProfile):
    """Bansur Portal — product tags, reasoning with Bansur-specific omission."""

    def resolve_aux_model(self, *, vision: bool = False) -> str:
        """Portal's tier-aware ``/api/bansur/recommended-models`` pick (cached, offline-safe)."""
        try:
            from bansur_cli.models import get_bansur_recommended_aux_model

            return get_bansur_recommended_aux_model(vision=vision) or ""
        except Exception:
            return ""

    def build_extra_body(self, *, session_id: str | None = None, **context) -> dict[str, Any]:
        body: dict[str, Any] = {"tags": bansur_portal_tags(session_id=session_id)}
        # Top-level session_id = sticky routing key, so Anthropic-style cache
        # breakpoints stay warm on one upstream instance. Resolved like the
        # ``conversation=`` tag: declared scope, then the ambient lineage ROOT
        # (covers aux call sites that pass no session_id), then the explicit argument.
        sticky_key = _cache_scope_from_session_id(get_affinity_scope() or get_conversation_context() or session_id)
        if sticky_key:
            body["session_id"] = sticky_key
        # Bansur Portal inference rejects caller-supplied provider routing prefs
        # (only/ignore/order/sort/data_collection/zdr/require_parameters) with
        # HTTP 400 — routing is decided centrally per model. provider_routing
        # from config.yaml is OpenRouter-only, so it is not forwarded here.
        return body

    @staticmethod
    def _cannot_disable_reasoning(model: str | None) -> bool:
        """True when ``reasoning: {enabled: false}`` would 400 on *model*. Cache-only catalog
        lookup; unknown/cold (warmer kicked) and no-reasoning routes both answer True (omit > 400)."""
        try:
            from bansur_cli.models_reasoning_caps import bansur_model_reasoning_capabilities, warm_bansur_reasoning_caps_async

            caps = bansur_model_reasoning_capabilities(model)
            if caps is None:
                warm_bansur_reasoning_caps_async()
                return True
        except Exception:
            return True
        return not caps.get("supports_reasoning") or bool(caps.get("mandatory"))

    def build_api_kwargs_extras(
        self, *, reasoning_config: dict | None = None, supports_reasoning: bool = False,
        model: str | None = None, **context,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """Pass the full reasoning_config, disable included (the Portal honors it;
        omitting it means the upstream default, thinking ON for V4-class models)."""
        if not supports_reasoning:
            return {}, {}
        if reasoning_config is None:
            return {"reasoning": {"enabled": True, "effort": "medium"}}, {}
        rc = dict(reasoning_config)
        if rc.get("enabled") is False and self._cannot_disable_reasoning(model):
            return {}, {}
        return {"reasoning": rc}, {}


bansur = BansurProfile(
    name="bansur", aliases=("bansur-portal", "bansur"), env_vars=("BANSUR_API_KEY",),
    display_name="Bansur", description="Bansur — Bansur model family",
    signup_url="https://bansur-agent.pages.dev/", fallback_models=("hermes-3-405b", "hermes-3-70b"),
    base_url="https://inference-api.bansur-agent.pages.dev/v1", auth_type="oauth_device_code",
)

register_provider(bansur)
