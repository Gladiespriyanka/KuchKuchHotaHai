import sqlite3
conn = sqlite3.connect('kabadiwala.db')
c = conn.cursor()
c.execute("SELECT recycler_id, user_id, name FROM recyclers WHERE user_id = 481")
rows = c.fetchall()
print('Recycler profile for user_id 481:')
for row in rows:
    print(row)
conn.close()