import re
from fastapi import APIRouter, HTTPException
from app.models.product import ChatRequest, ChatResponse, ChatResponseProduct
from app.services.gemini_service import gemini_service
from app.services.search_service import search_service
from typing import List

router = APIRouter()

_SINGLE_PRODUCT_RE = re.compile(
    r'\b(?:tell\s+me\s+(?:more\s+)?about|more\s+about|details?\s+(?:of|about|on)'
    r'|info(?:rmation)?\s+(?:on|about)|what\s+(?:is|are))\b',
    re.IGNORECASE,
)

def _is_single_product_query(query: str) -> bool:
    return bool(_SINGLE_PRODUCT_RE.search(query))

@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    try:
        # 1. Understand Query & Extract Filters
        filters = await gemini_service.extract_filters(request.query)
        import logging
        logging.info(f"Extracted filters: {filters}")
        
        # 2. Get Embedding for vector search
        query_vector = await gemini_service.get_embedding(request.query)
        
        # 3. Perform Hybrid Retrieval
        products = await search_service.vector_search(request.query, query_vector, filters)
        logging.info(f"Vector search returned {len(products)} products")
        
        # 4. Fallback if no results
        if not products:
            products = await search_service.fallback_keyword_search(request.query)
            logging.info(f"Keyword search returned {len(products)} products")

        # 5. Cap to 1 product when user is asking about a specific named item
        if _is_single_product_query(request.query) and products:
            products = products[:1]

        logging.info(f"Final products list for response: {[p.get('name') for p in products]}")
            
        # 5. Prepare Context for Gemini Response
        product_context = ""
        for p in products:
            name = p.get('name', 'Jewellery Item')
            sku = p.get('sku', 'N/A')
            price = p.get('calculated_price', 0.0)
            desc = p.get('description', '')
            metal = p.get('metal_type', '')
            stone = p.get('stone_type', '')
            occasion = p.get('occasion', '')
            product_context += (
                f"- {name} | SKU: {sku} | Price: {price:.2f} | Metal: {metal} | "
                f"Stone: {stone} | Occasion: {occasion} | Description: {desc}\n"
            )
            
        system_prompt = f"""
        You are a grounded luxury jewellery assistant for RKM Jewellers.
        Your goal is to help the shopper quickly understand the best matches without inventing details.
        
        User Query: "{request.query}"
        Applied Filters: {filters}
        
        Available Products (Context):
        {product_context}
        
        Guidelines:
        1. Use only the retrieved products above. Do not invent products, gemstones, or pricing.
        2. If up to 6 products are retrieved, mention every relevant one in the answer.
        3. Be clear and premium, but concise. Avoid repetitive marketing language.
        4. Do NOT include any URLs, links, or paths in your answer. Product cards are shown separately.
        5. If products are similar, explain the difference using only retrieved fields.
        6. If the query asks for cheaper options or a budget, prioritise those options first.
        7. If no perfect match exists, say so plainly and point to the closest matches.
        
        Output:
        - Return only the answer text. Never include /product or /products paths.
        """
        
        # 6. Generate Answer
        gemini_response_text = await gemini_service.generate_response(system_prompt)

        # 7. Format Response
        NESTJS_BASE = "http://localhost:3000"
        response_products = []
        for p in products:
            raw_img = (p.get("images") or [])
            raw_img = raw_img[0] if raw_img else None
            if raw_img and not raw_img.startswith("http"):
                raw_img = f"{NESTJS_BASE}{raw_img}"
            product_id = str(p.get("_id", p.get("sku", "")))
            response_products.append(ChatResponseProduct(
                name=p.get("name", "Item"),
                price=p.get("calculated_price", 0.0),
                url=f"/products/{product_id}",
                image=raw_img
            ))
        
        return ChatResponse(
            answer=gemini_response_text,
            products=response_products,
            filters_applied=filters,
            suggestions=_build_suggestions(filters, products)
        )
        
    except Exception as e:
        import logging
        logging.error(f"Error in chat endpoint: {e}")
        return ChatResponse(
            answer="Sorry, we couldn't find matching jewellery. Here are some popular items.",
            products=[],
            filters_applied={},
            suggestions=["View popular rings", "See latest necklaces", "Browse by metal"]
        )

def _build_suggestions(filters, products):
    suggestions = []
    top_product = products[0] if products else None
    if top_product and top_product.get("name"):
        suggestions.append(f"Tell me more about {top_product['name']}")
    if filters.get("metal_type"):
        suggestions.append(f"Show me more {filters['metal_type']} jewellery")
    if filters.get("category"):
        suggestions.append(f"Show me similar {filters['category']} options")
    if not filters.get("max_price"):
        suggestions.append("Show me things under 50000")
    suggestions.append("Do you have diamond earrings?")
    deduped = []
    for suggestion in suggestions:
        if suggestion not in deduped:
            deduped.append(suggestion)
    return deduped[:3]
