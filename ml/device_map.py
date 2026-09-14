"""Map a predicted DEVICE to a scrap MATERIAL category.

The image dataset labels devices (Keyboard, Printer, Television…). The
platform trades materials (PCB, Cable, Mixed plastic…). These are not the
same thing, and pretending they are would be the dishonest shortcut:

  * Television  -> CRT or LCD/LED panel? A front-on photo cannot tell you.
                   The app ASKS instead of guessing.
  * Keyboard / Mouse / Printer / Player -> mostly plastic housing plus a
                   board. Which one the collector is selling depends on
                   whether they have dismantled it.
  * Cable and Mixed plastic have NO class in the dataset, so photo
                   classification can never propose Cable. Voice and manual
                   entry cover it.

So every mapping below is a SUGGESTION with alternatives, always confirmed by
the collector before the lot is priced.
"""

# device -> (primary material, [alternatives], needs_disambiguation)
DEVICE_TO_MATERIAL = {
    "Battery": ("Battery", [], False),
    "PCB": ("PCB", ["Motor & magnet-bearing"], False),
    "Mobile": ("PCB", ["Battery", "LCD/LED panel"], False),
    "Keyboard": ("Mixed plastic", ["PCB"], False),
    "Mouse": ("Mixed plastic", ["PCB"], False),
    "Printer": ("Mixed plastic", ["PCB", "Motor & magnet-bearing"], False),
    "Player": ("PCB", ["Mixed plastic", "Motor & magnet-bearing"], False),
    "Microwave": ("Motor & magnet-bearing", ["PCB", "Mixed plastic"], False),
    "Washing Machine": ("Motor & magnet-bearing", ["Mixed plastic", "PCB"], False),
    # Genuinely ambiguous from a photograph — ask the collector.
    "Television": ("CRT", ["LCD/LED panel"], True),
}

DISAMBIGUATION = {
    "Television": {
        "question": {
            "en": "Is it a heavy old TV with a deep back, or a thin flat TV?",
            "hi": "पुरानी भारी टीवी है या पतली फ्लैट टीवी?",
            "mr": "जुना जड टीव्ही आहे की पातळ फ्लॅट टीव्ही?",
        },
        "options": [
            {"material": "CRT", "label": {"en": "Heavy, deep back",
                                          "hi": "भारी, पीछे मोटी", "mr": "जड, मागे जाड"}},
            {"material": "LCD/LED panel", "label": {"en": "Thin, flat",
                                                    "hi": "पतली, सपाट", "mr": "पातळ, सपाट"}},
        ],
    },
}

# Categories that photo classification can never propose from this dataset.
NOT_COVERED_BY_IMAGE_DATASET = ["Cable", "Mixed plastic"]


def map_device(device: str) -> dict:
    primary, alts, ambiguous = DEVICE_TO_MATERIAL.get(device, (None, [], False))
    return {
        "device": device,
        "material": primary,
        "alternatives": alts,
        "needs_disambiguation": ambiguous,
        "disambiguation": DISAMBIGUATION.get(device),
    }
