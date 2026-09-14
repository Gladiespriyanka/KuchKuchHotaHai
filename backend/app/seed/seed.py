"""Seed the database with a realistic demo dataset.

Everything created here is FICTIONAL, generated for demonstration only. The
recyclers are not real businesses and their authorisation records are not
real government registrations.

Run:  python -m app.seed.seed
"""
import random
from datetime import datetime, timedelta

from ..database import Base, SessionLocal, engine
from ..models import (
    Collector, Handover, Lot, LotEvent, Material, Payment, Price, Recycler,
    Transaction, User,
)
from ..services import anomaly
from ..services.security import hash_password

random.seed(26229)

CITY = (26.9124, 75.7873)  # Jaipur

MATERIALS = [
    ("PCB", "Motherboards, RAM, adapters", "Printed circuit boards from computers and appliances",
     "Never burn boards — fumes contain lead and brominated compounds.", "🔌", 150),
    ("Cable", "Copper wire, chargers, LAN", "Insulated copper and aluminium wiring",
     "Do not burn insulation. Strip mechanically only.", "🔗", 575),
    ("Battery", "Li-ion, lead-acid packs", "Battery packs from phones, laptops, inverters",
     "Never puncture, crush or open a battery.", "🔋", 130),
    ("LCD", "Monitor and laptop panels", "Flat panel displays with backlight assemblies",
     "Panels contain mercury lamps in older units — do not break.", "🖥️", 75),
    ("CRT", "TV and monitor tubes", "Cathode ray tubes with leaded glass",
     "Leaded glass under vacuum. Handle whole, never smash.", "📺", 55),
    ("Motor", "Fan, pump, drive motors", "Small electric motors with copper windings",
     "Heavy — lift with both hands, use gloves.", "⚙️", 120),
    ("Magnet-bearing Assembly", "HDD, speaker magnets", "Assemblies containing rare-earth magnets",
     "Strong magnets can pinch fingers and wipe cards.", "🧲", 178),
    ("Mixed Plastic", "Casings, housings", "ABS/HIPS casings from appliances",
     "Do not melt or burn plastic casings.", "♻️", 28),
]

COLLECTORS = [
    ("Ramesh Kumar", "collector@demo.com", "hi", "Malviya Nagar, Jaipur", 26.8535, 75.8135),
    ("Sunita Devi", "sunita@demo.com", "hi", "Sanganer, Jaipur", 26.8180, 75.7900),
    ("Imran Shaikh", "imran@demo.com", "mr", "Jhotwara, Jaipur", 26.9440, 75.7480),
    ("Lakshmi Bai", "lakshmi@demo.com", "hi", "Vaishali Nagar, Jaipur", 26.9120, 75.7370),
    ("Govind Meena", "govind@demo.com", "hi", "Amer Road, Jaipur", 26.9800, 75.8500),
    ("Prakash Jadhav", "prakash@demo.com", "mr", "Mansarovar, Jaipur", 26.8500, 75.7620),
    ("Fatima Bano", "fatima@demo.com", "hi", "Ramganj, Jaipur", 26.9220, 75.8300),
    ("Deepak Yadav", "deepak@demo.com", "hi", "Jagatpura, Jaipur", 26.8180, 75.8620),
    ("Sanjay More", "sanjay@demo.com", "mr", "Bais Godam, Jaipur", 26.9010, 75.7830),
    ("Kavita Sharma", "kavita@demo.com", "en", "C-Scheme, Jaipur", 26.9070, 75.7930),
]

# name, email(optional), location, lat, lng, materials, auth id, status, contact,
# rate multiplier, pickup, service radius
RECYCLERS = [
    ("Green Recyclers", "recycler@demo.com", "Ajmer Road Industrial Belt, Jaipur",
     26.9130, 75.7830,
     ["PCB", "Cable", "Battery", "Motor", "Magnet-bearing Assembly", "LCD"],
     "AUTH-12345", "approved", "+91 98290 10001", 1.03, True, 25),
    ("Aravalli E-Waste Pvt Ltd", "aravalli@demo.com", "Sitapura Industrial Area, Jaipur",
     26.7860, 75.8480, ["PCB", "LCD", "CRT", "Mixed Plastic", "Cable"],
     "AUTH-20871", "approved", "+91 98290 10002", 0.98, True, 30),
    ("Pink City Metals", "pinkcity@demo.com", "Bais Godam, Jaipur", 26.8890, 75.7720,
     ["Cable", "Motor", "Magnet-bearing Assembly"],
     "AUTH-30442", "approved", "+91 98290 10003", 1.01, False, 15),
    ("Jaipur Circular Systems", None, "Jhotwara Industrial Area, Jaipur", 26.9490, 75.7350,
     ["PCB", "Battery", "Mixed Plastic"], "AUTH-40113", "approved", "+91 98290 10004",
     0.96, True, 20),
    ("Marudhara Recycling", None, "Bagru, Jaipur", 26.8130, 75.5460,
     ["CRT", "LCD", "Mixed Plastic", "Motor"], "AUTH-50219", "approved",
     "+91 98290 10005", 0.94, False, 35),
    ("Chambal Green Loop", None, "Kota Road, Jaipur", 26.7600, 75.8100,
     ["Battery", "PCB", "Cable"], "AUTH-60777", "approved", "+91 98290 10006", 1.00, True, 28),
    ("Suraj Metal Recovery", None, "Sanganer, Jaipur", 26.8210, 75.7880,
     ["Cable", "Motor", "Mixed Plastic"], "AUTH-70884", "approved",
     "+91 98290 10007", 0.97, True, 18),
    ("Nirmal Urban Mining", None, "Kukas, Jaipur", 27.0480, 75.9120,
     ["PCB", "Magnet-bearing Assembly", "LCD", "Battery"], "AUTH-80990", "approved",
     "+91 98290 10008", 1.02, True, 32),
    ("Shakti Waste Solutions", None, "Chomu, Jaipur", 27.1670, 75.7220,
     ["Cable", "Battery", "CRT"], "AUTH-90551", "pending", "+91 98290 10009", 0.99, True, 25),
    ("Vasundhara Recyclers", None, "Tonk Road, Jaipur", 26.8020, 75.8060,
     ["PCB", "LCD", "Mixed Plastic"], "AUTH-91662", "pending", "+91 98290 10010", 1.00, False, 20),
]

CONDITIONS = ["good", "damaged", "mixed"]
SOURCES = ["household", "commercial", "industrial", "scrap_collection"]


def reset_database() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def run() -> None:
    reset_database()
    db = SessionLocal()
    now = datetime.utcnow()

    # ---- materials -------------------------------------------------------
    base_rate = {}
    for cat, sub, desc, hazard, icon, rate in MATERIALS:
        db.add(Material(category=cat, subcategory=sub, description=desc,
                        hazard_note=hazard, icon=icon, unit="kg"))
        base_rate[cat] = rate
    db.flush()

    # ---- admin -----------------------------------------------------------
    db.add(User(email="admin@demo.com", password_hash=hash_password("password123"),
                role="admin", name="Platform Admin", language="en"))

    # ---- collectors ------------------------------------------------------
    collectors = []
    for name, email, lang, area, lat, lng in COLLECTORS:
        user = User(email=email, password_hash=hash_password("password123"),
                    role="collector", name=name, language=lang)
        db.add(user)
        db.flush()
        c = Collector(user_id=user.id, display_name=name, language=lang,
                      operating_location=area, latitude=lat, longitude=lng,
                      created_at=now - timedelta(days=random.randint(30, 300)))
        db.add(c)
        collectors.append(c)
    db.flush()

    # ---- recyclers -------------------------------------------------------
    # Price drift over the seeded 90 days, so recycler rates start at today's
    # level rather than the 90-day-old level.
    drift = {"PCB": 0.0030, "Cable": 0.0000, "Battery": -0.0030, "LCD": 0.0000,
             "CRT": 0.0000, "Motor": 0.0028, "Magnet-bearing Assembly": 0.0020,
             "Mixed Plastic": 0.0000}
    current_rate = {c: base_rate[c] * (1 + drift[c] * 90) for c in base_rate}

    recyclers = []
    for (name, email, loc, lat, lng, mats, auth_id, auth_status, contact,
         mult, pickup, radius) in RECYCLERS:
        user_id = None
        if email:
            u = User(email=email, password_hash=hash_password("password123"),
                     role="recycler", name=name, language="en")
            db.add(u)
            db.flush()
            user_id = u.id
        rates = {m: round(current_rate[m] * mult * random.uniform(0.97, 1.06)) for m in mats}
        r = Recycler(user_id=user_id, name=name, location=loc, latitude=lat, longitude=lng,
                     accepted_materials=mats, authorization_id=auth_id,
                     authorization_status=auth_status, contact=contact, offered_rate=rates,
                     pickup_available=pickup, service_area_km=radius,
                     rating=round(random.uniform(3.9, 4.9), 1),
                     documents_note="Demo document set (prototype data)")
        db.add(r)
        recyclers.append(r)
    db.flush()

    # Scripted demo: Green Recyclers quotes ₹195/kg for PCB and comes out as
    # the best match. Fixed rates keep the live demo reproducible.
    demo_pcb = {"Green Recyclers": 195, "Aravalli E-Waste Pvt Ltd": 186,
                "Jaipur Circular Systems": 178, "Chambal Green Loop": 189,
                "Nirmal Urban Mining": 188, "Vasundhara Recyclers": 184}
    for r in recyclers:
        if r.name in demo_pcb:
            # reassign (not mutate) so SQLAlchemy persists the JSON column
            r.offered_rate = {**r.offered_rate, "PCB": demo_pcb[r.name]}

    # ---- price history (90 days x 8 materials x 3 locations) -------------
    locations = ["Malviya Nagar, Jaipur", "Sanganer, Jaipur",
                 "Ajmer Road Industrial Belt, Jaipur"]
    for cat, *_ in MATERIALS:
        base = base_rate[cat]
        for day in range(90, -1, -1):
            date = now - timedelta(days=day)
            season = 1 + drift[cat] * (90 - day)
            for loc in locations:
                noise = random.uniform(0.92, 1.08)
                buying = round(base * season * noise, 1)
                db.add(Price(material_category=cat, location=loc, date=date,
                             buying_price=buying, selling_price=round(buying * 1.18, 1),
                             unit="kg", source="seed"))
    db.flush()

    # ---- lots, transactions, handovers, payments -------------------------
    approved = [r for r in recyclers if r.authorization_status == "approved"]
    lot_seq = 0
    txn_rows = []

    def make_lot(collector, category, weight, days_ago, condition="good",
                 source="household"):
        nonlocal lot_seq
        lot_seq += 1
        created = now - timedelta(days=days_ago, hours=random.randint(0, 12))
        rate = current_rate[category]
        lot = Lot(
            lot_id=f"KC-{created.year}-{lot_seq:06d}",
            collector_id=collector.collector_id,
            material_category=category,
            description=f"{category} collected from {source.replace('_', ' ')}",
            photo="",
            weight=weight,
            condition=condition,
            source_type=source,
            estimated_min=round(rate * 0.94 * weight),
            estimated_max=round(rate * 1.10 * weight),
            ai_prediction={"category": category, "confidence": round(random.uniform(0.78, 0.96), 2),
                           "model_version": "heuristic-demo-v1"},
            location=collector.operating_location,
            latitude=collector.latitude, longitude=collector.longitude,
            status="PRICE_ESTIMATED",
            created_at=created, updated_at=created,
        )
        db.add(lot)
        db.flush()
        db.add(LotEvent(lot_id=lot.lot_id, status="LOT_CREATED",
                        note=f"{weight} kg {category}", actor=collector.display_name,
                        created_at=created))
        db.add(LotEvent(lot_id=lot.lot_id, status="PRICE_ESTIMATED",
                        note=f"₹{lot.estimated_min:.0f} – ₹{lot.estimated_max:.0f}",
                        created_at=created))
        return lot

    def complete_lot(lot, recycler, days_ago, pay_mode="cash", anomalous=False,
                     stop_at="paid"):
        created = lot.created_at
        rate = float(recycler.offered_rate.get(lot.material_category, current_rate[lot.material_category]))
        lot.recycler_id = recycler.recycler_id
        lot.quoted_price = round(rate * lot.weight)
        lot.match_score = round(random.uniform(78, 96), 1)
        txn = Transaction(lot_id=lot.lot_id, collector_id=lot.collector_id,
                          recycler_id=recycler.recycler_id, quoted_price=lot.quoted_price,
                          collection_location=lot.location,
                          transaction_status="RECYCLER_MATCHED", payment_status="PENDING",
                          created_at=created + timedelta(hours=2),
                          updated_at=created + timedelta(hours=2))
        db.add(txn)
        db.flush()
        db.add(LotEvent(lot_id=lot.lot_id, status="RECYCLER_MATCHED",
                        note=f"{recycler.name} at ₹{rate:.0f}/kg",
                        actor=lot.collector.display_name if lot.collector else "collector",
                        created_at=created + timedelta(hours=2)))
        db.add(LotEvent(lot_id=lot.lot_id, status="HANDOVER_PENDING",
                        note="Waiting for recycler to scan the lot QR",
                        created_at=created + timedelta(hours=2)))
        lot.status = "HANDOVER_PENDING"
        txn_rows.append(txn)
        if stop_at == "pending_handover":
            return txn

        hand_time = created + timedelta(days=1, hours=random.randint(1, 8))
        final_weight = round(lot.weight * random.uniform(0.94, 1.02), 1)
        if anomalous:
            final_price = round(rate * final_weight * 0.55)
        else:
            final_price = round(rate * final_weight)
        flagged, reason = anomaly.check(db, lot.material_category, final_price,
                                        final_weight, lot.weight)
        ref_no = f"HR-{hand_time.year}-{len(txn_rows):05d}"
        db.add(Handover(reference_number=ref_no, lot_id=lot.lot_id,
                        transaction_id=txn.transaction_id, photo=lot.photo,
                        weight=final_weight,
                        gps_location=f"{recycler.latitude:.4f},{recycler.longitude:.4f}",
                        recycler_confirmation=True, status="VERIFIED", timestamp=hand_time))
        txn.final_weight = final_weight
        txn.final_price = final_price
        txn.handover_location = recycler.location
        txn.transaction_status = "HANDED_OVER"
        txn.anomaly_flag = flagged
        txn.anomaly_reason = reason
        txn.updated_at = hand_time
        lot.status = "PAYMENT_PENDING"
        db.add(LotEvent(lot_id=lot.lot_id, status="RECYCLER_VERIFIED",
                        note=f"QR verified by {recycler.name}", actor=recycler.name,
                        created_at=hand_time))
        db.add(LotEvent(lot_id=lot.lot_id, status="HANDED_OVER",
                        note=f"{final_weight} kg at ₹{final_price:.0f} · ref {ref_no}",
                        actor=recycler.name, created_at=hand_time))
        if flagged:
            db.add(LotEvent(lot_id=lot.lot_id, status="ANOMALY_FLAGGED", note=reason,
                            actor="anomaly-service", created_at=hand_time))
        if stop_at == "pending_payment":
            db.add(LotEvent(lot_id=lot.lot_id, status="PAYMENT_PENDING",
                            note="Awaiting payment confirmation", created_at=hand_time))
            return txn

        pay_time = hand_time + timedelta(hours=random.randint(1, 20))
        db.add(Payment(transaction_id=txn.transaction_id, amount=final_price,
                       mode=pay_mode, status="PAID", timestamp=pay_time))
        txn.payment_status = "PAID"
        txn.transaction_status = "COMPLETED"
        txn.updated_at = pay_time
        lot.status = "COMPLETED"
        db.add(LotEvent(lot_id=lot.lot_id, status="PAID",
                        note=f"₹{final_price:.0f} via {pay_mode.upper()}", actor=recycler.name,
                        created_at=pay_time))
        db.add(LotEvent(lot_id=lot.lot_id, status="COMPLETED",
                        note="Traceability record closed", created_at=pay_time))
        return txn

    categories = [m[0] for m in MATERIALS]
    # 30 completed / in-flight transactions across 10 collectors
    for i in range(30):
        collector = collectors[i % len(collectors)]
        category = categories[i % len(categories)]
        weight = round(random.uniform(3, 28), 1)
        lot = make_lot(collector, category, weight, days_ago=random.randint(3, 75),
                       condition=random.choice(CONDITIONS), source=random.choice(SOURCES))
        recycler = random.choice([r for r in approved if category in r.accepted_materials])
        if i in (7, 19):  # two seeded anomaly examples
            complete_lot(lot, recycler, 0, pay_mode="cash", anomalous=True)
        elif i % 7 == 3:
            complete_lot(lot, recycler, 0, stop_at="pending_payment")
        else:
            complete_lot(lot, recycler, 0, pay_mode=random.choice(["cash", "upi"]))

    # 6 lots waiting for a recycler to scan (populates recycler "incoming")
    for i in range(6):
        collector = collectors[(i * 3) % len(collectors)]
        category = categories[(i * 2) % len(categories)]
        lot = make_lot(collector, category, round(random.uniform(4, 20), 1),
                       days_ago=random.randint(0, 3))
        recycler = recyclers[0] if category in recyclers[0].accepted_materials else \
            random.choice([r for r in approved if category in r.accepted_materials])
        complete_lot(lot, recycler, 0, stop_at="pending_handover")

    # 4 fresh lots with no recycler yet (collector can still choose)
    for i in range(4):
        make_lot(collectors[i], categories[i], round(random.uniform(5, 15), 1), days_ago=i)

    db.commit()

    counts = {
        "collectors": db.query(Collector).count(),
        "recyclers": db.query(Recycler).count(),
        "materials": db.query(Material).count(),
        "prices": db.query(Price).count(),
        "lots": db.query(Lot).count(),
        "transactions": db.query(Transaction).count(),
        "handovers": db.query(Handover).count(),
        "payments": db.query(Payment).count(),
        "anomalies": db.query(Transaction).filter(Transaction.anomaly_flag.is_(True)).count(),
    }
    db.close()
    print("Seeded demo dataset (fictional data for demonstration only):")
    for k, v in counts.items():
        print(f"  {k:<14} {v}")
    print("\nDemo logins (all password123):")
    print("  collector@demo.com  ·  recycler@demo.com  ·  admin@demo.com")


if __name__ == "__main__":
    run()
