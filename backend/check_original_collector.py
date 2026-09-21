import sqlite3
conn = sqlite3.connect('kabadiwala.db')
c = conn.cursor()
c.execute("SELECT id, phone, role, name FROM users WHERE id = 218")
rows = c.fetchall()
print('Original collector demo account (ID 218):')
for row in rows:
    print(row)
conn.close()