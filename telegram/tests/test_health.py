from fastapi.testclient import TestClient

from app.main import app


def test_health():
    with TestClient(app) as client:
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok", "service": "trtalk-telegram"}


def test_webhook_rejects_bad_secret():
    with TestClient(app) as client:
        resp = client.post("/webhook", json={}, headers={"X-Telegram-Bot-Api-Secret-Token": "wrong"})
        assert resp.status_code == 401
