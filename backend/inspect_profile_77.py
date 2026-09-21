import sqlite3
conn = sqlite3.connect('kabadiwala.db')
c = conn.cursor()

print("=== INSPECTING RECYCLER PROFILE ID 77 ===")
c.execute("SELECT recycler_id, user_id, name, location, city, latitude, longitude FROM recyclers WHERE recycler_id = 77")
rows = c.fetchall()
print("Recycler profile ID 77:")
for row in rows:
    print(f"  recycler_id: {row[0]}")
    print(f"  user_id: {row[1]}")
    print(f"  name: {row[2]}")
    print(f"  location: {row[3]}")
    print(f"  city: {row[4]}")
    print(f"  latitude: {row[5]}")
    print(f"  longitude: {row[6]}")

print("\n=== CHECKING IF RECYCLER PROFILE ID 77 IS REFERENCED ELSEWHERE ===")

# Check if referenced in lots table (recycler_id)
c.execute("SELECT COUNT(*) FROM lots WHERE recycler_id = 77")
count = c.fetchone()[0]
print(f"Lots referencing recycler ID 77: {count}")

# Check if referenced in offers table (recycler_id)
c.execute("SELECT COUNT(*) FROM offers WHERE recycler_id = 77")
count = c.fetchone()[0]
print(f"Offers referencing recycler ID 77: {count}")

# Check if referenced in handovers table (might need to check through lots)
c.execute("""
    SELECT COUNT(*) FROM handovers h
    JOIN lots l ON h.lot_id = l.lot_id
    WHERE l.recycler_id = 77
""")
count = c.fetchone()[0]
print(f"Handovers referencing lots from recycler ID 77: {count}")

# Check if referenced in payments table (let's check the actual column names)
c.execute("PRAGMA table_info(transactions)")
tx_cols = c.fetchall()
print("Transactions table columns:", [col[1] for col in tx_cols])

c.execute("PRAGMA table_info(payments)")
pay_cols = c.fetchall()
print("Payments table columns:", [col[1] for col in pay_cols])

# Based on schema, payments table has transaction_id
# Let's check if there are any payments first
c.execute("SELECT COUNT(*) FROM payments")
pay_count = c.fetchone()[0]
print(f"Total payments in system: {pay_count}")

if pay_count > 0:
    c.execute("""
        SELECT COUNT(*) FROM payments p
        JOIN transactions t ON p.transaction_id = t.transaction_id
        JOIN lots l ON t.lot_id = l.lot_id
        WHERE l.recycler_id = 77
    """)
else:
    # Skip the join if no payments
    count = 0
print(f"Payments referencing transactions/lots from recycler ID 77: {count}")

# Check if referenced in pickup_bookings (through lots)
c.execute("""
    SELECT COUNT(*) FROM pickup_bookings pb
    JOIN lots l ON pb.lot_id = l.lot_id
    WHERE l.recycler_id = 77
""")
count = c.fetchone()[0]
print(f"Pickup bookings referencing lots from recycler ID 77: {count}")

print("\n=== CHECKING USER ID ASSOCIATED WITH RECYCLER PROFILE 77 ===")
c.execute("SELECT id, phone, role, name FROM users WHERE id = (SELECT user_id FROM recyclers WHERE recycler_id = 77)")
rows = c.fetchall()
print("User associated with recycler profile ID 77:")
for row in rows:
    print(f"  user_id: {row[0]}")
    print(f"  phone: {row[1]}")
    print(f"  role: {row[2]}")
    print(f"  name: {row[3]}")

conn.close()