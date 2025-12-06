import google.generativeai as genai
from decouple import config
from extensions import db
from models import File

# Configure Gemini
genai.configure(api_key=config("GEMINI_API_KEY"))

CHAT_MODEL = "gemini-1.5-flash"

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
    """
    model = genai.GenerativeModel(CHAT_MODEL)
    
    context_text = get_combined_context(user_id)
    
    system_prompt = "You are an AI Study Companion."
    if not user_id:
        system_prompt += " The user is a Guest. Answer generally."
    else:
        system_prompt += " Answer based on the provided CONTEXT documents."

    prompt = f"{system_prompt}\n\nCONTEXT:\n{context_text}\n\nUSER QUESTION:\n{query}"
    
    try:
        response_stream = model.generate_content(prompt, stream=True)
        for chunk in response_stream:
            if chunk.text:
                yield chunk.text
    except Exception as e:
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
