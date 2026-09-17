"""Quote-to-final price reliability calculations.

Calculates historical reliability of recyclers based on how closely their
quoted prices match final transaction prices.
"""
import math
from sqlalchemy.orm import Session

from ..models import Transaction, Lot


def calculate_transaction_deviation(transaction: Transaction, lot: Lot) -> float | None:
    """Calculate quote-to-final price deviation percentage for a single transaction.

    Args:
        transaction: The transaction to calculate deviation for
        lot: The lot associated with the transaction (provided explicitly to avoid relationship dependency)

    Returns:
        Deviation percentage (0-100+) or None if calculation not possible.
    """
    # Skip if essential data missing or invalid
    if not transaction or transaction.transaction_status != "COMPLETED":
        return None
    if transaction.payment_status != "PAID":
        return None

    # Handle lot=None safely
    if lot is None:
        return None

    # Extract values with explicit None handling
    quoted_price = transaction.quoted_price
    final_price = transaction.final_price
    original_weight = lot.weight
    final_weight = transaction.final_weight

    # Validate that all values are not None
    if quoted_price is None or final_price is None or original_weight is None or final_weight is None:
        return None

    # Convert to float safely (handles Decimal, int, etc.)
    try:
        quoted_price = float(quoted_price)
        final_price = float(final_price)
        original_weight = float(original_weight)
        final_weight = float(final_weight)
    except (ValueError, TypeError):
        return None

    # Reject NaN and infinite values
    if not (math.isfinite(quoted_price) and math.isfinite(final_price) and
            math.isfinite(original_weight) and math.isfinite(final_weight)):
        return None

    # Validate business rules
    if quoted_price <= 0:
        return None
    if final_price < 0:
        return None
    if original_weight <= 0:
        return None
    if final_weight <= 0:
        return None

    # Calculate rates
    quoted_rate = quoted_price / original_weight
    final_rate = final_price / final_weight

    # Validate rates are finite and prevent division by zero
    if not (math.isfinite(quoted_rate) and math.isfinite(final_rate)) or quoted_rate == 0:
        return None

    # Calculate deviation percentage
    deviation = abs(quoted_rate - final_rate) / quoted_rate * 100

    # Final validation that deviation is finite
    if not math.isfinite(deviation):
        return None

    return deviation


def get_recycler_reliability_stats(
    db: Session,
    recycler_id: int,
    material_category: str | None = None
) -> dict:
    """Get reliability statistics for a recycler.

    Args:
        db: Database session
        recycler_id: ID of the recycler
        material_category: Optional material category to filter by

    Returns:
        Dictionary with:
        - score: Reliability score (0-100) or None if insufficient data
        - transaction_count: Number of completed transactions used
        - avg_deviation: Average absolute percentage deviation
        - status: "sufficient" or "insufficient" history
    """
    # Build query for completed, paid transactions - join with Lot to get lot data
    query = db.query(Transaction, Lot).join(Lot, Transaction.lot_id == Lot.lot_id).filter(
        Transaction.recycler_id == recycler_id,
        Transaction.transaction_status == "COMPLETED",
        Transaction.payment_status == "PAID"
    )

    # Filter by material category if specified
    if material_category:
        query = query.filter(Lot.material_category == material_category)

    results = query.all()

    # Calculate deviations for valid transactions
    deviations = []
    for txn, lot in results:
        deviation = calculate_transaction_deviation(txn, lot)
        if deviation is not None:
            deviations.append(deviation)

    transaction_count = len(deviations)

    # Require minimum 3 transactions for sufficient history
    if transaction_count < 3:
        return {
            "score": None,
            "transaction_count": transaction_count,
            "avg_deviation": None,
            "status": "insufficient"
        }

    # Calculate average deviation and reliability score
    avg_deviation = sum(deviations) / len(deviations)
    # Reliability score: 100 - average deviation, clamped to 0-100
    score = max(0.0, min(100.0, 100.0 - avg_deviation))

    return {
        "score": round(score, 1),
        "transaction_count": transaction_count,
        "avg_deviation": round(avg_deviation, 1),
        "status": "sufficient"
    }