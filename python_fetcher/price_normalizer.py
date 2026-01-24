import re
from typing import Tuple, Optional
from models import Currency, PriceData

INR_TO_USD_RATE = 0.012
USD_TO_INR_RATE = 83.5


def parse_price_string(price_str: str) -> Tuple[Optional[float], Currency]:
    if not price_str:
        return None, Currency.USD
    
    price_str = price_str.strip()
    
    if "₹" in price_str or "Rs" in price_str.lower() or "inr" in price_str.lower():
        currency = Currency.INR
    elif "$" in price_str or "usd" in price_str.lower():
        currency = Currency.USD
    else:
        currency = Currency.USD
    
    numbers = re.findall(r'[\d,]+\.?\d*', price_str)
    if numbers:
        price_value = float(numbers[0].replace(',', ''))
        return price_value, currency
    
    return None, currency


def normalize_to_usd(amount: float, currency: Currency) -> float:
    if currency == Currency.USD:
        return round(amount, 2)
    elif currency == Currency.INR:
        return round(amount * INR_TO_USD_RATE, 2)
    return round(amount, 2)


def normalize_to_inr(amount: float, currency: Currency) -> float:
    if currency == Currency.INR:
        return round(amount, 2)
    elif currency == Currency.USD:
        return round(amount * USD_TO_INR_RATE, 2)
    return round(amount, 2)


def create_price_data(
    price_str: str,
    original_price_str: Optional[str] = None
) -> Optional[PriceData]:
    amount, currency = parse_price_string(price_str)
    
    if amount is None:
        return None
    
    amount_usd = normalize_to_usd(amount, currency)
    
    original_price = None
    discount_percent = None
    
    if original_price_str:
        orig_amount, _ = parse_price_string(original_price_str)
        if orig_amount and orig_amount > amount:
            original_price = orig_amount
            discount_percent = round((1 - amount / orig_amount) * 100, 1)
    
    return PriceData(
        amount=amount,
        currency=currency,
        amount_usd=amount_usd,
        original_price=original_price,
        discount_percent=discount_percent
    )


def format_price(price_data: PriceData, target_currency: Currency = Currency.USD) -> str:
    if target_currency == Currency.USD:
        symbol = "$"
        amount = price_data.amount_usd or normalize_to_usd(price_data.amount, price_data.currency)
    else:
        symbol = "₹"
        if price_data.currency == Currency.INR:
            amount = price_data.amount
        else:
            amount = normalize_to_inr(price_data.amount, price_data.currency)
    
    if amount >= 1000:
        return f"{symbol}{amount:,.2f}"
    return f"{symbol}{amount:.2f}"
