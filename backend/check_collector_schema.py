import sqlite3
conn = sqlite3.connect('kabadiwala.db')
c = conn.cursor()
c.execute("PRAGMA table_info(collectors)")
rows = c.fetchall()
print('Collectors table columns:')
for row in rows:
    print(row)
conn.close()