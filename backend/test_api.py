import requests

def test_upload():
    url = "http://127.0.0.1:8000/api/upload"
    # Create a dummy file
    files = {'file': ('test.txt', b'This is a test document content for AI extraction.', 'text/plain')}
    
    try:
        response = requests.post(url, files=files)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
    except Exception as e:
        print(f"Failed to connect: {e}")

if __name__ == "__main__":
    test_upload()
