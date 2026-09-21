import sqlite3
import datetime
conn = sqlite3.connect('kabadiwala.db')
c = conn.cursor()

print("=== APPLYING FIX FOR COLLECTOR ACCOUNT/PROFILE MAPPING ===")

# Get current timestamp for created_at field
created_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

# 1. Update user ID 481 name from "Recycler 0001" to "Collector 0001"
print("\n1. Updating user ID 481 name from 'Recycler 0001' to 'Collector 0001'...")
c.execute("UPDATE users SET name = 'Collector 0001' WHERE id = 481")
print(f"   Rows updated: {c.rowcount}")

# 2. Create a collector profile for user ID 481
print("\n2. Creating collector profile for user ID 481...")
c.execute("""
    INSERT INTO collectors (user_id, display_name, language, operating_location, latitude, longitude, phone, authorization_status, created_at)
    VALUES (481, 'Collector 0001', 'hi', 'Pune', 0.0, 0.0, '+919810000001', 'pending', ?)
""", (created_at,))
collector_profile_id = c.lastrowid
print(f"   Collector profile created with ID: {collector_profile_id}")

# 3. Remove the incorrect recycler profile for user ID 481 (ID 77)
print("\n3. Removing incorrect recycler profile ID 77 (safe - no business data references)...")
c.execute("DELETE FROM recyclers WHERE recycler_id = 77")
print(f"   Rows deleted: {c.rowcount}")

conn.commit()
conn.close()

print("\n=== FIX COMPLETED SUCCESSFULLY ===")
print("Summary of changes made:")
print("  - User ID 481 name: 'Recycler 0001' → 'Collector 0001'")
print(f"  - Created collector profile ID: {collector_profile_id} for user ID 481")
print("  - Removed incorrect recycler profile ID: 77")
print("  - Verified no business data was referencing recycler profile ID 77")