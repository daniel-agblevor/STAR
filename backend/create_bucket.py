from supabase import create_client
from decouple import config

def create_bucket():
    url = config("SUPABASE_URL")
    key = config("SUPABASE_KEY")
    supabase = create_client(url, key)
    
    try:
        # Try to create 'documents' bucket
        # options: public=False (default), file_size_limit, allowed_mime_types
        res = supabase.storage.create_bucket("documents", options={"public": False})
        print("Bucket created:", res)
    except Exception as e:
        print("Error creating bucket:", e)
        # Maybe it exists but I got 404 on upload? 404 on upload usually means bucket missing.

if __name__ == "__main__":
    create_bucket()
