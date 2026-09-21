import os
print(f"Current directory: {os.getcwd()}")
print(f"File exists: {os.path.exists('app/routes/auth.py')}")
with open('app/routes/auth.py', 'r') as f:
    lines = f.readlines()
print(f"Number of lines: {len(lines)}")
if len(lines) > 100:
    print(f"Line 100: {lines[100].rstrip() if lines[100] else 'None'}")