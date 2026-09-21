with open('app/routes/auth.py', 'r') as f:
    lines = f.readlines()

# Print lines 90 to 130 which should cover the verify_otp function
print("Lines 90-130 of app/routes/auth.py:")
for i in range(90, 130):
    if i < len(lines):
        print(f"{i+1:3d}: {lines[i].rstrip()}")