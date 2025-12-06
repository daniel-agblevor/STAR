import os
import google.generativeai as genai
from supabase import create_client, Client
import textwrap
from decouple import config

# Initialize Supabase (reusing credentials logic ideally, but simpler to repeat for now)
url: str = config("SUPABASE_URL")
key: str = config("SUPABASE_KEY")
supabase: Client = create_client(url, key)

# Initialize Gemini
API_KEY = config("GEMINI_API_KEY")
if not API_KEY:
    raise ValueError("GEMINI_API_KEY missing in .env")

genai.configure(api_key=API_KEY)

# Models
EMBEDDING_MODEL = "models/text-embedding-004"
CHAT_MODEL = "gemini-pro"

def get_embedding(text: str):
    """Generate embedding vector for text."""
    result = genai.embed_content(
        model=EMBEDDING_MODEL,
        content=text,
        task_type="retrieval_document"
    )
    return result['embedding']

def chunk_text(text: str, chunk_size=1000):
    """Simple chunking by character count (can be improved to token/sentence based)."""
    return textwrap.wrap(text, chunk_size, break_long_words=False, replace_whitespace=False)

async def process_document_for_rag(file_id: str, text_content: str):
    """
    Splits document into chunks, generates embeddings, and stores them in `file_chunks` table.
    """
    chunks = chunk_text(text_content)
    
    data_to_insert = []
    for i, chunk in enumerate(chunks):
        embedding = get_embedding(chunk)
        data_to_insert.append({
            "file_id": file_id,
            "chunk_index": i,
            "content": chunk,
            "embedding": embedding
        })
    
    # Batch insert could be better, but iterating is safer for now regarding payload limits
    # Supabase allows batch inserts
    try:
        supabase.table("file_chunks").insert(data_to_insert).execute()
    except Exception as e:
        print(f"Error inserting chunks: {e}")

async def query_rag_context(query: str, limit=5):
    """
    Search for relevant chunks using vector similarity.
    """
    query_embedding = genai.embed_content(
        model=EMBEDDING_MODEL,
        content=query,
        task_type="retrieval_query"
    )['embedding']
    
    # RPC call to Supabase for vector search (needs a postgres function 'match_documents')
    # For now, we will assume standard ivfflat querying if using raw SQL, 
    # but specific Supabase Python SDK usage for rpc is standard for pgvector.
    
    # Note: You need to create a 'match_documents' function in Postgres for this to work elegantly.
    # Alternatively, we can just do a similarity search if the python client supports it directly, which it mostly does via RPC.
    
    params = {
        "query_embedding": query_embedding,
        "match_threshold": 0.5,
        "match_count": limit
    }
    
    try:
        # We need to define this function in SQL first! I will add it to the schema.
        res = supabase.rpc("match_documents", params).execute()
        return res.data
    except Exception as e:
        print(f"Error querying vectors: {e}")
        return []

async def stream_chat_response(query: str):
    """
    Generates a streaming response from Gemini, optionally using RAG Context.
    """
    model = genai.GenerativeModel(CHAT_MODEL)
    
    # 1. Retrieve Context
    context_chunks = await query_rag_context(query)
    context_text = "\n\n".join([c['content'] for c in context_chunks]) if context_chunks else "No specific context found."
    
    prompt = f"""
    You are an AI Study Companion. Answer the user's question based on the following context derived from their uploaded documents.
    If the answer is not in the context, use your general knowledge but mention that it's outside the provided documents.
    
    CONTEXT:
    {context_text}
    
    USER QUESTION:
    {query}
    """
    
    # 2. Stream Generation
    response_stream = model.generate_content(prompt, stream=True)
    
    for chunk in response_stream:
        if chunk.text:
            yield chunk.text

async def generate_quiz_json(file_id: str, count: int = 5):
    """
    Generates a quiz based on the file content.
    """
    # 1. Fetch chunks for context (Random or first N)
    # For better quality, we should probably fetch a random set of chunks or the whole summary.
    # We'll select 5 random chunks from the DB for variety.
    res = supabase.table("file_chunks").select("content").eq("file_id", file_id).limit(10).execute()
    chunks = res.data
    if not chunks:
        raise ValueError("No content found for this file.")
        
    context_text = "\n".join([c['content'] for c in chunks])
    
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
    {context_text[:5000]} 
    """
    # Truncating context to 5000 chars to save tokens for now
    
    model = genai.GenerativeModel(CHAT_MODEL)
    response = model.generate_content(prompt)
    
    # Simple cleanup to ensure JSON
    text = response.text.replace("```json", "").replace("```", "").strip()
    return text

async def generate_flashcards_json(file_id: str, count: int = 5):
    """
    Generates flashcards based on the file content.
    """
    res = supabase.table("file_chunks").select("content").eq("file_id", file_id).limit(10).execute()
    chunks = res.data
    if not chunks:
        raise ValueError("No content found for this file.")
        
    context_text = "\n".join([c['content'] for c in chunks])
    
    prompt = f"""
    Generate {count} flashcards based on the following text.
    Return ONLY raw JSON.
    Format:
    [
      {{
        "front": "Term or Question",
        "back": "Definition or Answer"
      }}
    ]
    
    TEXT:
    {context_text[:5000]}
    """
    
    model = genai.GenerativeModel(CHAT_MODEL)
    response = model.generate_content(prompt)
    
    text = response.text.replace("```json", "").replace("```", "").strip()
    return text
