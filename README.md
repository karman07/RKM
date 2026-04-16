# Jewellery AI Assistant (RAG)

Production-ready RAG-based AI service for jewellery recommendations.

## Tech Stack
- **FastAPI**: Backend framework
- **MongoDB Atlas**: Database with Vector Search
- **Gemini API**: `gemini-2.5-flash` for chat and `gemini-embedding-001` for embeddings
- **Pydantic**: Data validation

## Features
- **Query Understanding**: Automatically extracts filters (metal, stone, category, price) from natural language.
- **Hybrid Retrieval**: Semantic vector search plus keyword and structured-filter recall.
- **Dynamic Pricing**: Calculates real-time prices based on metal weights.
- **Luxury Tone**: AI-generated responses tailored for a premium jewellery brand.

## Setup

1. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure Environment**:
   Create a `.env` file with your keys:
   ```env
   GEMINI_API_KEY=...
   MONGODB_URI=...
   ```

3. **Running the app**:
   ```bash
   uvicorn main:app --reload
   ```

4. **Data Ingestion**:
  To update existing products with searchable text and embeddings:
   ```bash
   PYTHONPATH=. python app/utils/ingest.py
   ```
  The ingestion job also creates the Atlas vector index automatically if it is missing.
  Run this again whenever you change the embedding model or searchable text format.

## MongoDB Atlas Vector Search Index
Ensure you have created a vector index named `vector_index` on the `products` collection with the following definition:
```json
{
  "mappings": {
    "dynamic": true,
    "fields": {
      "embedding": {
        "dimensions": 768,
        "similarity": "cosine",
        "type": "knnVector"
      }
    }
  }
}
```
`gemini-embedding-001` is configured to emit 768-dimensional vectors so it matches the index above.

## API Endpoints
- `POST /api/chat`: Chat with the assistant.
  - Body: `{"query": "gold ring under 50000"}`
