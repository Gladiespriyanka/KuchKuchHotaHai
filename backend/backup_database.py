import sqlite3
import os
import shutil
from datetime import datetime

# Backup the database
timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
backup_file = f"kabadiwala.db.backup_{timestamp}"
print(f"Backing up database to {backup_file}...")
shutil.copy2('kabadiwala.db', backup_file)
print("Backup completed successfully!")