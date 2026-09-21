import sqlite3
conn = sqlite3.connect('kabadiwala.db')
c = conn.cursor()
c.execute("SELECT id, phone, role, name FROM users WHERE phone = '+919829010001'")
rows = c.fetchall()
print('Recycler demo account:')
for row in rows:
    print(row)
conn.close()