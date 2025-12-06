import requests
import json
import time

def test_chat():
    url = "http://localhost:8000/api/chat"
    
    # Request 1
    payload1 = {"query": "Hello, my name is Antigravity. Remember that.", "user_id": "test_user_1"}
    print(f"\n--- Sending Request 1: {payload1['query']} ---")
    try:
        with requests.post(url, json=payload1, stream=True) as r:
            if r.status_code == 200:
                for chunk in r.iter_content(chunk_size=None):
                    if chunk:
                        print(chunk.decode('utf-8'), end='', flush=True)
            else:
                print(f"Error: {r.text}")
    except Exception as e:
        print(f"Connection failed: {e}")

    print("\n")
    time.sleep(2)

    # Request 2
    payload2 = {"query": "What is my name?", "user_id": "test_user_1"}
    print(f"--- Sending Request 2: {payload2['query']} ---")
    try:
        with requests.post(url, json=payload2, stream=True) as r:
            if r.status_code == 200:
                for chunk in r.iter_content(chunk_size=None):
                    if chunk:
                        print(chunk.decode('utf-8'), end='', flush=True)
            else:
                print(f"Error: {r.text}")
    except Exception as e:
        print(f"Connection failed: {e}")
    print("\n")

if __name__ == "__main__":
    test_chat()
