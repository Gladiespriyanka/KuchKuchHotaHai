#!/usr/bin/env python3
# This script will read the auth.py file and extract the verify_otp function
with open('C:/Users/Sam/OneDrive/Desktop/KuchKuchHotaHai/backend/app/routes/auth.py', 'r') as f:
    lines = f.readlines()

# Find the verify_otp function
start_line = None
for i, line in enumerate(lines):
    if '@router.post("/otp/verify", response_model=TokenOut)' in line:
        start_line = i
        break

if start_line is not None:
    # Print from the start of the function to a reasonable end
    for i in range(start_line, min(start_line + 50, len(lines))):
        print(f"{i+1:3d}: {lines[i].rstrip()}")
else:
    print("verify_otp function not found")