# Development WhatsApp testing with Evolution API

This is a development-only alternative to the official `whatsapp` PyWa
gateway. It connects a separate WhatsApp number through Evolution API and
QR-pairs it through WhatsApp Web/Baileys. Do not use a production customer
number or real payment credentials with it.

## Start the stack

Start Docker Desktop, then from the repository root:

```bash
docker compose -f docker-compose.yml -f docker-compose.evolution.yml \
  --profile evolution up -d --build
```

This starts TrTalk, PostgreSQL/pgvector, Evolution API, Evolution's Redis
and database, and the adapter at `http://localhost:8001`.

### Free-tier model setup (Groq + Sarvam, Gemini for embeddings only)

Export these in the shell (or the root `.env`) before `up`:

```bash
# Chat: text + images in one Groq model
LLM_PROVIDER=openai
LLM_MODEL=qwen/qwen3.8-27b
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_API_KEY=<groq key>
LLM_REASONING_EFFORT=none
# Punjabi replies: Sarvam chat (natural Roman/Gurmukhi Punjabi; text turns
# only, falls back to the Groq model on error)
LLM_ALT_LANGUAGES=pa-IN
LLM_ALT_MODEL=sarvam-105b-conversations
LLM_ALT_BASE_URL=https://api.sarvam.ai/v1
# Voice notes: Sarvam Saaras (Indic-trained; also detects the spoken
# language, so voice turns skip the separate LID call). Replies to voice
# notes are always in Roman script, in the language that was spoken.
STT_PROVIDER=sarvam
STT_API_KEY=<sarvam key>
STT_MODEL=saaras:v3
# Reply language/script lock for typed text
SARVAM_API_KEY=<sarvam key>
# Embeddings only (memory + FAQ search)
GOOGLE_API_KEY=<gemini key>
```

Changing the chat model does not require re-embedding; changing
`EMBEDDING_PROVIDER`/`EMBEDDING_MODEL` does.

## Create and QR-pair the instance

Evolution's API uses an API key and creates an instance with QR enabled. The
following commands create the instance and configure its message webhook:

```bash
curl -X POST http://localhost:8080/instance/create \
  -H 'Content-Type: application/json' \
  -H 'apikey: dev-evolution-key' \
  -d '{"instanceName":"agproto","qrcode":true,"integration":"WHATSAPP-BAILEYS"}'

curl -X POST http://localhost:8080/webhook/set/agproto \
  -H 'Content-Type: application/json' \
  -H 'apikey: dev-evolution-key' \
  -d '{"enabled":true,"url":"http://evolution-gateway:8001/webhook","webhookByEvents":false,"webhookBase64":true,"events":["MESSAGES_UPSERT"]}'
```

Fetch the QR code and scan it from WhatsApp → Linked devices:

```bash
curl -H 'apikey: dev-evolution-key' \
  http://localhost:8080/instance/connect/agproto
```

The exact QR response shape can vary by Evolution API release; use the
returned `base64`/`code` value or open Evolution's Swagger UI at
`http://localhost:8080/docs`.

## Test

Send a message from another WhatsApp account to the paired number. The
Evolution webhook forwards it to TrTalk's `/ingest`; TrTalk's response is
sent back through Evolution. Voice notes are forwarded when Evolution sends
media base64 in the webhook; TrTalk can then use its configured native-audio
model or STT fallback.

## History sync safety

On reconnect, WhatsApp can replay older messages. The Evolution gateway stores
those messages in TrTalk's inbox for context, but marks any message timestamped
before gateway startup as history and does **not** trigger a bot response.
Repeated webhook deliveries are also deduplicated by WhatsApp message ID. This
is enabled by default; only change `SUPPRESS_HISTORY_REPLIES` for deliberate
backfill experiments.

Evolution documents `MESSAGES_UPSERT` webhooks, instance creation, webhook
configuration, and `sendText`/`sendMedia` endpoints in its API documentation.
