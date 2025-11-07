import speech_recognition as sr

r = sr.Recognizer()
with sr.AudioFile(r"D:\Downloads\sample-pack-links-in-bio-sampled-stuff-288267.mp3") as source:
    audio_data = r.record(source)  # Read the entire audio file
    try:
        text = r.recognize_google(audio_data)  # Use Google Speech Recognition
        print("Transcription:", text)
    except sr.UnknownValueError:
        print("Google Speech Recognition could not understand audio")
    except sr.RequestError as e:
        print(f"Could not request results from Google Speech Recognition service; {e}")