import requests
import time
import json

BASE_URL = "https://yce-api-01.perfectcorp.com/s2s/v2.0/task/skin-analysis"
HEADERS = {
    "Content-Type": "application/json",
    "Authorization": "Bearer sk-PqzWbE9NakYiOzQLN0OtHOGYVvAUw4wzIrj1igtjMWvPYbG9iZDqmNyG7-wU23EH",
}

DEFAULT_FILE_URL = "https://plugins-media.makeupar.com/smb/story/2025-10-22/caca1948-6fa2-49cc-9d37-ab4b55be9b66.png"

DEFAULT_DCT_ACTIONS = ["acne", "droopy_lower_eyelid", "pore", "redness"]


def upload_file_bytes(file, presigned_url: str, headers):
    """
    Uploads the actual image bytes to the given presigned S3 URL using PUT.
    headers should be the same headers returned from PerfectCorp's File API response.
    """
    resp = requests.put(
        presigned_url,
        headers=headers,
        data=file,
    )
    if not resp.ok:
        raise RuntimeError(
            f"Failed to upload image bytes: {resp.status_code} {resp.reason} - {resp.text}"
        )


# Helper function for uploading a file to PerfectCorp API
def upload_file(
    file_name="MyFaceAkezhan.png", content_type="image/png", file_size=964516
):
    """
    Uploads a file to PerfectCorp v1.1 file endpoint.
    This mimics the Chrome network request you shared.
    """
    url = "https://yce-api-01.perfectcorp.com/s2s/v1.1/file/skin-analysis"
    headers = {
        "Authorization": HEADERS["Authorization"],
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    payload = {
        "files": [
            {
                "content_type": content_type,
                "file_name": file_name,
                "file_size": file_size,
            }
        ]
    }

    resp = requests.post(url, headers=headers, json=payload)
    if not resp.ok:
        raise RuntimeError(
            f"Upload failed: {resp.status_code} {resp.reason} - {resp.text}"
        )

    data = resp.json()
    print("[perfect][upload_file] Upload successful")
    return data


def start_task(src_file_id, dst_actions=DEFAULT_DCT_ACTIONS):
    data = {"src_file_id": src_file_id, "dst_actions": dst_actions}
    resp = requests.request("POST", BASE_URL, headers=HEADERS, json=data)
    if not resp.ok:
        raise RuntimeError(f"Start request failed: {resp.status_code} {resp.reason}")
    payload = resp.json() if resp.content else {}
    task_id = payload.get("data", {}).get("task_id")
    if not task_id:
        raise RuntimeError("task_id not found in response: " + json.dumps(payload))
    print("[perfect][startTask] Task started, id =", task_id)
    return task_id


def poll_task(task_id, attemps=10):
    last_payload = None
    for _ in range(attemps):
        poll_url = f"{BASE_URL}/{task_id}"
        print(f"[perfect][poll_task] Making polling request on {poll_url}")
        resp = requests.get(poll_url, headers=HEADERS)
        if not resp.ok:
            raise RuntimeError(f"Polling failed: {resp.status_code} {resp.reason}")
        last_payload = resp.json() if resp.content else {}
        status = last_payload.get("data", {}).get("task_status")
        if (status == "running"):
            time.sleep(2)
            continue
        return last_payload
    raise RuntimeError("[perfect][polltask] No success status, latest payload" + json.dumps(last_payload))

def get_perfect_data(src_file_id, dst_actions=DEFAULT_DCT_ACTIONS):
    try:
        task_id = start_task(src_file_id, dst_actions)
        final = poll_task(task_id)
        return json.dumps(final, indent=2)
    except Exception as e:
        print("[perfect] Got error during making Perfect API request:", e)
        raise
