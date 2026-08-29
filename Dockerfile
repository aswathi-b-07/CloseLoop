# CloseLoop backend — FastAPI + tiered reconciliation engine.
FROM python:3.11-slim

WORKDIR /app

# Install deps first for layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code.
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY PROJECT_PLAN.md README.md ARCHITECTURE.md ./

# Persist generated data / audit db / llm cache here.
RUN mkdir -p data

EXPOSE 8000

# The API works with no GEMINI_API_KEY (Tier-3 + Q&A degrade to fallback).
CMD ["uvicorn", "closeloop.api:app", "--app-dir", "src", "--host", "0.0.0.0", "--port", "8000"]
