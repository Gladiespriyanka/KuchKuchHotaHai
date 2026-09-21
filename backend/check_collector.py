import sqlite3
conn = sqlite3.connect('kabadiwala.db')
c = conn.cursor()
c.execute("SELECT collector_id, user_id, display_name, language FROM collectors WHERE user_id = 481")
rows = c.fetchall()
print('Collector profile for user_id 481:')
for row in rows:
    print(row)
conn.close()