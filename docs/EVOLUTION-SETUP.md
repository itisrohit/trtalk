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

This starts Chasqui, PostgreSQL/pgvector, Evolution API, Evolution's Redis
and database, and the adapter at `http://localhost:8001`.

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
Evolution webhook forwards it to Chasqui's `/ingest`; Chasqui's response is
sent back through Evolution. Voice notes are forwarded when Evolution sends
media base64 in the webhook; Chasqui can then use its configured native-audio
model or STT fallback.

Evolution documents `MESSAGES_UPSERT` webhooks, instance creation, webhook
configuration, and `sendText`/`sendMedia` endpoints in its API documentation.
