"""Bridge Evolution API webhooks to the Chasqui canonical contract.

This adapter is intentionally separate from the official PyWa gateway. It is
for local prototyping with a separate WhatsApp number connected by QR code.
"""

from __future__ import annotations

import base64
import logging
import re
import subprocess
from datetime import datetime, timezone
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
    http_timeout_seconds: float = 30.0

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
app = FastAPI(title="Agproto Evolution Gateway", version="0.1.0")


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

    timestamp = data.get("messageTimestamp")
    try:
        received = datetime.fromtimestamp(float(timestamp), tz=timezone.utc).isoformat() if timestamp else datetime.now(timezone.utc).isoformat()
    except (TypeError, ValueError, OverflowError):
        received = datetime.now(timezone.utc).isoformat()

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
            "raw": {"wamid": key.get("id"), "source": "evolution-api"},
        },
        "received_at": received,
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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "agproto-evolution-gateway"}
