from datetime import datetime, timedelta
from typing import Optional, Dict
from models import FetchResponse, CacheEntry

CACHE_TTL_HOURS = 6

_cache: Dict[str, CacheEntry] = {}


def get_cache_key(product_name: str, retailers: list) -> str:
    retailers_str = ",".join(sorted([r.value for r in retailers]))
    return f"{product_name.lower().strip()}:{retailers_str}"


def get_cached_data(cache_key: str) -> Optional[FetchResponse]:
    entry = _cache.get(cache_key)
    if entry is None:
        return None
    
    if datetime.utcnow() > entry.expires_at:
        del _cache[cache_key]
        return None
    
    return entry.data


def set_cached_data(cache_key: str, data: FetchResponse) -> None:
    entry = CacheEntry(
        data=data,
        expires_at=datetime.utcnow() + timedelta(hours=CACHE_TTL_HOURS),
        created_at=datetime.utcnow()
    )
    _cache[cache_key] = entry


def is_cache_stale(cache_key: str) -> bool:
    entry = _cache.get(cache_key)
    if entry is None:
        return True
    return datetime.utcnow() > entry.expires_at


def clear_cache() -> int:
    count = len(_cache)
    _cache.clear()
    return count


def get_cache_stats() -> Dict:
    now = datetime.utcnow()
    valid_entries = sum(1 for e in _cache.values() if now < e.expires_at)
    expired_entries = len(_cache) - valid_entries
    
    return {
        "total_entries": len(_cache),
        "valid_entries": valid_entries,
        "expired_entries": expired_entries,
        "cache_ttl_hours": CACHE_TTL_HOURS
    }


def cleanup_expired() -> int:
    now = datetime.utcnow()
    expired_keys = [k for k, v in _cache.items() if now > v.expires_at]
    for key in expired_keys:
        del _cache[key]
    return len(expired_keys)
