import sqlite3
conn = sqlite3.connect('kabadiwala.db')
c = conn.cursor()

# Check what value to use for created_at
c.execute("SELECT created_at FROM collectors LIMIT 1")
row = c.fetchone()
if row:
    print(f"Sample created_at value: {row[0]}")
else:
    print("No collector records found")

# Check current timestamp
import datetime
now = datetime.datetime.now()
print(f"Current timestamp: {now}")

conn.close()