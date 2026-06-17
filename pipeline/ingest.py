"""
Gmail ingest — fetches all messages from vadimpalmer@yahoo.com, stores raw
subject/body/attachment metadata in pipeline/raw/<message_id>.json.
Idempotent: skips already-processed message IDs.
Run full history on first run; subsequent runs use Gmail history API (incremental).
"""

import argparse
import base64
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

load_dotenv()

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
SENDER = "vadimpalmer@yahoo.com"
RAW_DIR = Path(__file__).parent / "raw"
STATE_FILE = Path(__file__).parent / "state.json"
CREDENTIALS_PATH = os.getenv("GMAIL_CREDENTIALS_PATH", "pipeline/credentials.json")
TOKEN_PATH = Path(__file__).parent / "token.json"


def _get_service():
    creds = None
    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_PATH, SCOPES)
            creds = flow.run_local_server(port=0)
        TOKEN_PATH.write_text(creds.to_json(), encoding="utf-8")
    return build("gmail", "v1", credentials=creds)


def _load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    return {"processed_ids": [], "last_history_id": None}


def _save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def _decode_body(payload: dict) -> str:
    """Recursively extract plain-text body from a Gmail message payload."""
    mime = payload.get("mimeType", "")
    if mime == "text/plain":
        data = payload.get("body", {}).get("data", "")
        return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace") if data else ""
    if mime.startswith("multipart/"):
        for part in payload.get("parts", []):
            text = _decode_body(part)
            if text:
                return text
    return ""


def _extract_attachments(payload: dict) -> list[dict]:
    """Return list of {filename, mime_type, attachment_id} for non-inline attachments."""
    attachments = []
    for part in payload.get("parts", []):
        filename = part.get("filename", "")
        if filename and part.get("body", {}).get("attachmentId"):
            attachments.append({
                "filename": filename,
                "mime_type": part.get("mimeType", ""),
                "attachment_id": part["body"]["attachmentId"],
            })
        attachments.extend(_extract_attachments(part))
    return attachments


def _fetch_and_store(service, msg_id: str, dry_run: bool) -> dict:
    """Fetch a full message and write it to raw/<id>.json. Returns the stored dict."""
    msg = service.users().messages().get(userId="me", id=msg_id, format="full").execute()
    headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
    record = {
        "id": msg_id,
        "thread_id": msg.get("threadId"),
        "history_id": msg.get("historyId"),
        "subject": headers.get("subject", ""),
        "date": headers.get("date", ""),
        "from": headers.get("from", ""),
        "body": _decode_body(msg.get("payload", {})),
        "attachments": _extract_attachments(msg.get("payload", {})),
    }
    if not dry_run:
        out = RAW_DIR / f"{msg_id}.json"
        out.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
    return record


def _list_all_messages(service) -> list[str]:
    """Paginate messages.list to get all message IDs from vadim."""
    ids = []
    page_token = None
    while True:
        kwargs = {"userId": "me", "q": f"from:{SENDER}"}
        if page_token:
            kwargs["pageToken"] = page_token
        result = service.users().messages().list(**kwargs).execute()
        for m in result.get("messages", []):
            ids.append(m["id"])
        page_token = result.get("nextPageToken")
        if not page_token:
            break
    return ids


def _list_new_messages(service, last_history_id: str) -> list[str]:
    """Use history API to get message IDs added since last_history_id."""
    ids = []
    page_token = None
    try:
        while True:
            kwargs = {
                "userId": "me",
                "startHistoryId": last_history_id,
                "historyTypes": ["messageAdded"],
            }
            if page_token:
                kwargs["pageToken"] = page_token
            result = service.users().history().list(**kwargs).execute()
            for h in result.get("history", []):
                for ma in h.get("messagesAdded", []):
                    ids.append(ma["message"]["id"])
            page_token = result.get("nextPageToken")
            if not page_token:
                break
    except Exception as e:
        print(f"[ingest] history API error ({e}), falling back to full scan")
        return None
    return ids


def run(dry_run: bool = False):
    RAW_DIR.mkdir(exist_ok=True)
    service = _get_service()
    state = _load_state()
    processed = set(state["processed_ids"])

    if state["last_history_id"]:
        print(f"[ingest] incremental run from historyId={state['last_history_id']}")
        new_ids = _list_new_messages(service, state["last_history_id"])
        if new_ids is None:
            new_ids = _list_all_messages(service)
    else:
        print("[ingest] first run — fetching full history")
        new_ids = _list_all_messages(service)

    to_process = [mid for mid in new_ids if mid not in processed]
    print(f"[ingest] {len(to_process)} new messages to fetch (of {len(new_ids)} found)")

    latest_history_id = state["last_history_id"]
    for i, mid in enumerate(to_process):
        record = _fetch_and_store(service, mid, dry_run)
        processed.add(mid)
        if record["history_id"]:
            if not latest_history_id or int(record["history_id"]) > int(latest_history_id):
                latest_history_id = record["history_id"]
        if (i + 1) % 20 == 0:
            print(f"[ingest]   {i + 1}/{len(to_process)} …")

    if not dry_run:
        state["processed_ids"] = list(processed)
        state["last_history_id"] = latest_history_id
        _save_state(state)

    print(f"[ingest] done. {'(dry run — nothing written)' if dry_run else f'{len(to_process)} messages stored.'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Connect to Gmail but write nothing")
    parser.add_argument("--incremental", action="store_true", help="Force incremental mode")
    args = parser.parse_args()
    run(dry_run=args.dry_run)
