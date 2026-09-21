import sqlite3
conn = sqlite3.connect('kabadiwala.db')
c = conn.cursor()

print("=== VERIFYING FIX ===")

# Check user ID 481
print("\n1. Checking user ID 481:")
c.execute("SELECT id, phone, role, name FROM users WHERE id = 481")
rows = c.fetchall()
for row in rows:
    print(f"   id: {row[0]}, phone: {row[1]}, role: {row[2]}, name: {row[3]}")

# Check collector profile for user ID 481
print("\n2. Checking collector profile for user ID 481:")
c.execute("SELECT collector_id, user_id, display_name, operating_location FROM collectors WHERE user_id = 481")
rows = c.fetchall()
for row in rows:
    print(f"   collector_id: {row[0]}, user_id: {row[1]}, display_name: {row[2]}, operating_location: {row[3]}")

# Verify recycler profile ID 77 is gone
print("\n3. Verifying recycler profile ID 77 is removed:")
c.execute("SELECT recycler_id, user_id, name FROM recyclers WHERE recycler_id = 77")
rows = c.fetchall()
if len(rows) == 0:
    print("   Recycler profile ID 77: REMOVED (good)")
else:
    print("   Recycler profile ID 77: STILL EXISTS (problem!)")
    for row in rows:
        print(f"   recycler_id: {row[0]}, user_id: {row[1]}, name: {row[2]}")

# Check that real recycler demo account (ID 482) is still intact
print("\n4. Checking real recycler demo account (ID 482) is intact:")
c.execute("SELECT id, phone, role, name FROM users WHERE id = 482")
rows = c.fetchall()
for row in rows:
    print(f"   id: {row[0]}, phone: {row[1]}, role: {row[2]}, name: {row[3]}")

c.execute("SELECT recycler_id, user_id, name FROM recyclers WHERE user_id = 482")
rows = c.fetchall()
for row in rows:
    print(f"   recycler_id: {row[0]}, user_id: {row[1]}, name: {row[2]}")

conn.close()