import os
import google.generativeai as genai
from supabase import create_client, Client
from decouple import config

# Initialize Supabase
url: str = config("SUPABASE_URL")
key: str = config("SUPABASE_KEY")
supabase: Client = create_client(url, key)

# Initialize Gemini
API_KEY = config("GEMINI_API_KEY")
if not API_KEY:
    raise ValueError("GEMINI_API_KEY missing in .env")

genai.configure(api_key=API_KEY)

CHAT_MODEL = "gemini-1.5-flash" # Faster, good context

def save_file_content(file_id: str, text_content: str):
    """
    Saves the extracted text content directly to the 'files' table.
    """
    try:
        supabase.table("files").update({"content": text_content}).eq("id", file_id).execute()
        print(f"Content saved for file {file_id}")
    except Exception as e:
        print(f"Error saving content: {e}")

async def get_combined_context(limit=3):
    """Fetches text content from the most recent uploaded files."""
    try:
        # Fetch last 'limit' files that have content
        res = supabase.table("files").select("name, content").not_.is_("content", "null").order("created_at", desc=True).limit(limit).execute()
        
        if not res.data:
            return ""
            
        context = ""
        for file in res.data:
            context += f"\n--- DOCUMENT: {file['name']} ---\n{file['content']}\n"
            
        return context
    except Exception as e:
        print(f"Error fetching context: {e}")
        return ""

async def stream_chat_response(query: str):
    """
    Generates a streaming response from Gemini using Long Context from uploaded files.
    """
    model = genai.GenerativeModel(CHAT_MODEL)
    
    # 1. Retrieve Context
    context_text = await get_combined_context()
    
    prompt = f"""
    You are an AI Study Companion. Answer the user's question based on the following context documents.
    If the answer is not in the context, strictly state that you cannot find the answer in the provided documents.
    
    CONTEXT:
    {context_text}
    
    USER QUESTION:
    {query}
    """
    
    # 2. Stream Generation
    try:
        response_stream = model.generate_content(prompt, stream=True)
        for chunk in response_stream:
            if chunk.text:
                yield chunk.text
    except Exception as e:
        yield f"Error generating response: {str(e)}"

async def generate_quiz_json(file_id: str, count: int = 5):
    """
    Generates a quiz based on the SPECIFIC file content.
    """
    try:
        res = supabase.table("files").select("content").eq("id", file_id).execute()
        if not res.data or not res.data[0]['content']:
            raise ValueError("No content found for this file.")
            
        context_text = res.data[0]['content']
        
        prompt = f"""
        Generate a quiz with {count} questions based on the following text.
        Return ONLY raw JSON. No markdown formatting.
        Format:
        [
          {{
            "question": "question text",
            "options": ["A", "B", "C", "D"],
            "correct_answer": "A"
          }}
        ]
        
        TEXT:
        {context_text[:15000]} 
        """
        # 15k chars is safer for flash model
        
        model = genai.GenerativeModel(CHAT_MODEL)
        response = model.generate_content(prompt)
        
        text = response.text.replace("```json", "").replace("```", "").strip()
        return text
    except Exception as e:
        print(f"Error gen quiz: {e}")
        raise e

async def generate_flashcards_json(file_id: str, count: int = 5):
    """
    Generates flashcards based on the SPECIFIC file content.
    """
    try:
        res = supabase.table("files").select("content").eq("id", file_id).execute()
        if not res.data or not res.data[0]['content']:
            raise ValueError("No content found for this file.")
            
        context_text = res.data[0]['content']
        
        prompt = f"""
        Generate {count} flashcards based on the following text.
        Return ONLY raw JSON. No markdown formatting.
        Format:
        [
          {{
            "front": "Term or Question",
            "back": "Definition or Answer"
          }}
        ]
        
        TEXT:
        {context_text[:15000]}
        """
        
        model = genai.GenerativeModel(CHAT_MODEL)
        response = model.generate_content(prompt)
        
        text = response.text.replace("```json", "").replace("```", "").strip()
        return text
    except Exception as e:
        print(f"Error gen flashcards: {e}")
        raise e
