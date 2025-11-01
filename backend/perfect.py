# Requirements: Python >= 3.6 (for f-strings), requests >= 2.20.0
# 1. Starts an async task
# 2. Polls until the task status becomes success or error
import requests
import time
import json

BASE_URL = 'https://yce-api-01.perfectcorp.com/s2s/v2.0/task/skin-analysis'
START_METHOD = 'POST'
HEADERS = {
  "Content-Type": "application/json",
  "Authorization": "Bearer sk-PqzWbE9NakYiOzQLN0OtHOGYVvAUw4wzIrj1igtjMWvtm6CPTRu87m-5U1MJ8ove"
}

def start_task():
  data = {
  "src_file_id": "NWLhsTZDX4hrVCURTV1QeMCE0qywstjWJjCjVfuK0psLbKfeLEmuXUa9yH4wuc2K",
  "dst_actions": [
    "acne",
    "droopy_lower_eyelid",
    "pore",
    "redness"
  ]
}
  resp = requests.request(START_METHOD, BASE_URL, headers=HEADERS, json=data)
  if not resp.ok:
    raise RuntimeError(f"Start request failed: {resp.status_code} {resp.reason}")
  payload = resp.json() if resp.content else {}
  task_id = payload.get('data', {}).get('task_id')
  if not task_id:
    raise RuntimeError('task_id not found in response: ' + json.dumps(payload))
  print('[startTask] Task started, id =', task_id)
  return task_id

def poll_task(task_id, interval_s=2, max_attempts=300):
  for attempt in range(1, max_attempts + 1):
    poll_url = f"{BASE_URL}/{task_id}"
    resp = requests.get(poll_url, headers=HEADERS)
    if not resp.ok:
      raise RuntimeError(f"Polling failed: {resp.status_code} {resp.reason}")
    payload = resp.json() if resp.content else {}
    status = payload.get('data', {}).get('task_status')
    print('[pollTask] Attempt', attempt, 'status =', status)
    if status == 'success':
      print('[pollTask] Success results:', payload.get('data', {}).get('results'))
      return payload
    if status == 'error':
      raise RuntimeError('Task failed: ' + json.dumps(payload))
    time.sleep(interval_s)
  raise RuntimeError('Max attempts exceeded while polling')