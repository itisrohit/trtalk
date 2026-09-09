from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Server — 8001 so it runs alongside the WhatsApp gateway (8000) locally
    port: int = 8001

    # Telegram Bot API
    telegram_bot_token: str
    # Shared secret echoed back by Telegram in the
    # `X-Telegram-Bot-Api-Secret-Token` header on every webhook call — the
    # gateway's authenticity check (Telegram's analog of Meta's app_secret HMAC).
    telegram_webhook_secret: str
    # Dev only (e.g. ngrok): when set, the gateway calls setWebhook on startup.
    # In production the webhook is registered once, out of band.
    telegram_webhook_url: str | None = None

    # TrTalk core
    core_url: str = "http://localhost:8090"
    internal_api_key: str = ""

    # User-facing gateway fallbacks. English by default (English-only codebase);
    # set them in your users' language via .env — the same posture as the core's
    # FALLBACK_REPLY. The agent itself localizes via the DB system prompt; these
    # only fire when the core is unreachable or a message type isn't handled.
    error_reply: str = (
        "Sorry, we hit a technical issue. Please try again in a few minutes."
    )
    unsupported_reply: str = (
        "For now I only handle text, audio, images and buttons. "
        "Send me a message and I'll be glad to help."
    )

    # Sentry (optional)
    sentry_dsn: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
