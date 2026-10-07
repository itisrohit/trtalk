"""Connection control endpoints: internal key required, neutral response shape."""

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app import main

EVO = "http://evo.test"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(main.settings, "evolution_url", EVO)
    monkeypatch.setattr(main.settings, "evolution_api_key", "evo-secret")
    monkeypatch.setattr(main.settings, "evolution_instance", "shop")
    monkeypatch.setattr(main.settings, "internal_api_key", "internal")
    return TestClient(main.app)


KEY = {"X-Internal-Api-Key": "internal"}


def test_rejects_calls_without_internal_key(client):
    assert client.get("/admin/connection").status_code == 401
    assert client.post("/admin/connection/logout", headers={"X-Internal-Api-Key": "x"}).status_code == 401


@respx.mock
def test_state_maps_evolution_response_and_sends_api_key(client):
    route = respx.get(f"{EVO}/instance/connectionState/shop").mock(
        return_value=httpx.Response(200, json={"instance": {"state": "open"}})
    )
    assert client.get("/admin/connection", headers=KEY).json() == {"state": "open", "qr": None}
    assert route.calls[0].request.headers["apikey"] == "evo-secret"


@respx.mock
def test_connect_returns_qr(client):
    respx.get(f"{EVO}/instance/connect/shop").mock(
        return_value=httpx.Response(200, json={"base64": "data:image/png;base64,QR"})
    )
    body = client.post("/admin/connection/connect", headers=KEY).json()
    assert body == {"state": "unknown", "qr": "data:image/png;base64,QR"}


@respx.mock
def test_logout_and_restart(client):
    respx.post(f"{EVO}/instance/logout/shop").mock(return_value=httpx.Response(200, json={}))
    respx.post(f"{EVO}/instance/restart/shop").mock(return_value=httpx.Response(200, json={}))
    assert client.post("/admin/connection/logout", headers=KEY).json()["state"] == "close"
    assert client.post("/admin/connection/restart", headers=KEY).json()["state"] == "connecting"


@respx.mock
def test_evolution_error_is_502(client):
    respx.get(f"{EVO}/instance/connectionState/shop").mock(return_value=httpx.Response(401))
    assert client.get("/admin/connection", headers=KEY).status_code == 502
