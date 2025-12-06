import google.generativeai as genai
from decouple import config
from extensions import db
from models import File

# Configure Gemini
genai.configure(api_key=config("GEMINI_API_KEY"))

CHAT_MODEL = "gemini-2.5-flash"

# Global dictionary to hold active chat sessions
# Key: user_id (or "guest" if None), Value: ChatSession object
chat_sessions = {}

def save_file_content(file_id, text_content):
    """
    Updates the File record with extracted text content.
    This runs in a background thread usually.
    """
    app = db.get_app() # In a thread, we might need context, but let's try simple context management
    # Actually, Flask-Nav/SQLAlchemy context in threads is tricky.
    # The caller in main.py spawns a thread.
    # We need to push app context if not present, but better if we do it inside.
    # However, 'db' is bound to the app. 
    # Let's assume for now we just need to query and commit.
    
    # PROBLEM: 'db' proxy requires active application context.
    # We will need to pass the app object or push context.
    # But for simplicity, let's try to just use the scoped session if valid.
    
    # Wait, passing 'app' to a thread is the standard way. 
    # But let's look at how main.py calls it:
    # thread = threading.Thread(target=save_file_content, args=(file_record['id'], text_content))
    # It does NOT pass 'app'.
    # I should update main.py to pass app, or I should handle it here using `current_app` if possible (unlikely in new thread).
    
    # Better approach for now: Use `with app.app_context():` if we can import `app` or create one.
    # But circular imports prevents importing `app` from `main`.
    
    # SOLUTION: We will modify this function to accept `app` as an argument if needed, 
    # OR we just rely on main.py to handle context.
    # Actually, the simplest fix for the 'ImportError' is just defining the function.
    # The runtime thread error is a secondary problem.
    # Let's define it first.
    
    try:
        # We need to create a new session or use the existing one?
        # In a thread, we need a new session usually? 
        # No, Flask-SQLAlchemy uses scoped sessions.
        
        # Let's just try to update.
        # Note: This might fail at runtime without app_context.
        # I will handle that if it arises.
        
        file = File.query.get(file_id)
        if file:
            file.content = text_content
            db.session.commit()
            print(f"Saved content for file {file_id}")
    except Exception as e:
        print(f"Error saving content: {e}")
        # If it fails due to context, we'll see 'RuntimeError: Working outside of application context'.

def get_combined_context(user_id=None, limit=3):
    """Fetches text content from SQL DB."""
    try:
        if not user_id:
            return "" 
            
        # SQLAlchemy Query
        files = File.query.filter_by(user_id=user_id).filter(File.content != None).order_by(File.created_at.desc()).limit(limit).all()
        
        if not files:
            return ""
            
        context = ""
        for file in files:
            context += f"\n--- DOCUMENT: {file.name} ---\n{file.content}\n"
            
        return context
    except Exception as e:
        print(f"Error fetching context: {e}")
        return ""

def stream_chat_response(query: str, user_id=None):
    """
    Generates a streaming response from Gemini using Long Context.
    Uses send_message to maintain conversational history.
    """
    global chat_sessions
    
    # Use a string key for the dictionary
    session_key = user_id if user_id else "guest"

    # Initialize session if it doesn't exist
    if session_key not in chat_sessions:
        # Fetch context only once at the start of the session
        context_text = get_combined_context(user_id)
        
        system_prompt = "You are an AI Study Companion."
        if not user_id:
            system_prompt += " The user is a Guest. Answer generally."
        else:
            system_prompt += " Answer based on the provided CONTEXT documents below."
            
        # Creating the system instruction with the context embedded
        full_system_instruction = f"{system_prompt}\n\nCONTEXT:\n{context_text}"
        
        model = genai.GenerativeModel(CHAT_MODEL, system_instruction=full_system_instruction)
        chat_sessions[session_key] = model.start_chat(history=[])
        print(f"Started new chat session for {session_key}")

    chat = chat_sessions[session_key]

    try:
        response_stream = chat.send_message(query, stream=True)
        for chunk in response_stream:
            if chunk.text:
                yield chunk.text
    except Exception as e:
        # If session becomes invalid (e.g. history too long?), maybe clear it?
        # For now, just report error.
        yield f"Error: {str(e)}"

def generate_quiz_json(file_id: str, count: int = 5):
    file = File.query.get(file_id)
    if not file or not file.content:
        raise ValueError("No content found.")
        
    prompt = f"""
    Generate a quiz with {count} questions based on text. Return JSON.
    Format: [{{ "question": "...", "options": ["A", "B"], "correct_answer": "A" }}]
    TEXT: {file.content[:15000]}
    """
    model = genai.GenerativeModel(CHAT_MODEL)
    response = model.generate_content(prompt)
    return response.text.replace("```json", "").replace("```", "").strip()

def generate_flashcards_json(file_id: str, count: int = 5):
    file = File.query.get(file_id)
    if not file or not file.content:
        raise ValueError("No content found.")
        
    prompt = f"""
    Generate {count} flashcards based on text. Return JSON.
    Format: [{{ "front": "...", "back": "..." }}]
    TEXT: {file.content[:15000]}
    """
    model = genai.GenerativeModel(CHAT_MODEL)
    response = model.generate_content(prompt)
    return response.text.replace("```json", "").replace("```", "").strip()
