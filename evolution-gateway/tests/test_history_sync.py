from datetime import timedelta

from app import main


def _payload(timestamp: float) -> dict:
    return {
        "event": "messages.upsert",
        "data": {
            "key": {"remoteJid": "919999999999@s.whatsapp.net", "id": "abc"},
            "message": {"conversation": "hello"},
            "messageTimestamp": timestamp,
        },
    }


def test_history_replay_is_persisted_but_reply_is_suppressed(monkeypatch):
    monkeypatch.setattr(main, "GATEWAY_STARTED_AT", main.datetime.now(main.timezone.utc))
    old = main.GATEWAY_STARTED_AT - timedelta(seconds=20)

    canonical = main.canonical_payload(_payload(old.timestamp()))

    assert canonical is not None
    assert canonical["suppress_reply"] is True
    assert canonical["message"]["raw"]["history_replay"] is True


def test_new_message_after_startup_can_receive_a_reply(monkeypatch):
    now = main.datetime.now(main.timezone.utc)
    monkeypatch.setattr(main, "GATEWAY_STARTED_AT", now - timedelta(seconds=20))

    canonical = main.canonical_payload(_payload(now.timestamp()))

    assert canonical is not None
    assert canonical["suppress_reply"] is False
    assert canonical["message"]["raw"]["history_replay"] is False
