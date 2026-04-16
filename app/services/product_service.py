from typing import Any, Iterable, Optional

def build_searchable_text(
    product: Any,
    category_name: Optional[str] = None,
    category_slug: Optional[str] = None,
    extra_terms: Optional[Iterable[str]] = None,
) -> str:
    """Combines product fields into a searchable string"""
    fields = [
        getattr(product, 'name', ''),
        getattr(product, 'sku', ''),
        getattr(product, 'description', ''),
        getattr(product, 'brand', ''),
        getattr(product, 'collection_name', ''),
        category_name or '',
        category_slug or '',
        getattr(product, 'gender', ''),
        getattr(product, 'occasion', ''),
        f"{getattr(product, 'metal_type', '')} {getattr(product, 'purity', '')}",
        getattr(product, 'metal_color', ''),
        getattr(product, 'stone_type', ''),
        getattr(product, 'ring_size', ''),
        'with stones' if getattr(product, 'has_stones', False) else '',
        'bridal jewellery' if getattr(product, 'occasion', '') == 'wedding' else '',
    ]
    if extra_terms:
        fields.extend(extra_terms)
    return "\n".join([str(f).strip() for f in fields if str(f).strip()]).strip()

def calculate_price(product: Any, gold_rate: float = 6500) -> float:
    """Calculates product price based on weights and rates"""
    # Use price_override if available
    price_override = getattr(product, 'price_override', None)
    if price_override:
        return price_override

    # Basic calculation
    net_weight = getattr(product, 'net_weight', 0.0)
    making_rate = getattr(product, 'making_charge_rate', 0.0)
    tax_percent = getattr(product, 'tax_percentage', 3.0)
    
    base_price = net_weight * gold_rate
    making = base_price * (making_rate / 100)
    tax = (base_price + making) * (tax_percent / 100)
    
    return base_price + making + tax
