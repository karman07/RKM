import json
import logging
import re

from google import genai
from app.core.config import get_settings
from typing import Any, Dict, List

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()

class GeminiService:
    def __init__(self):
        # Initialize the new Google GenAI client
        self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
        self.chat_model = settings.GEMINI_CHAT_MODEL
        self.embedding_model = settings.EMBEDDING_MODEL
        self.system_prompt = """
        You are the exclusive AI Sales Assistant for RKM Jewellers, a high-end luxury jewellery brand.
        Your tone is sophisticated, elegant, and helpful. 
        Always refer to the brand as RKM Jewellers.
        """

    async def get_embedding(self, text: str, task_type: str = "RETRIEVAL_QUERY") -> List[float]:
        """Generate retrieval-oriented embeddings using the Google GenAI SDK."""
        try:
            response = self.client.models.embed_content(
                model=self.embedding_model,
                contents=text,
                config={
                    "task_type": task_type,
                    "output_dimensionality": settings.EMBEDDING_DIMENSIONS,
                },
            )
            embedding = response.embeddings[0].values
            logger.info(f"Embedding generated: {len(embedding)}")
            return embedding
        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            # Fallback/Diagnostic
            try:
                available_models = self.client.models.list()
                model_names = [m.name for m in available_models]
                logger.info(f"Available models: {model_names}")
            except:
                pass
            return []

    async def generate_response(self, prompt: str) -> str:
        """Generate a response using the new google-genai SDK"""
        try:
            response = self.client.models.generate_content(
                model=self.chat_model,
                contents=f"{self.system_prompt}\n\nUser Question: {prompt}"
            )
            return response.text
        except Exception as e:
            logger.error(f"Error generating response: {e}")
            return "Sorry, we couldn't find matching jewellery. Here are some popular items."

    async def extract_filters(self, query: str) -> dict:
        """Extract product filters from a user query with LLM + rule-based fallback."""
        prompt = f"""
        {self.system_prompt}
        Extract jewellery filters from the following user query: "{query}"
        Supported filters:
        - metal_type (gold, silver, platinum)
        - stone_type (ruby, diamond, emerald, moissanite, pearl)
        - category (ring, necklace, earrings, pendant, bracelet, bangle)
        - purity (14k, 18k, 22k, 24k, 925)
        - metal_color (yellow, white, rose)
        - occasion (wedding, engagement, party, daily wear, festive)
        - gender (women, men, unisex)
        - max_price (e.g., 50000)
        - product_name (ONLY set this when the user is asking about a SPECIFIC named product, e.g. "karman", "engagement ring", "cocktail ring". Do NOT set for browse queries like "show me gold rings".)
        
        Return ONLY a JSON object.
        Example response: {{"metal_type": "gold", "category": "ring", "max_price": 50000}}
        CRITICAL: Always look for price mentions like "under 50000" or "below 1 lakh" and put them in max_price (as a number).
        If a filter is not present, omit it. Normalize categories to singular words like "ring" and "earring".
        """
        try:
            response = self.client.models.generate_content(
                model=self.chat_model,
                contents=prompt
            )
            parsed = self._parse_json_object(response.text)
            if parsed:
                return self._merge_filter_guesses(parsed, self._rule_based_filter_guess(query))
        except Exception as e:
            logger.error(f"Error extracting filters: {e}")
        return self._rule_based_filter_guess(query)

    def _parse_json_object(self, raw_text: str) -> Dict[str, Any]:
        text = (raw_text or "").strip()
        if not text:
            return {}
        if "```json" in text:
            text = text.split("```json", 1)[1].split("```", 1)[0].strip()
        elif "```" in text:
            text = text.split("```", 1)[1].split("```", 1)[0].strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if not match:
                return {}
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                return {}

    def _merge_filter_guesses(self, primary: Dict[str, Any], fallback: Dict[str, Any]) -> Dict[str, Any]:
        merged = dict(fallback)
        for key, value in primary.items():
            if value not in (None, "", [], {}):
                merged[key] = value
        return merged

    def _rule_based_filter_guess(self, query: str) -> Dict[str, Any]:
        normalized = query.lower()
        filters: Dict[str, Any] = {}

        for metal in ("gold", "silver", "platinum"):
            if metal in normalized:
                filters["metal_type"] = metal
                break

        for stone in ("diamond", "ruby", "emerald", "moissanite", "pearl"):
            if stone in normalized:
                filters["stone_type"] = stone
                break

        category_aliases = {
            "ring": "ring",
            "rings": "ring",
            "earring": "earring",
            "earrings": "earring",
            "necklace": "necklace",
            "necklaces": "necklace",
            "pendant": "pendant",
            "pendants": "pendant",
            "bracelet": "bracelet",
            "bracelets": "bracelet",
            "bangle": "bangle",
            "bangles": "bangle",
        }
        for token, category in category_aliases.items():
            if token in normalized:
                filters["category"] = category
                break

        for purity in ("14k", "18k", "22k", "24k", "925"):
            if purity in normalized:
                filters["purity"] = purity
                break

        for color in ("yellow", "white", "rose"):
            if f"{color} gold" in normalized or color in normalized:
                filters["metal_color"] = color
                break

        for occasion in ("engagement", "wedding", "party", "festive", "daily wear"):
            if occasion in normalized:
                filters["occasion"] = occasion
                break

        price_match = re.search(r"(?:under|below|less than)\s*(?:rs\.?\s*)?(\d[\d,]*)", normalized)
        lakh_match = re.search(r"(?:under|below|less than)\s*(\d+(?:\.\d+)?)\s*lakh", normalized)
        if lakh_match:
            filters["max_price"] = int(float(lakh_match.group(1)) * 100000)
        elif price_match:
            filters["max_price"] = int(price_match.group(1).replace(",", ""))

        # Detect single-product queries and extract product name hint
        name_match = re.search(
            r'(?:tell\s+me\s+(?:more\s+)?about|more\s+about|details?\s+(?:of|about|on)'
            r'|info(?:rmation)?\s+(?:on|about)|what\s+(?:is|are))\s+(?:the\s+|a\s+)?(.+?)(?:\?|$)',
            normalized,
        )
        if name_match:
            product_name_hint = re.sub(r'[.!?]+$', '', name_match.group(1)).strip()
            if product_name_hint and len(product_name_hint) > 1:
                filters['product_name'] = product_name_hint

        return filters

gemini_service = GeminiService()
