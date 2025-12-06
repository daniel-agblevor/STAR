import os
import shutil
from fastapi import UploadFile, HTTPException
from supabase import create_client, Client
from datetime import datetime
import mimetypes
from decouple import config

# Initialize Supabase
url: str = config("SUPABASE_URL")
key: str = config("SUPABASE_KEY")

if not url or not key:
    raise ValueError("Supabase credentials missing in .env")

supabase: Client = create_client(url, key)

BUCKET_NAME = "documents"

async def upload_file_to_storage(file: UploadFile):
    """
    Uploads a file to Supabase Storage and records it in the 'files' table.
    Returns the file_id and file_content (text) for further processing.
    """
    try:
        # 1. Read file content
        content = await file.read()
        file_size = len(content)
        
        # 2. Upload to Supabase Storage
        # We use a timestamp prefix to avoid name collisions
        timestamp = int(datetime.utcnow().timestamp())
        file_path = f"{timestamp}_{file.filename}"
        
        res = supabase.storage.from_(BUCKET_NAME).upload(
            path=file_path,
            file=content,
            file_options={"content-type": file.content_type}
        )
        
        # 3. Create DB Record
        file_data = {
            "name": file.filename,
            "storage_path": file_path,
            "size": file_size,
            "type": file.content_type or "application/octet-stream"
        }
        
        db_res = supabase.table("files").insert(file_data).execute()
        
        if not db_res.data:
            raise HTTPException(status_code=500, detail="Failed to insert file record to DB")
            
        file_record = db_res.data[0]
        
        return file_record, content

    except Exception as e:
        print(f"Error in upload_file: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def get_all_files():
    """Fetch all files from the DB."""
    res = supabase.table("files").select("*").order("created_at", desc=True).execute()
    return res.data

def delete_file(file_id: str):
    """Delete file from DB and Storage."""
    # 1. Get file path
    res = supabase.table("files").select("storage_path").eq("id", file_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="File not found")
        
    path = res.data[0]['storage_path']
    
    # 2. Delete from Storage
    supabase.storage.from_(BUCKET_NAME).remove([path])
    
    # 3. Delete from DB (Cascade will remove chunks/quizzes)
    supabase.table("files").delete().eq("id", file_id).execute()
    
    return {"message": "File deleted successfully"}
