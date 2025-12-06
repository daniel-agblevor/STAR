import io
from PyPDF2 import PdfReader
from docx import Document

def extract_text_from_file(file_content: bytes, file_type: str) -> str:
    """
    Extracts text from PDF or DOCX binary content.
    """
    try:
        if "pdf" in file_type:
            reader = PdfReader(io.BytesIO(file_content))
            text = ""
            for page in reader.pages:
                text += page.extract_text() + "\n"
            return text
            
        elif "word" in file_type or "docx" in file_type:
            doc = Document(io.BytesIO(file_content))
            return "\n".join([para.text for para in doc.paragraphs])
            
        elif "text" in file_type:
            return file_content.decode("utf-8")
            
        else:
            return ""
            
    except Exception as e:
        print(f"Error extracting text: {e}")
        return ""
