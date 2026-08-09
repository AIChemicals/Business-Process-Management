"""Валидация номера карты (алгоритм Луна) и определение бренда."""


def luhn_valid(number: str) -> bool:
    digits = [int(d) for d in number if d.isdigit()]
    if len(digits) < 12:
        return False
    checksum = 0
    for i, digit in enumerate(reversed(digits)):
        if i % 2 == 1:
            digit *= 2
            if digit > 9:
                digit -= 9
        checksum += digit
    return checksum % 10 == 0


def detect_brand(number: str) -> str:
    if number.startswith("4"):
        return "visa"
    if number[:2] in {str(n) for n in range(51, 56)} or 2221 <= int(number[:4] or 0) <= 2720:
        return "mastercard"
    return "card"
