from fastapi import FastAPI
from app.core.database import connect_to_mongo, close_mongo_connection
from app.api.chat import router as chat_router
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await connect_to_mongo()
    yield
    # Shutdown
    await close_mongo_connection()

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Jewellery AI Assistant",
    description="RAG-based Jewellery Assistant API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For production, specify the exact frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router, prefix="/api")

@app.get("/")
async def root():
    return {"message": "Jewellery AI Assistant is online"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
