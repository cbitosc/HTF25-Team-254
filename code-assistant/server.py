# server.py
import os
import base64
import tempfile
import traceback
import json
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

# --- Configuration ---
MODEL_NAME = os.environ.get("WHISPER_MODEL", "small")
GEMINI_MODEL_NAME = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
GEMINI_API_KEY = "AIzaSyDGf0yS2u0bzTKP-qEK8dcCz79a-X-aMwA"  # Load from environment

app = FastAPI(title="Local Whisper + Gemini Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)

# --- Pydantic Models ---
class TranscribeRequest(BaseModel):
    filename: str
    data: str  # base64 audio
    model: Optional[str] = None

class SuggestRequest(BaseModel):
    filename: str
    transcript: str
    file_content: str
    model: Optional[str] = None

class ValidateRequest(BaseModel):
    filename: str
    selected_text: str
    full_content: str
    model: Optional[str] = None

# --- Load Whisper ---
whisper_model = None
try:
    import whisper  # type: ignore
    print(f"Loading Whisper model '{MODEL_NAME}'...")
    whisper_model = whisper.load_model(MODEL_NAME)
    print("Whisper model loaded.")
except Exception as e:
    print(f"Whisper model not available: {e}")

# --- Configure Gemini ---
genai = None
gemini_model = None
GEMINI_AVAILABLE = False
if GEMINI_API_KEY:
    try:
        import google.generativeai as genai  # type: ignore
        genai.configure(api_key=GEMINI_API_KEY)
        gemini_model = genai.GenerativeModel(GEMINI_MODEL_NAME)
        GEMINI_AVAILABLE = True
        print(f"Gemini model '{GEMINI_MODEL_NAME}' configured.")
    except Exception as e:
        print(f"Failed to configure Gemini: {e}")
else:
    print("GEMINI_API_KEY not set. /suggest will fail.")

# --- Endpoints ---
@app.post("/transcribe")
async def transcribe(req: TranscribeRequest):
    if whisper_model is None:
        raise HTTPException(status_code=500, detail="Whisper model not loaded on server.")

    try:
        audio_bytes = base64.b64decode(req.data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 data: {e}")

    suffix = os.path.splitext(req.filename)[1] or ".wav"

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmpf:
            tmp_path = tmpf.name
            tmpf.write(audio_bytes)

        result = whisper_model.transcribe(tmp_path, fp16=False)
        text = result.get("text", "").strip() if isinstance(result, dict) else str(result)
        return {"text": text}
    except Exception as e:
        tb = traceback.format_exc()
        return {"error": f"Transcription failed: {e}", "trace": tb}
    finally:
        try:
            if 'tmp_path' in locals() and tmp_path:
                os.remove(tmp_path)
        except Exception:
            pass

@app.post("/suggest")
async def suggest(req: SuggestRequest):
    if not GEMINI_AVAILABLE or not gemini_model:
        return {"error": "Gemini client not available. Check GEMINI_API_KEY and server logs."}

    prompt = (
        "You are an expert pair-programmer AI. The user has provided their current file and a voice command.\n\n"
        f"User Voice Command: \"{req.transcript}\"\n\n"
        f"Current File ({req.filename}):\n{req.file_content}\n\n"
        "Instructions:\n"
        "1. Analyze the user's command in context of the code.\n"
        "2. If the command requires modifications, generate the full, updated code for the entire file.\n"
        "3. If no code changes are needed, return null for 'updated_file'.\n"
        "4. Respond in a single valid JSON object only with keys 'summary' and 'updated_file'.\n"
        "JSON Response Format:\n"
        '{"summary": "...", "updated_file": "... or null..."}'
    )

    try:
        gen_cfg = genai.GenerationConfig(
            temperature=0.1,
            response_mime_type="application/json"
        )
        response = gemini_model.generate_content(prompt, generation_config=gen_cfg)
        raw_text = response.text
        parsed = json.loads(raw_text)

        out = {
            "summary": parsed.get("summary") if isinstance(parsed.get("summary"), str) else "AI provided a response.",
            "updated_file": parsed.get("updated_file") if isinstance(parsed.get("updated_file"), str) else None,
            "raw": raw_text
        }
        return out
    except Exception as e:
        tb = traceback.format_exc()
        if "json.decoder.JSONDecodeError" in tb:
            return {"error": "Failed to parse JSON from Gemini output.", "raw": str(e), "trace": tb}
        return {"error": f"Gemini suggestion failed: {e}", "trace": tb}

@app.post("/validate_selection")
async def validate_selection(req: ValidateRequest):
    if not GEMINI_AVAILABLE or not gemini_model:
        return {"error": "Gemini client not available. Check GEMINI_API_KEY and server logs."}

    prompt = (
        "You are an expert code reviewer AI. The user has selected a specific code snippet from their file for analysis.\n\n"
        f"Full File ({req.filename}) (for context):\n{req.full_content}\n\n"
        f"User's Selected Snippet:\n{req.selected_text}\n\n"
        "Instructions:\n"
        "1. Analyze the snippet in context of the full file.\n"
        "2. If there are errors or improvements, generate a corrected version of ONLY the snippet.\n"
        "3. If snippet is correct, return null for 'updated_snippet'.\n"
        "4. Provide a brief one-sentence summary.\n"
        "Respond in a single valid JSON object with keys 'summary' and 'updated_snippet'."
    )

    try:
        gen_cfg = genai.GenerationConfig(
            temperature=0.1,
            response_mime_type="application/json"
        )
        response = gemini_model.generate_content(prompt, generation_config=gen_cfg)
        raw_text = response.text
        parsed = json.loads(raw_text)

        out = {
            "summary": parsed.get("summary") if isinstance(parsed.get("summary"), str) else "AI provided a response.",
            "updated_snippet": parsed.get("updated_snippet") if isinstance(parsed.get("updated_snippet"), str) else None,
            "raw": raw_text
        }
        return out
    except Exception as e:
        tb = traceback.format_exc()
        if "json.decoder.JSONDecodeError" in tb:
            return {"error": "Failed to parse JSON from Gemini output.", "raw": str(e), "trace": tb}
        return {"error": f"Gemini validation failed: {e}", "trace": tb}

if __name__ == "__main__":
    import uvicorn
    print(f"--- Voice Assistant Server ---")
    print(f"Whisper Model: {MODEL_NAME if whisper_model else 'NOT LOADED'}")
    print(f"Gemini Model: {GEMINI_MODEL_NAME if GEMINI_AVAILABLE else 'NOT LOADED'}")
    print(f"Gemini Key Set: {bool(GEMINI_API_KEY)}")
    print(f"Starting server on http://127.0.0.1:{int(os.environ.get('PORT', 8000))}")
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", 8000)))
