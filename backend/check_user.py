import sqlite3
conn = sqlite3.connect('kabadiwala.db')
c = conn.cursor()
c.execute("SELECT id, phone, role, name FROM users WHERE phone = '+919810000001'")
rows = c.fetchall()
print('User records:')
for row in rows:
    print(row)
conn.close()