import os
import threading
import uuid
import datetime
import jwt
from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
from flask_bcrypt import Bcrypt
from decouple import config
import json

from extensions import db
from models import User, File
from services.storage_service import upload_file_to_storage, get_all_files, delete_file
from services.ai_service import save_file_content, stream_chat_response, generate_quiz_json, generate_flashcards_json
from services.text_extraction import extract_text_from_file

app = Flask(__name__)

# Config
app.config['SQLALCHEMY_DATABASE_URI'] = config('DB_CONNECTION_STRING')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = config('SECRET_KEY', default='supersecretkey')

# Extensions
CORS(app, resources={r"/api/*": {"origins": "*"}})
db.init_app(app)
bcrypt = Bcrypt(app)

# --- Middleware ---
from functools import wraps

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]
        
        if not token:
            return jsonify({'message': 'Token is missing!'}), 401

        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user = User.query.filter_by(id=data['user_id']).first()
            if not current_user:
                 return jsonify({'message': 'User invalid!'}), 401
        except Exception as e:
            return jsonify({'message': 'Token is invalid!', 'error': str(e)}), 401

        return f(current_user, *args, **kwargs)

    return decorated

@app.route("/", methods=["GET"])
def read_root():
    return jsonify({"message": "AI Study Companion API (SQLAlchemy Enabled)"})

@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok"})

# --- Auth Routes ---
@app.route("/api/register", methods=["POST"])
def register():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    name = data.get('name', 'Scholar') # Default name if not provided

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400
    
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "User already exists"}), 400
        
    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
    new_user = User(id=str(uuid.uuid4()), email=email, name=name, password_hash=hashed_password)
    
    db.session.add(new_user)
    db.session.commit()
    
    return jsonify({"message": "User registered successfully"}), 201

@app.route("/api/login", methods=["POST"])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    
    user = User.query.filter_by(email=email).first()
    
    if user and bcrypt.check_password_hash(user.password_hash, password):
        token = jwt.encode({
            'user_id': user.id,
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
        }, app.config['SECRET_KEY'], algorithm="HS256")
        
        return jsonify({
            "token": token,
            "user": {"id": user.id, "email": user.email, "name": user.name}
        })
        
    return jsonify({"error": "Invalid credentials"}), 401


@app.route("/api/upload", methods=["POST"])
def upload_file_endpoint():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    user_id = request.form.get('user_id') # Form data for file uploads

    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if not user_id:
        return jsonify({"error": "User ID required for upload"}), 401

    try:
        # 1. Upload to Supabase & DB (Sync now)
        file_record, file_content_bytes = upload_file_to_storage(file, user_id)
        
        # 2. Extract Text
        text_content = extract_text_from_file(file_content_bytes, file.mimetype)
        
        if not text_content.strip():
            return jsonify({"message": "File uploaded, but no text detected for AI context.", "file": file_record})

        # 3. Process RAG in background
        thread = threading.Thread(target=save_file_content, args=(file_record['id'], text_content))
        thread.start()
        
        return jsonify({"message": "File uploaded and processing for AI started.", "file": file_record})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/files", methods=["GET"])
def list_files_endpoint():
    user_id = request.args.get('user_id')
    return jsonify(get_all_files(user_id))

@app.route("/api/files/<file_id>", methods=["DELETE"])
def delete_file_endpoint(file_id):
    try:
        # Note: We should probably verify user_id here too in a real app, 
        # but RLS handles the DB part. Storage deletion needs care.
        return jsonify(delete_file(file_id))
    except Exception as e:
        return jsonify({"error": str(e)}), 404

@app.route("/api/chat", methods=["POST"])
def chat_endpoint():
    data = request.json
    query = data.get("query")
    user_id = data.get("user_id")

    if not query:
        return jsonify({"error": "Query required"}), 400
        
    # stream_with_context is used for streaming in Flask
    return Response(stream_with_context(stream_chat_response(query, user_id)), content_type='text/plain')

@app.route("/api/quiz", methods=["POST"])
def quiz_endpoint():
    data = request.json
    file_id = data.get("file_id")
    count = data.get("count", 5)
    
    try:
        json_str = generate_quiz_json(file_id, count)
        return jsonify(json.loads(json_str))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/flashcards", methods=["POST"])
def flashcards_endpoint():
    data = request.json
    file_id = data.get("file_id")
    count = data.get("count", 5)
    
    try:
        json_str = generate_flashcards_json(file_id, count)
        return jsonify(json.loads(json_str))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host='0.0.0.0', debug=True, port=8000)
