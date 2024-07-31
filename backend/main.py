from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBasicCredentials, HTTPBasic
from pydantic import BaseModel
from typing import Dict
from uuid import uuid4
from starlette.websockets import WebSocket, WebSocketDisconnect
import json

app = FastAPI()
security = HTTPBasic()

active_links: Dict[str, int] = {}  # Track active links with expiration times

class CreateLinkResponse(BaseModel):
    link: str

@app.post("/generate")
async def generate_link(credentials: HTTPBasicCredentials = Depends(security)):
    if credentials.username != "admin" or credentials.password != "password":
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    # Generate a unique link with an expiration time of 3 hours
    link_id = str(uuid4())
    expiration_time = 3 * 60 * 60  # 3 hours in seconds
    active_links[link_id] = expiration_time
    link = f"http://localhost:8080/meeting/{link_id}"
    return CreateLinkResponse(link=link)

@app.websocket("/ws/{link_id}/{participant_id}")
async def websocket_endpoint(websocket: WebSocket, link_id: str, participant_id: str):
    if link_id not in active_links:
        await websocket.close(code=4000)
        return

    # Handle WebSocket connection
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            for connection in websocket.application_state.connections:
                if connection != websocket:
                    await connection.send_text(data)
    except WebSocketDisconnect:
        pass

    # Handle disconnection
    if link_id in active_links:
        del active_links[link_id]
