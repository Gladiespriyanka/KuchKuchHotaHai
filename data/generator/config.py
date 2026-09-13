"""Kabadiwala Connect — synthetic dataset generator: reference tables.

All prices are ILLUSTRATIVE synthetic values calibrated to publicly reported
Indian scrap-market ranges. They are NOT audited market data.
"""

SEED = 26229
END_DATE = "2026-08-31"
MONTHS_HISTORY = 24

# ---------------------------------------------------------------- taxonomy
# base_informal: typical ₹/kg an informal aggregator pays a collector
# formal_premium: fractional uplift an authorised recycler offers
# critical materials in grams per kg of material (recoverable, formal route)
TAXONOMY = [
    # category, sub_category, code, base_informal, formal_premium, volatility,
    # hazard, {critical g/kg}
    ("CRT", "Colour TV tube", "CRT-CTV", 14, 0.31, 0.05, "leaded_glass", {}),
    ("CRT", "Monochrome monitor tube", "CRT-MON", 10, 0.29, 0.05, "leaded_glass", {}),
    ("CRT", "Deflection yoke", "CRT-YOK", 46, 0.14, 0.09, "none", {}),

    ("LCD/LED panel", "Laptop panel", "LCD-LAP", 36, 0.21, 0.07, "mercury_backlight", {"indium": 0.28, "gallium": 0.04}),
    ("LCD/LED panel", "Monitor panel", "LCD-MON", 30, 0.20, 0.07, "mercury_backlight", {"indium": 0.24, "gallium": 0.03}),
    ("LCD/LED panel", "TV panel", "LCD-TV", 25, 0.19, 0.07, "mercury_backlight", {"indium": 0.19, "gallium": 0.03}),
    ("LCD/LED panel", "Backlight assembly", "LCD-BLA", 41, 0.17, 0.08, "mercury_backlight", {"indium": 0.06}),

    ("PCB", "Motherboard (high grade)", "PCB-MBH", 545, 0.26, 0.12, "solder_lead", {"tantalum": 1.6, "gallium": 0.05}),
    ("PCB", "RAM / gold-finger", "PCB-RAM", 1780, 0.24, 0.14, "solder_lead", {"tantalum": 0.9, "gallium": 0.04}),
    ("PCB", "GPU / add-on card", "PCB-GPU", 690, 0.25, 0.13, "solder_lead", {"tantalum": 1.4, "gallium": 0.07}),
    ("PCB", "TV / appliance board (low grade)", "PCB-LOW", 118, 0.28, 0.11, "solder_lead", {"tantalum": 0.4}),
    ("PCB", "Mixed populated board", "PCB-MIX", 298, 0.27, 0.12, "solder_lead", {"tantalum": 1.0, "gallium": 0.03}),

    ("Cable", "Copper household wire", "CBL-CU", 252, 0.05, 0.10, "pvc_burn_risk", {}),
    ("Cable", "Armoured / data cable", "CBL-ARM", 121, 0.07, 0.09, "pvc_burn_risk", {}),
    ("Cable", "Aluminium cable", "CBL-AL", 96, 0.06, 0.08, "pvc_burn_risk", {}),
    ("Cable", "Mixed insulated", "CBL-MIX", 71, 0.09, 0.09, "pvc_burn_risk", {}),

    ("Battery", "Li-ion laptop / phone pack", "BAT-LI", 92, 0.27, 0.13, "fire_puncture", {"lithium": 21.0, "cobalt": 58.0}),
    ("Battery", "Lead-acid", "BAT-PB", 78, 0.12, 0.08, "acid_lead", {}),
    ("Battery", "Ni-MH", "BAT-NIMH", 61, 0.18, 0.10, "fire_puncture", {}),
    ("Battery", "Button / coin cell", "BAT-BTN", 33, 0.22, 0.11, "fire_puncture", {"lithium": 8.0}),

    ("Motor & magnet-bearing", "HDD assembly", "MTR-HDD", 132, 0.24, 0.09, "none", {"neodymium": 14.5}),
    ("Motor & magnet-bearing", "Speaker magnet", "MTR-SPK", 89, 0.23, 0.09, "none", {"neodymium": 24.0}),
    ("Motor & magnet-bearing", "Small AC/DC motor", "MTR-SML", 66, 0.19, 0.08, "none", {"neodymium": 3.2}),
    ("Motor & magnet-bearing", "Compressor motor", "MTR-CMP", 55, 0.17, 0.08, "none", {"neodymium": 1.1}),

    ("Mixed plastic", "ABS casing", "PLA-ABS", 33, 0.11, 0.06, "brominated_fr", {}),
    ("Mixed plastic", "HIPS", "PLA-HIPS", 26, 0.10, 0.06, "brominated_fr", {}),
    ("Mixed plastic", "PC/ABS blend", "PLA-PCABS", 36, 0.12, 0.06, "brominated_fr", {}),
    ("Mixed plastic", "Mixed dirty", "PLA-MIX", 12, 0.09, 0.07, "brominated_fr", {}),
]

# Per-ITEM weight distribution: (mu of log-normal in log-kg, sigma, min_kg, max_kg).
# A lot is a CONSOLIDATED BATCH the collector accumulates over several days before
# selling, so the generator multiplies this by a per-lot batch count.
WEIGHT_DIST = {
    "CRT": (2.85, 0.35, 8, 220),                     # ~17 kg per tube
    "LCD/LED panel": (1.55, 0.55, 1.2, 90),          # ~4.7 kg per panel
    "PCB": (0.55, 0.85, 0.3, 45),                    # ~1.7 kg per board batch
    "Cable": (2.05, 0.70, 1.5, 160),                 # ~7.8 kg per bundle
    "Battery": (0.60, 0.95, 0.2, 90),                # ~1.8 kg per pack
    "Motor & magnet-bearing": (1.70, 0.65, 0.8, 130),
    "Mixed plastic": (2.35, 0.60, 2, 200),
}

# mean extra items per lot (Poisson); lot_weight = item_weight * (1 + Poisson(lambda))
BATCH_LAMBDA = {
    "CRT": 1.6, "LCD/LED panel": 2.4, "PCB": 3.4, "Cable": 3.0,
    "Battery": 3.2, "Motor & magnet-bearing": 2.6, "Mixed plastic": 2.8,
}

# relative frequency of each category in collected lots
CATEGORY_MIX = {
    "Cable": 0.24,
    "Mixed plastic": 0.19,
    "PCB": 0.16,
    "Motor & magnet-bearing": 0.13,
    "Battery": 0.11,
    "CRT": 0.10,
    "LCD/LED panel": 0.07,
}

# ---------------------------------------------------------------- geography
CITIES = {
    "Pune": {
        "mult": 1.03, "lat": 18.5204, "lng": 73.8567, "weight": 0.26,
        "areas": ["Bhosari", "Hadapsar", "Kothrud", "Katraj", "Vishrantwadi",
                  "Yerawada", "Wagholi", "Dhankawadi"],
        "industrial": [("Bhosari MIDC", 18.6298, 73.8474), ("Chakan MIDC", 18.7606, 73.8636),
                       ("Ranjangaon MIDC", 18.7644, 74.2456), ("Hadapsar IE", 18.5089, 73.9260)],
    },
    "Pimpri-Chinchwad": {
        "mult": 1.02, "lat": 18.6298, "lng": 73.7997, "weight": 0.14,
        "areas": ["Pimpri", "Chinchwad", "Nigdi", "Akurdi", "Talawade", "Moshi"],
        "industrial": [("Talawade IT Park", 18.6712, 73.7681), ("Kasarwadi", 18.6081, 73.8172)],
    },
    "Mumbai": {
        "mult": 1.06, "lat": 19.0760, "lng": 72.8777, "weight": 0.24,
        "areas": ["Kurla", "Dharavi", "Govandi", "Bhandup", "Andheri East",
                  "Mankhurd", "Malad West", "Vikhroli"],
        "industrial": [("Taloja MIDC", 19.0530, 73.1050), ("Mahape MIDC", 19.1136, 73.0169),
                       ("Kurla Industrial Estate", 19.0728, 72.8826), ("Ambernath MIDC", 19.1972, 73.1919)],
    },
    "Nashik": {
        "mult": 0.99, "lat": 19.9975, "lng": 73.7898, "weight": 0.13,
        "areas": ["Satpur", "Ambad", "Panchavati", "Nashik Road", "Deolali", "Cidco"],
        "industrial": [("Satpur MIDC", 20.0064, 73.7286), ("Ambad MIDC", 19.9631, 73.7175),
                       ("Sinnar MIDC", 19.8467, 74.0006)],
    },
    "Nagpur": {
        "mult": 0.97, "lat": 21.1458, "lng": 79.0882, "weight": 0.14,
        "areas": ["Butibori", "Hingna", "Kamptee Road", "Sitabuldi", "Wadi", "Manish Nagar"],
        "industrial": [("Butibori MIDC", 20.9333, 78.9833), ("Hingna MIDC", 21.1000, 78.9500),
                       ("Kalmeshwar MIDC", 21.2333, 78.9167)],
    },
    "Aurangabad": {
        "mult": 0.96, "lat": 19.8762, "lng": 75.3433, "weight": 0.09,
        "areas": ["Waluj", "Chikalthana", "Cidco N-7", "Garkheda", "Shendra"],
        "industrial": [("Waluj MIDC", 19.8397, 75.2419), ("Shendra MIDC", 19.8781, 75.4547),
                       ("Chikalthana MIDC", 19.8636, 75.3986)],
    },
}

# ---------------------------------------------------------------- name pools
FIRST_M = ["Ramesh", "Suresh", "Ganesh", "Sanjay", "Dattatray", "Bhaskar", "Vitthal",
           "Nitin", "Prakash", "Sandeep", "Ravi", "Ashok", "Mahesh", "Balu", "Kailas",
           "Shankar", "Deepak", "Rahul", "Imran", "Salim", "Firoz", "Munna", "Rakesh",
           "Vikas", "Pandurang", "Arjun", "Manoj", "Sunil", "Sagar", "Tukaram"]
FIRST_F = ["Sunita", "Mangala", "Rekha", "Anita", "Kavita", "Shobha", "Vaishali",
           "Sarika", "Ujwala", "Nanda", "Rukhsana", "Shabana", "Laxmi", "Sindhu", "Jyoti"]
SURNAMES = ["Kamble", "Shinde", "Pawar", "Jadhav", "More", "Sawant", "Gaikwad", "Chavan",
            "Bhosale", "Salunkhe", "Waghmare", "Sonawane", "Khan", "Shaikh", "Ansari",
            "Qureshi", "Yadav", "Kumar", "Nikam", "Deshmukh", "Rathod", "Bansode",
            "Ingle", "Tambe", "Dhage", "Mane", "Ghorpade", "Lokhande"]

RECYCLER_PREFIX = ["Shree", "Om", "Sai", "Ganesh", "Maharashtra", "Deccan", "Sahyadri",
                   "Vidarbha", "Konkan", "Bharat", "Nova", "Green", "EcoCircle", "Prithvi",
                   "Samruddhi", "Trimurti", "Jai", "Vishwa", "Aadi", "Nirmal"]
RECYCLER_MID = ["E-Waste", "Enviro", "Metals", "Recyclers", "Resource", "Green Tech",
                "Urban Mining", "Scrap", "Materials", "Recovery"]
RECYCLER_SUFFIX = ["Pvt Ltd", "Recycling Pvt Ltd", "Enterprises", "Industries",
                   "Solutions Pvt Ltd", "Associates", "LLP"]

# code-mixed voice transcripts by category (what the mic actually captures)
VOICE_TEMPLATES = {
    "Cable": ["{w} kilo tambe waayar", "{w} kilo wire mila hai", "waayar {w} kilo",
              "{w} kilo copper cable, purana"],
    "CRT": ["{w} kilo purana TV tube", "do CRT TV, purana", "{w} kilo TV ka glass",
            "juna TV monitor {w} kilo"],
    "PCB": ["{w} kilo circuit board", "computer ka board {w} kilo", "{w} kilo green plate",
            "motherboard {w} kilo"],
    "Battery": ["{w} kilo battery", "laptop battery {w} kilo", "{w} kilo cell",
                "gaadi ki battery {w} kilo"],
    "Motor & magnet-bearing": ["{w} kilo motor", "chumbak wali motor {w} kilo",
                               "{w} kilo hard disk", "speaker {w} kilo"],
    "Mixed plastic": ["{w} kilo plastic", "TV ka cover {w} kilo", "{w} kilo bhanga plastic",
                      "computer cabinet plastic {w} kilo"],
    "LCD/LED panel": ["{w} kilo LCD screen", "laptop screen {w} kilo", "{w} kilo panel",
                      "TV panel {w} kilo"],
}

SOURCE_TYPES = ["household_pickup", "small_shop", "office_clearance",
                "apartment_drive", "other_collector"]
SOURCE_WEIGHTS = [0.46, 0.21, 0.14, 0.11, 0.08]

CONDITIONS = ["intact", "partially_dismantled", "broken", "burnt", "waterlogged"]
CONDITION_WEIGHTS = [0.42, 0.31, 0.19, 0.05, 0.03]

# Confusion matrix rows for the DEMO classifier stub (true -> predicted prob).
# Deliberately weak on high-grade vs low-grade PCB — that distinction is genuinely hard.
CLASSIFIER_ACCURACY = {
    "CRT": 0.95,
    "Cable": 0.93,
    "Battery": 0.88,
    "Mixed plastic": 0.84,
    "LCD/LED panel": 0.82,
    "Motor & magnet-bearing": 0.80,
    "PCB": 0.71,
}
