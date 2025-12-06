from backend.services.text_extraction import extract_text_from_file
import io
from PyPDF2 import PdfWriter, PdfReader

def test_extraction():
    # Create simple PDF in memory
    buffer = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    # Adding text to PDF programmatically is hard without reportlab, 
    # but PyPDF2 can just read. 
    # We will assume blank page or try to make a real pdf if we had reportlab.
    # Alternatively, just test text extraction from plain text bytes to verify dispatch logic.
    
    # Test Text
    text_res = extract_text_from_file(b"Hello World", "text/plain")
    print(f"Text Extraction (Plain): {text_res.strip() == 'Hello World'}")
    
    # Test PDF dispatch (even if it fails to read blank)
    try:
        extract_text_from_file(b"%PDF-1.4...", "application/pdf")
        print("Text Extraction (PDF): Dispatched correctly (might fail on bad content)")
    except:
        print("Text Extraction (PDF): Failed")

if __name__ == "__main__":
    test_extraction()
