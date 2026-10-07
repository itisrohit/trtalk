"""Channel connection control for the admin panel (pair / status / logout).

Generic over channels — `channel` is a path param and the request is forwarded
to that channel's gateway through the canonical seam (app/services/
channel_send.py). The core never learns which provider sits behind a gateway;
the gateway keeps the provider's credentials, so none ship to the browser.
"""

from fastapi import APIRouter, HTTPException, status

from app.services import channel_send

router = APIRouter()

_STATUS = {
    "CHANNEL_NOT_CONFIGURED": status.HTTP_404_NOT_FOUND,
    "NOT_SUPPORTED": status.HTTP_404_NOT_FOUND,
}


async def _forward(channel: str, action: str | None) -> dict:
    try:
        return await channel_send.connection(channel, action)
    except channel_send.ChannelSendError as exc:
        raise HTTPException(
            status_code=_STATUS.get(exc.code, status.HTTP_502_BAD_GATEWAY),
            detail={"code": exc.code, "message": exc.message},
        ) from exc


@router.get("/{channel}/connection")
async def get_connection(channel: str) -> dict:
    return await _forward(channel, None)


@router.post("/{channel}/connection/{action}")
async def change_connection(channel: str, action: str) -> dict:
    if action not in channel_send.CONNECTION_ACTIONS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Unknown action")
    return await _forward(channel, action)
