import sqlite3
conn = sqlite3.connect('kabadiwala.db')
c = conn.cursor()
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
rows = c.fetchall()
print('Tables:')
for row in rows:
    print(row)
conn.close()