"""Bridge Evolution API webhooks to the TrTalk canonical contract.

This adapter is intentionally separate from the official PyWa gateway. It is
for local prototyping with a separate WhatsApp number connected by QR code.
"""

from __future__ import annotations

import base64
import logging
import re
import subprocess
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    evolution_url: str = "http://localhost:8080"
    evolution_api_key: str
    evolution_instance: str = "agproto"
    core_url: str = "http://localhost:8090"
    internal_api_key: str = ""
    webhook_secret: str = ""
    allow_groups: bool = False
    # WhatsApp replays history after a reconnect. Preserve it in the inbox but
    # do not let old messages create fresh automated replies.
    suppress_history_replies: bool = True
    history_replay_clock_skew_seconds: int = 10
    http_timeout_seconds: float = 30.0

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
app = FastAPI(title="Agproto Evolution Gateway", version="0.1.0")
# Messages timestamped before this adapter was online are history/replay
# traffic, not a new live customer request. A small skew avoids suppressing a
# message sent at the exact moment the container starts.
GATEWAY_STARTED_AT = datetime.now(timezone.utc)


def _data(payload: dict[str, Any]) -> dict[str, Any]:
    value = payload.get("data")
    return value if isinstance(value, dict) else payload


def _message(data: dict[str, Any]) -> dict[str, Any]:
    value = data.get("message")
    return value if isinstance(value, dict) else {}


def _jid_number(jid: str | None) -> str | None:
    if not jid:
        return None
    return re.sub(r"[^0-9]", "", jid.split("@", 1)[0]) or None


def _text(message: dict[str, Any]) -> str | None:
    for key in ("conversation", "text"):
        if isinstance(message.get(key), str):
            return message[key]
    extended = message.get("extendedTextMessage")
    if isinstance(extended, dict) and isinstance(extended.get("text"), str):
        return extended["text"]
    return None


def _nested_media(message: dict[str, Any]) -> tuple[str, dict[str, Any]] | None:
    for kind, value in message.items():
        if kind in {"audioMessage", "imageMessage", "documentMessage", "stickerMessage", "videoMessage"} and isinstance(value, dict):
            return kind.removesuffix("Message"), value
    return None


def _message_time(data: dict[str, Any]) -> datetime | None:
    """Parse Evolution's Unix message timestamp to an aware UTC datetime."""
    try:
        timestamp = data.get("messageTimestamp")
        return datetime.fromtimestamp(float(timestamp), tz=timezone.utc) if timestamp else None
    except (TypeError, ValueError, OverflowError):
        return None


def _is_history_replay(data: dict[str, Any]) -> bool:
    """True for a sync/reconnect replay that predates this gateway process."""
    if not settings.suppress_history_replies:
        return False
    message_time = _message_time(data)
    if message_time is None:
        # Missing timestamps are treated as live rather than risking a dropped
        # new customer message.
        return False
    cutoff = GATEWAY_STARTED_AT - timedelta(
        seconds=max(settings.history_replay_clock_skew_seconds, 0)
    )
    return message_time < cutoff


def _media_uri(message: dict[str, Any], media: dict[str, Any]) -> str | None:
    raw = media.get("base64") or message.get("base64") or message.get("base64Message")
    if not isinstance(raw, str) or not raw:
        return None
    if raw.startswith("data:"):
        return raw
    mime = media.get("mimetype") or media.get("mimeType") or "application/octet-stream"
    # Validate enough to avoid forwarding malformed payloads to the core.
    try:
        base64.b64decode(raw, validate=True)
    except Exception:
        logger.warning("Ignoring malformed Evolution media base64")
        return None
    return f"data:{mime};base64,{raw}"


def _gif_first_frame(media_uri: str) -> str | None:
    """Extract a small JPEG preview from an animated GIF/video payload."""
    header, _, encoded = media_uri.partition(",")
    try:
        raw = base64.b64decode(encoded, validate=True)
        frame = subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
             "-frames:v", "1", "-f", "image2", "-c:v", "mjpeg", "pipe:1"],
            input=raw,
            capture_output=True,
            timeout=10,
            check=False,
        ).stdout
    except (ValueError, OSError, subprocess.SubprocessError):
        return None
    return f"data:image/jpeg;base64,{base64.b64encode(frame).decode()}" if frame else None


def canonical_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    data = _data(payload)
    key = data.get("key") or {}
    if not isinstance(key, dict) or key.get("fromMe"):
        return None
    jid = key.get("remoteJid") or key.get("remoteJidAlt")
    if not isinstance(jid, str) or jid.endswith("@g.us") or jid in {"status@broadcast", "broadcast"}:
        if not settings.allow_groups:
            return None
    number = _jid_number(jid)
    if not number:
        return None

    message = _message(data)
    media_info = _nested_media(message)
    mtype = "text"
    text = _text(message)
    media_url = None
    if media_info:
        kind, media = media_info
        # Static WhatsApp stickers are WebP images and can use the vision path.
        # Animated GIFs arrive as videoMessage and are deliberately handled by
        # the core's unsupported-media fallback to keep latency/cost bounded.
        mtype = "audio" if kind == "audio" else "image" if kind in {"image", "sticker"} else "document" if kind == "document" else "video"
        text = text or media.get("caption")
        media_url = _media_uri(message, media)
        # WhatsApp commonly transports GIFs as videoMessage with gifPlayback.
        # Convert only those to a first-frame image; ordinary videos remain
        # unsupported so we do not add a full video-processing pipeline.
        if kind == "video" and media_url and (media.get("gifPlayback") or media.get("isGif")):
            first_frame = _gif_first_frame(media_url)
            if first_frame:
                mtype = "image"
                media_url = first_frame

    message_time = _message_time(data)
    history_replay = _is_history_replay(data)
    received = (message_time or datetime.now(timezone.utc)).isoformat()

    return {
        "channel": "whatsapp",
        "contact": {
            "external_id": number,
            "wa_id": number,
            "display_name": data.get("pushName"),
            "metadata": {"evolution_jid": jid},
        },
        "message": {
            "type": mtype,
            "text": text,
            "media_url": media_url,
            "raw": {
                "wamid": key.get("id"),
                "source": "evolution-api",
                "history_replay": history_replay,
            },
        },
        "received_at": received,
        "suppress_reply": history_replay,
    }


async def _core_ingest(payload: dict[str, Any]) -> dict[str, Any]:
    headers = {"X-Internal-Api-Key": settings.internal_api_key} if settings.internal_api_key else {}
    async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
        response = await client.post(f"{settings.core_url.rstrip('/')}/ingest", json=payload, headers=headers)
        response.raise_for_status()
        return response.json()


async def _evolution_send(number: str, message: dict[str, Any]) -> dict[str, Any]:
    base = f"{settings.evolution_url.rstrip('/')}/message"
    headers = {"apikey": settings.evolution_api_key}
    async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
        if message.get("type", "text") == "text":
            response = await client.post(
                f"{base}/sendText/{settings.evolution_instance}",
                headers=headers,
                json={"number": number, "text": message.get("text", "")},
            )
        else:
            media = message.get("media_url")
            if not isinstance(media, str) or not media.startswith("data:"):
                raise HTTPException(422, "Evolution media replies require a data URI")
            response = await client.post(
                f"{base}/sendMedia/{settings.evolution_instance}",
                headers={**headers, "Content-Type": "application/json"},
                json={
                    "number": number,
                    "mediatype": message.get("type", "audio"),
                    "media": media,
                    "caption": message.get("text"),
                    "fileName": message.get("filename") or "reply",
                },
            )
        response.raise_for_status()
        return response.json()


@app.post("/webhook")
async def webhook(payload: dict[str, Any], x_webhook_secret: str | None = Header(default=None)):
    if settings.webhook_secret and x_webhook_secret != settings.webhook_secret:
        raise HTTPException(401, "Invalid webhook secret")
    event = str(payload.get("event", "")).upper().replace(".", "_")
    if event and event not in {"MESSAGES_UPSERT", "MESSAGES_UPSERT"}:
        return {"status": "ignored", "event": event}
    canonical = canonical_payload(payload)
    if not canonical:
        return {"status": "ignored"}
    try:
        result = await _core_ingest(canonical)
        number = canonical["contact"]["wa_id"]
        for message in result.get("messages", []):
            await _evolution_send(number, message)
    except httpx.HTTPError:
        logger.exception("Evolution webhook processing failed")
        # Return 200 to prevent Evolution from retrying an already accepted event.
        return {"status": "accepted", "forwarded": False}
    return {"status": "accepted", "forwarded": True}


@app.post("/send")
async def send(payload: dict[str, Any], x_internal_api_key: str | None = Header(default=None)):
    if settings.internal_api_key and x_internal_api_key != settings.internal_api_key:
        raise HTTPException(401, "Invalid internal API key")
    contact = payload.get("contact") or {}
    number = _jid_number(contact.get("wa_id") or contact.get("external_id"))
    if not number:
        raise HTTPException(400, "A WhatsApp number is required")
    return await _evolution_send(number, payload.get("message") or {})


# ---------------------------------------------------------------------------
# Connection control — the admin panel reaches these through the core
# (`/admin/channels/whatsapp/connection…`, admin JWT), never directly: the
# Evolution API key stays server-side instead of shipping in the browser bundle.
# Responses use a channel-neutral shape: {"state": ..., "qr": <data URI|null>}.
# ---------------------------------------------------------------------------


def _require_internal_key(key: str | None) -> None:
    if settings.internal_api_key and key != settings.internal_api_key:
        raise HTTPException(401, "Invalid internal API key")


async def _evolution_instance(method: str, action: str) -> dict[str, Any]:
    url = f"{settings.evolution_url.rstrip('/')}/instance/{action}/{settings.evolution_instance}"
    async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
        response = await client.request(method, url, headers={"apikey": settings.evolution_api_key})
    if response.status_code >= 400:
        raise HTTPException(502, f"Evolution API returned {response.status_code}")
    return response.json() if response.content else {}


def _state(body: dict[str, Any]) -> str:
    instance = body.get("instance")
    if not isinstance(instance, dict):
        return "unknown"
    return instance.get("state") or "unknown"


@app.get("/admin/connection")
async def connection_state(x_internal_api_key: str | None = Header(default=None)):
    _require_internal_key(x_internal_api_key)
    return {"state": _state(await _evolution_instance("GET", "connectionState")), "qr": None}


@app.post("/admin/connection/connect")
async def connection_connect(x_internal_api_key: str | None = Header(default=None)):
    """Start pairing: returns a QR (data URI) to scan, or state "open" if paired."""
    _require_internal_key(x_internal_api_key)
    body = await _evolution_instance("GET", "connect")
    return {"state": _state(body), "qr": body.get("base64") or None}


@app.post("/admin/connection/restart")
async def connection_restart(x_internal_api_key: str | None = Header(default=None)):
    _require_internal_key(x_internal_api_key)
    await _evolution_instance("POST", "restart")
    return {"state": "connecting", "qr": None}


@app.post("/admin/connection/logout")
async def connection_logout(x_internal_api_key: str | None = Header(default=None)):
    _require_internal_key(x_internal_api_key)
    await _evolution_instance("POST", "logout")
    return {"state": "close", "qr": None}


@app.get("/health")
async def health():
    return {"status": "ok", "service": "agproto-evolution-gateway"}
