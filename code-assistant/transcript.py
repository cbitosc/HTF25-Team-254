
# import sys, json, os

# def main():
#     if len(sys.argv) < 2:
#         print(json.dumps({"error":"no input file"}))
#         return

#     wav = sys.argv[1]
#     model_name = sys.argv[2] if len(sys.argv) > 2 else "small"

#     try:
#         import whisper
#     except Exception as e:
#         print(json.dumps({"error":"whisper library not installed: " + str(e)}))
#         return

#     if not os.path.exists(wav):
#         print(json.dumps({"error":"input file not found"}))
#         return

#     try:
#         model = whisper.load_model(model_name)
#         result = model.transcribe(wav)
#         # result typically contains 'text' and more information
#         print(json.dumps(result, ensure_ascii=False))
#     except Exception as e:
#         print(json.dumps({"error":"transcription failed: " + str(e)}))

# if __name__ == "__main__":
#     main()

#!/usr/bin/env python3
# transcript.py
# Usage: python transcript.py /path/to/file.wav [model_name]
# Prints a single JSON object to stdout. Example output: {"text": "hello world"}

import sys
import json
import os

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "no input file"}))
        return

    wav = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else "small"

    try:
        import whisper
    except Exception as e:
        # More friendly error message to the extension
        print(json.dumps({"error": "whisper library not installed: " + str(e)}))
        return

    if not os.path.exists(wav):
        print(json.dumps({"error": "input file not found"}))
        return

    try:
        model = whisper.load_model(model_name)
        result = model.transcribe(wav)
        # Keep output compact and stable: include only result keys commonly used
        out = {}
        if 'text' in result:
            out['text'] = result['text']
        else:
            # as a fallback, include the whole result
            out = result
        print(json.dumps(out, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": "transcription failed: " + str(e)}))

if __name__ == "__main__":
    main()
