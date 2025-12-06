import os
import uuid
from supabase import create_client, Client
from decouple import config
from extensions import db
from models import File
from services.text_extraction import extract_text_from_file

# Init Supabase (Storage Only)
url: str = config("SUPABASE_URL")
key: str = config("SUPABASE_KEY")
supabase: Client = create_client(url, key)

BUCKET_NAME = "documents"

def upload_file_to_storage(file_obj, user_id):
    """
    1. Uploads file to Supabase Storage (S3).
    2. Extracts text.
    3. Saves metadata + content to SQL Database.
    """
    filename = f"{uuid.uuid4()}_{file_obj.filename}"
    file_content = file_obj.read()
    
    # 1. Upload to Storage
    try:
        supabase.storage.from_(BUCKET_NAME).upload(
            path=filename,
            file=file_content,
            file_options={"content-type": file_obj.content_type}
        )
    except Exception as e:
        print(f"Storage Upload Error: {e}")
        raise e

    # 2. Extract Text
    text_content = extract_text_from_file(file_obj.filename, file_content)

    # 3. Save to DB
    new_file = File(
        id=str(uuid.uuid4()),
        user_id=user_id,
        name=file_obj.filename,
        storage_path=filename,
        content=text_content,
        size=len(file_content),
        type=file_obj.content_type
    )
    
    db.session.add(new_file)
    db.session.commit()
    
    return {"message": "Uploaded successfully", "file_id": new_file.id}

def get_all_files(user_id):
    """Fetches files for a user from SQL DB."""
    if not user_id:
        return []
        
    files = File.query.filter_by(user_id=user_id).order_by(File.created_at.desc()).all()
    return [{
        "id": f.id,
        "name": f.name,
        "created_at": f.created_at.isoformat()
    } for f in files]

def delete_file(file_id: str):
    """Delete file from DB and Storage."""
    file = File.query.get(file_id)
    if not file:
        return {"error": "File not found"}
        
    # Delete from Storage
    try:
        supabase.storage.from_(BUCKET_NAME).remove([file.storage_path])
    except Exception as e:
        print(f"Storage Deletion Error: {e}")
        # Continue to delete from DB anyway

    # Delete from DB
    db.session.delete(file)
    db.session.commit()
    
    return {"message": "File deleted successfully"}
