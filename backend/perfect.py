import requests
import time
import json

BASE_URL = 'https://yce-api-01.perfectcorp.com/s2s/v2.0/task/skin-analysis'
START_METHOD = 'POST'
HEADERS = {
  "Content-Type": "application/json",
  "Authorization": "Bearer sk-PqzWbE9NakYiOzQLN0OtHOGYVvAUw4wzIrj1igtjMWvtm6CPTRu87m-5U1MJ8ove"
}

DEFAULT_FILE_URL = "https://plugins-media.makeupar.com/smb/story/2025-10-22/caca1948-6fa2-49cc-9d37-ab4b55be9b66.png"
DEFAULT_DCT_ACTIONS = [
    "acne",
    "droopy_lower_eyelid",
    "pore",
    "redness"
]

def start_task(src_file_url = DEFAULT_FILE_URL, dst_actions = DEFAULT_DCT_ACTIONS):
  data = {
  "src_file_url": DEFAULT_FILE_URL,
  "dst_actions": dst_actions
}
  resp = requests.request(START_METHOD, BASE_URL, headers=HEADERS, json=data)
  if not resp.ok:
    raise RuntimeError(f"Start request failed: {resp.status_code} {resp.reason}")
  payload = resp.json() if resp.content else {}
  task_id = payload.get('data', {}).get('task_id')
  if not task_id:
    raise RuntimeError('task_id not found in response: ' + json.dumps(payload))
  print('[perfect][startTask] Task started, id =', task_id)
  return task_id

def poll_task(task_id, interval_s=2, max_attempts=300):
  for attempt in range(1, max_attempts + 1):
    poll_url = f"{BASE_URL}/{task_id}"
    resp = requests.get(poll_url, headers=HEADERS)
    if not resp.ok:
      raise RuntimeError(f"Polling failed: {resp.status_code} {resp.reason}")
    payload = resp.json() if resp.content else {}
    status = payload.get('data', {}).get('task_status')
    print('[perfect][pollTask] Attempt', attempt, 'status =', status)
    if status == 'success':
      print('[perfect][pollTask] Success results:', payload.get('data', {}).get('results'))
      return payload
    if status == 'error':
      raise RuntimeError('Task failed: ' + json.dumps(payload))
    time.sleep(interval_s)
  raise RuntimeError('Max attempts exceeded while polling')

def get_perfect_data(src_file_url, dst_actions):
  try:
    task_id = start_task(src_file_url, dst_actions)
    final = poll_task(task_id)
    return json.dumps(final, indent=2)
  except Exception as e:
    print('[perfect] Got error during making Perfect API request:', e)
    raise