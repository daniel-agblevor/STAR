import os
import threading
from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
from decouple import config
import json

from services.storage_service import upload_file_to_storage, get_all_files, delete_file
from services.ai_service import save_file_content, stream_chat_response
from services.text_extraction import extract_text_from_file

app = Flask(__name__)

# Allow Frontend to communicate with Backend
CORS(app, resources={r"/api/*": {"origins": "*"}}) # Open for dev, restrict in prod

@app.route("/", methods=["GET"])
def read_root():
    return jsonify({"message": "AI Study Companion API is running (Flask)"})

@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok"})

@app.route("/api/upload", methods=["POST"])
def upload_file_endpoint():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    try:
        # 1. Upload to Supabase & DB (Sync now)
        file_record, file_content_bytes = upload_file_to_storage(file)
        
        # 2. Extract Text
        text_content = extract_text_from_file(file_content_bytes, file.mimetype)
        
        if not text_content.strip():
            return jsonify({"message": "File uploaded, but no text detected for AI context.", "file": file_record})

        # 3. Process RAG in background
        # In Flask, simple threading is often easiest for fire-and-forget without Celery
        thread = threading.Thread(target=save_file_content, args=(file_record['id'], text_content))
        thread.start()
        
        return jsonify({"message": "File uploaded and processing for AI started.", "file": file_record})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/files", methods=["GET"])
def list_files_endpoint():
    return jsonify(get_all_files())

@app.route("/api/files/<file_id>", methods=["DELETE"])
def delete_file_endpoint(file_id):
    try:
        return jsonify(delete_file(file_id))
    except Exception as e:
        return jsonify({"error": str(e)}), 404

@app.route("/api/chat", methods=["POST"])
def chat_endpoint():
    data = request.json
    query = data.get("query")
    if not query:
        return jsonify({"error": "Query required"}), 400
        
    # stream_with_context is used for streaming in Flask
    return Response(stream_with_context(stream_chat_response(query)), content_type='text/plain')

@app.route("/api/quiz", methods=["POST"])
async def quiz_endpoint():
    # Flask 2.0+ supports async routes!
    from backend.services.ai_service import generate_quiz_json
    data = request.json
    file_id = data.get("file_id")
    count = data.get("count", 5)
    
    try:
        json_str = await generate_quiz_json(file_id, count)
        return jsonify(json.loads(json_str))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/flashcards", methods=["POST"])
async def flashcards_endpoint():
    from backend.services.ai_service import generate_flashcards_json
    data = request.json
    file_id = data.get("file_id")
    count = data.get("count", 5)
    
    try:
        json_str = await generate_flashcards_json(file_id, count)
        return jsonify(json.loads(json_str))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host='0.0.0.0', debug=True, port=8000)
