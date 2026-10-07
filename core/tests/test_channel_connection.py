"""Channel connection control: admin (JWT) → core → gateway /admin/connection.

The admin panel never talks to a channel provider directly, so provider keys
(e.g. Evolution's) stay on the server instead of in the browser bundle.
"""

import uuid

import httpx
import pytest

from app.core.config import settings
from app.services import channel_send
from app.services.admin_service import create_admin_access_token


class FakeResponse:
    def __init__(self, status_code: int, body=None):
        self.status_code = status_code
        self._body = body

    def json(self):
        return self._body


class FakeAsyncClient:
    def __init__(self, response, recorded: list):
        self._response = response
        self._recorded = recorded

    def __call__(self, **kwargs):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def request(self, method, url, headers=None):
        if isinstance(self._response, Exception):
            raise self._response
        self._recorded.append({"method": method, "url": url, "headers": headers})
        return self._response


@pytest.fixture
def gateway(monkeypatch):
    monkeypatch.setattr(settings, "channel_whatsapp_send_url", "http://gw:8001/send")
    monkeypatch.setattr(settings, "internal_api_key", "sekret")

    def respond(response) -> list:
        recorded: list = []
        monkeypatch.setattr(
            channel_send.httpx, "AsyncClient", FakeAsyncClient(response, recorded)
        )
        return recorded

    return respond


@pytest.fixture
def admin_headers() -> dict:
    token = create_admin_access_token(uuid.uuid4(), "admin@test.local", "super_admin")
    return {"Authorization": f"Bearer {token}"}


async def test_requires_admin_login(client):
    response = await client.get("/admin/channels/whatsapp/connection")
    assert response.status_code == 401


async def test_state_is_read_from_the_gateway(client, gateway, admin_headers):
    recorded = gateway(FakeResponse(200, {"state": "open", "qr": None}))

    response = await client.get("/admin/channels/whatsapp/connection", headers=admin_headers)

    assert response.status_code == 200
    assert response.json() == {"state": "open", "qr": None}
    assert recorded == [
        {
            "method": "GET",
            "url": "http://gw:8001/admin/connection",
            "headers": {"X-Internal-API-Key": "sekret"},
        }
    ]


async def test_connect_returns_qr(client, gateway, admin_headers):
    recorded = gateway(FakeResponse(200, {"state": "connecting", "qr": "data:image/png;base64,QR"}))

    response = await client.post(
        "/admin/channels/whatsapp/connection/connect", headers=admin_headers
    )

    assert response.json()["qr"] == "data:image/png;base64,QR"
    assert recorded[0]["method"] == "POST"
    assert recorded[0]["url"] == "http://gw:8001/admin/connection/connect"


async def test_unknown_action_is_rejected_without_calling_gateway(client, gateway, admin_headers):
    recorded = gateway(FakeResponse(200, {}))

    response = await client.post(
        "/admin/channels/whatsapp/connection/delete-everything", headers=admin_headers
    )

    assert response.status_code == 404
    assert recorded == []


async def test_gateway_without_connection_control_is_404(client, gateway, admin_headers):
    gateway(FakeResponse(404, {"detail": "Not Found"}))

    response = await client.get("/admin/channels/whatsapp/connection", headers=admin_headers)

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "NOT_SUPPORTED"


async def test_unreachable_gateway_is_502(client, gateway, admin_headers):
    gateway(httpx.ConnectError("down"))

    response = await client.get("/admin/channels/whatsapp/connection", headers=admin_headers)

    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "GATEWAY_UNREACHABLE"


async def test_unconfigured_channel_is_404(client, admin_headers, monkeypatch):
    monkeypatch.setattr(settings, "channel_telegram_send_url", None)

    response = await client.get("/admin/channels/telegram/connection", headers=admin_headers)

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "CHANNEL_NOT_CONFIGURED"
