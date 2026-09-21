import sqlite3
conn = sqlite3.connect('kabadiwala.db')
c = conn.cursor()

# 1. Update user ID 481 name from "Recycler 0001" to "Collector 0001"
print("Updating user ID 481 name...")
c.execute("UPDATE users SET name = 'Collector 0001' WHERE id = 481")
print(f"Rows updated: {c.rowcount}")

# 2. Create a collector profile for user ID 481
print("\nCreating collector profile for user ID 481...")
c.execute("""
    INSERT INTO collectors (user_id, display_name, language, operating_location, latitude, longitude, phone, authorization_status)
    VALUES (481, 'Collector 0001', 'hi', 'Pune', 0.0, 0.0, '+919810000001', 'pending')
""")
print(f"Collector profile created with ID: {c.lastrowid}")

conn.commit()
conn.close()
print("\nPartial fix completed (name update + collector profile creation)!")