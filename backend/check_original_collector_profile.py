import sqlite3
conn = sqlite3.connect('kabadiwala.db')
c = conn.cursor()
c.execute("SELECT collector_id, user_id, display_name, operating_location FROM collectors WHERE user_id = 218")
rows = c.fetchall()
print('Collector profile for original collector demo account (user_id 218):')
for row in rows:
    print(row)
conn.close()