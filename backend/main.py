import os
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from decouple import config
from pydantic import BaseModel

from backend.services.storage_service import upload_file_to_storage, get_all_files, delete_file
from backend.services.ai_service import process_document_for_rag, stream_chat_response
from backend.services.text_extraction import extract_text_from_file

# load_dotenv() is not needed with decouple, it auto-loads .env

app = FastAPI()

# Allow Frontend to communicate with Backend
origins = [
    "http://localhost:5173",  # Vite default port
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    query: str

@app.get("/")
def read_root():
    return {"message": "AI Study Companion API is running"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/api/upload")
async def upload_file_endpoint(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    # 1. Upload to Supabase & DB
    file_record, file_content_bytes = await upload_file_to_storage(file)
    
    # 2. Extract Text
    text_content = extract_text_from_file(file_content_bytes, file.content_type)
    
    if not text_content.strip():
        # Even if text extraction fails, we uploaded the file. 
        # But we can't RAG it. We'll warn? Or just proceed.
        return {"message": "File uploaded, but no text detected for AI context.", "file": file_record}

    # 3. Process RAG in background (Chunking + Embedding)
    background_tasks.add_task(process_document_for_rag, file_record['id'], text_content)
    
    return {"message": "File uploaded and processing for AI started.", "file": file_record}

@app.get("/api/files")
def list_files():
    return get_all_files()

@app.delete("/api/files/{file_id}")
def delete_file_endpoint(file_id: str):
    return delete_file(file_id)

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    return StreamingResponse(stream_chat_response(request.query), media_type="text/plain")

class GenRequest(BaseModel):
    file_id: str
    count: int = 5

@app.post("/api/quiz")
async def quiz_endpoint(req: GenRequest):
    from backend.services.ai_service import generate_quiz_json
    import json
    try:
        json_str = await generate_quiz_json(req.file_id, req.count)
        return json.loads(json_str)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/flashcards")
async def flashcards_endpoint(req: GenRequest):
    from backend.services.ai_service import generate_flashcards_json
    import json
    try:
        json_str = await generate_flashcards_json(req.file_id, req.count)
        return json.loads(json_str)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
