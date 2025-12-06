import requests
import json

def test_chat():
    url = "http://localhost:8000/api/chat"
    payload = {"query": "Hello, what documents did I upload?"}
    
    print("Sending request...")
    try:
        with requests.post(url, json=payload, stream=True) as r:
            print(f"Status: {r.status_code}")
            if r.status_code == 200:
                print("--- Stream Start ---")
                for chunk in r.iter_content(chunk_size=None):
                    if chunk:
                        print(chunk.decode('utf-8'), end='', flush=True)
                print("\n--- Stream End ---")
            else:
                print(f"Error: {r.text}")
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    test_chat()
