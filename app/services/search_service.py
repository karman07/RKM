import logging
import re
from typing import Any, Dict, Iterable, List, Optional, Set

from app.core.config import get_settings
from app.core.database import get_db
from app.services.product_service import calculate_price

settings = get_settings()
logger = logging.getLogger(__name__)

PRODUCT_PROJECTION = {
    "name": 1,
    "sku": 1,
    "description": 1,
    "category_id": 1,
    "brand": 1,
    "collection_name": 1,
    "gender": 1,
    "occasion": 1,
    "status": 1,
    "metal_type": 1,
    "purity": 1,
    "metal_color": 1,
    "gross_weight": 1,
    "net_weight": 1,
    "stone_weight": 1,
    "has_stones": 1,
    "stone_type": 1,
    "stone_price": 1,
    "dimensions": 1,
    "ring_size": 1,
    "making_charge_type": 1,
    "making_charge_rate": 1,
    "tax_percentage": 1,
    "discount_percentage": 1,
    "price_override": 1,
    "images": 1,
    "searchable_text": 1,
    "deleted_at": 1,
}

STOP_WORDS = {
    "a", "an", "and", "any", "best", "do", "for", "from", "i", "in", "is", "me",
    "of", "on", "please", "show", "something", "that", "the", "to", "under", "with",
}

CATEGORY_ALIASES = {
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

class SearchService:
    async def vector_search(
        self,
        query: str,
        query_vector: List[float],
        filters: Dict[str, Any],
        limit: int = 6,
    ) -> List[Dict]:
        db = get_db()
        collection = db[settings.COLLECTION_NAME]
        resolved_filters = await self._resolve_filters(db, filters)
        product_name_hint = resolved_filters.pop("product_name", None)
        filter_sequences = self._build_filter_sequences(resolved_filters)
        pool_size = max(limit * 4, settings.RETRIEVAL_POOL_SIZE)

        merged: Dict[str, Dict[str, Any]] = {}

        if query_vector:
            for mongo_filter in filter_sequences:
                vector_results = await self._run_vector_pipeline(collection, query_vector, mongo_filter, pool_size)
                self._merge_results(merged, vector_results, source="vector")

        for mongo_filter in filter_sequences:
            keyword_results = await self._run_keyword_search(collection, query, resolved_filters, mongo_filter, pool_size)
            self._merge_results(merged, keyword_results, source="keyword")

        if any(key in resolved_filters for key in ("category_ids", "metal_type", "stone_type", "purity", "occasion", "gender")):
            for mongo_filter in filter_sequences[:2]:
                filtered_results = await self._run_filter_only_search(collection, mongo_filter, pool_size)
                self._merge_results(merged, filtered_results, source="filter")

        # Direct name search when user is asking about a specific product
        if product_name_hint:
            name_results = await self._run_name_search(collection, product_name_hint, pool_size)
            self._merge_results(merged, name_results, source="name")

        ranked_results = list(merged.values())
        for item in ranked_results:
            item["calculated_price"] = calculate_price(type('obj', (object,), item))

        max_price = resolved_filters.get("max_price")
        if max_price is not None:
            ranked_results = [item for item in ranked_results if item["calculated_price"] <= max_price]

        ranked_results.sort(
            key=lambda item: (
                self._score_result(item, query, resolved_filters),
                item.get("_vector_score", 0.0),
                item.get("_keyword_score", 0.0),
            ),
            reverse=True,
        )
        return ranked_results[:limit]

    async def _run_vector_pipeline(self, collection, vector, filters, limit):
        pipeline = [
            {
                "$vectorSearch": {
                    "index": settings.VECTOR_INDEX_NAME,
                    "path": "embedding",
                    "queryVector": vector,
                    "numCandidates": max(settings.VECTOR_NUM_CANDIDATES, limit * 5),
                    "limit": limit,
                    "filter": filters
                }
            },
            {
                "$project": {
                    **PRODUCT_PROJECTION,
                    "_vector_score": {"$meta": "vectorSearchScore"},
                }
            }
        ]
        try:
            cursor = collection.aggregate(pipeline)
            return await cursor.to_list(length=limit)
        except Exception as e:
            logger.error(f"Vector search pipeline error: {e}")
            return []

    async def _run_name_search(self, collection, product_name: str, limit: int) -> List[Dict]:
        """Search products by name tokens — used for specific-product queries."""
        terms = [
            t for t in self._normalize_text(product_name).split()
            if len(t) > 2 and t not in STOP_WORDS
        ]
        if not terms:
            return []
        pattern = "|".join(re.escape(t) for t in sorted(terms, key=len, reverse=True))
        cursor = collection.find(
            {"status": "active", "deleted_at": None, "name": {"$regex": pattern, "$options": "i"}},
            PRODUCT_PROJECTION,
        ).limit(limit)
        results = await cursor.to_list(length=limit)
        for r in results:
            r["_keyword_score"] = max(r.get("_keyword_score", 0.0), 1.5)
        return results

    async def fallback_keyword_search(self, query: str, limit: int = 6) -> List[Dict]:
        db = get_db()
        collection = db[settings.COLLECTION_NAME]

        search_query = self._build_keyword_query(query, {"status": "active", "deleted_at": None})
        cursor = collection.find(search_query, PRODUCT_PROJECTION).limit(limit)
        results = await cursor.to_list(length=limit)
        for res in results:
            res["_keyword_score"] = self._keyword_overlap_score(res, self._expand_query_terms(query, {}), query)
            res["calculated_price"] = calculate_price(type('obj', (object,), res))
        return results

    async def _resolve_filters(self, db, filters: Dict[str, Any]) -> Dict[str, Any]:
        resolved = {key: value for key, value in filters.items() if value not in (None, "", [], {})}
        for field in ("metal_type", "stone_type", "purity", "metal_color", "occasion", "gender", "collection_name", "brand"):
            if field in resolved and isinstance(resolved[field], str):
                resolved[field] = resolved[field].strip().lower()
        if isinstance(resolved.get("purity"), str) and resolved["purity"].endswith("k"):
            resolved["purity"] = resolved["purity"].removesuffix("k")

        category = resolved.get("category")
        if isinstance(category, str):
            normalized_category = CATEGORY_ALIASES.get(category.strip().lower(), category.strip().lower())
            resolved["category"] = normalized_category
            category_docs = await db.categories.find(
                {
                    "$or": [
                        {"name": {"$regex": f"^{re.escape(normalized_category)}s?$", "$options": "i"}},
                        {"slug": {"$regex": f"^{re.escape(normalized_category)}s?$", "$options": "i"}},
                    ]
                },
                {"_id": 1, "name": 1, "slug": 1},
            ).to_list(length=10)
            if category_docs:
                resolved["category_ids"] = [str(doc["_id"]) for doc in category_docs]
                resolved["category_names"] = [doc.get("name", "") for doc in category_docs]
                resolved["category_slugs"] = [doc.get("slug", "") for doc in category_docs]

        return resolved

    def _build_filter_sequences(self, filters: Dict[str, Any]) -> List[Dict[str, Any]]:
        strict = {"status": "active", "deleted_at": None}
        for field in ("metal_type", "stone_type", "purity", "metal_color", "occasion", "gender", "collection_name", "brand"):
            value = filters.get(field)
            if value:
                strict[field] = self._exact_string_filter(value)
        if filters.get("category_ids"):
            strict["category_id"] = {"$in": filters["category_ids"]}

        sequences = [strict]

        if "category_id" in strict:
            without_category = dict(strict)
            without_category.pop("category_id", None)
            sequences.append(without_category)

        relaxed = {"status": "active", "deleted_at": None}
        if filters.get("metal_type"):
            relaxed["metal_type"] = self._exact_string_filter(filters["metal_type"])
        sequences.append(relaxed)
        sequences.append({"status": "active", "deleted_at": None})

        unique_sequences: List[Dict[str, Any]] = []
        seen = set()
        for sequence in sequences:
            key = repr(sorted(sequence.items(), key=lambda item: item[0]))
            if key not in seen:
                unique_sequences.append(sequence)
                seen.add(key)
        return unique_sequences

    async def _run_keyword_search(self, collection, query: str, filters: Dict[str, Any], mongo_filter: Dict[str, Any], limit: int) -> List[Dict]:
        search_query = self._build_keyword_query(query, mongo_filter, filters)
        cursor = collection.find(search_query, PRODUCT_PROJECTION).limit(limit)
        results = await cursor.to_list(length=limit)
        terms = self._expand_query_terms(query, filters)
        for result in results:
            result["_keyword_score"] = self._keyword_overlap_score(result, terms, query)
        return results

    async def _run_filter_only_search(self, collection, mongo_filter: Dict[str, Any], limit: int) -> List[Dict]:
        cursor = collection.find(mongo_filter, PRODUCT_PROJECTION).limit(limit)
        return await cursor.to_list(length=limit)

    def _build_keyword_query(self, query: str, mongo_filter: Dict[str, Any], filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        terms = self._expand_query_terms(query, filters or {})
        if not terms:
            return mongo_filter

        regex_pattern = "|".join(re.escape(term) for term in sorted(terms, key=len, reverse=True))
        return {
            **mongo_filter,
            "$or": [
                {"name": {"$regex": regex_pattern, "$options": "i"}},
                {"sku": {"$regex": regex_pattern, "$options": "i"}},
                {"description": {"$regex": regex_pattern, "$options": "i"}},
                {"searchable_text": {"$regex": regex_pattern, "$options": "i"}},
                {"collection_name": {"$regex": regex_pattern, "$options": "i"}},
                {"brand": {"$regex": regex_pattern, "$options": "i"}},
                {"occasion": {"$regex": regex_pattern, "$options": "i"}},
            ],
        }

    def _merge_results(self, merged: Dict[str, Dict[str, Any]], results: Iterable[Dict[str, Any]], source: str) -> None:
        for result in results:
            identifier = str(result.get("_id") or result.get("sku") or result.get("name"))
            existing = merged.get(identifier)
            if not existing:
                payload = dict(result)
                payload["_sources"] = {source}
                merged[identifier] = payload
                continue

            existing["_sources"].add(source)
            existing["_vector_score"] = max(existing.get("_vector_score", 0.0), result.get("_vector_score", 0.0))
            existing["_keyword_score"] = max(existing.get("_keyword_score", 0.0), result.get("_keyword_score", 0.0))

    def _expand_query_terms(self, query: str, filters: Dict[str, Any]) -> Set[str]:
        normalized = self._normalize_text(query)
        terms = {token for token in normalized.split() if len(token) > 2 and token not in STOP_WORDS}

        for value in filters.values():
            if isinstance(value, str):
                normalized_value = self._normalize_text(value)
                if normalized_value:
                    terms.update(token for token in normalized_value.split() if len(token) > 2)
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, str):
                        terms.update(token for token in self._normalize_text(item).split() if len(token) > 2)

        for term in list(terms):
            if term in CATEGORY_ALIASES:
                canonical = CATEGORY_ALIASES[term]
                terms.add(canonical)
                terms.add(f"{canonical}s")
        return terms

    def _keyword_overlap_score(self, result: Dict[str, Any], terms: Set[str], query: str) -> float:
        haystack = self._document_text(result)
        if not haystack or not terms:
            return 0.0
        matches = sum(1 for term in terms if term in haystack)
        score = matches / max(len(terms), 1)
        normalized_query = self._normalize_text(query)
        if normalized_query and normalized_query in haystack:
            score += 0.25
        name = self._normalize_text(result.get("name", ""))
        if name and any(term in name for term in terms):
            score += 0.2
        return score

    def _score_result(self, result: Dict[str, Any], query: str, filters: Dict[str, Any]) -> float:
        score = result.get("_vector_score", 0.0) * 1.3
        score += result.get("_keyword_score", 0.0) * 1.8

        haystack = self._document_text(result)
        query_tokens = [token for token in self._normalize_text(query).split() if token not in STOP_WORDS]
        token_hits = sum(1 for token in query_tokens if token in haystack)
        if query_tokens:
            score += token_hits / len(query_tokens)

        if filters.get("category"):
            category_match = False
            if filters.get("category_ids") and str(result.get("category_id")) in filters["category_ids"]:
                category_match = True
            if filters["category"] in haystack:
                category_match = True
            if category_match:
                score += 1.4

        for field, bonus in (
            ("metal_type", 0.8),
            ("stone_type", 0.8),
            ("purity", 0.6),
            ("metal_color", 0.5),
            ("occasion", 0.4),
            ("gender", 0.3),
        ):
            if filters.get(field) and self._normalize_text(str(result.get(field, ""))) == self._normalize_text(str(filters[field])):
                score += bonus

        score += 0.15 * len(result.get("_sources", []))

        # Heavy name-match bonus: query tokens that appear in product name
        name = self._normalize_text(result.get("name", ""))
        name_tokens = {t for t in name.split() if len(t) > 2 and t not in STOP_WORDS}
        if name_tokens and query_tokens:
            name_hits = sum(1 for token in query_tokens if token in name_tokens)
            if name_hits:
                score += (name_hits / len(query_tokens)) * 5.0

        return score

    def _document_text(self, result: Dict[str, Any]) -> str:
        return self._normalize_text(
            " ".join(
                str(result.get(field, ""))
                for field in (
                    "name",
                    "sku",
                    "description",
                    "searchable_text",
                    "collection_name",
                    "brand",
                    "occasion",
                    "metal_type",
                    "stone_type",
                    "purity",
                )
            )
        )

    def _exact_string_filter(self, value: Any) -> Dict[str, Any]:
        raw_value = str(value).strip()
        variants = []
        for candidate in (raw_value, raw_value.lower(), raw_value.upper(), raw_value.title()):
            if candidate and candidate not in variants:
                variants.append(candidate)
        if len(variants) == 1:
            return {"$eq": variants[0]}
        return {"$in": variants}

    def _normalize_text(self, value: str) -> str:
        value = value.lower().strip()
        value = re.sub(r"[^a-z0-9\s]", " ", value)
        return re.sub(r"\s+", " ", value).strip()

search_service = SearchService()
