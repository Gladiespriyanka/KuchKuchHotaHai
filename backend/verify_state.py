import sqlite3
conn = sqlite3.connect('kabadiwala.db')
c = conn.cursor()

print("=== CHECKING USER ID 481 ===")
c.execute("SELECT id, phone, role, name FROM users WHERE id = 481")
user_rows = c.fetchall()
for row in user_rows:
    print(f"User: {row}")

print("\n=== CHECKING COLLECTOR PROFILES FOR USER_ID 481 ===")
c.execute("SELECT collector_id, user_id, display_name, operating_location FROM collectors WHERE user_id = 481")
collector_rows = c.fetchall()
for row in collector_rows:
    print(f"Collector profile: {row}")

print("\n=== CHECKING RECYCLER PROFILES FOR USER_ID 481 ===")
c.execute("SELECT recycler_id, user_id, name FROM recyclers WHERE user_id = 481")
recycler_rows = c.fetchall()
for row in recycler_rows:
    print(f"Recycler profile: {row}")

conn.close()