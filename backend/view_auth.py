with open('C:/Users/Sam/OneDrive/Desktop/KuchKuchHotaHai/backend/app/routes/auth.py', 'r') as f:
    content = f.read()

# Find the verify_otp function
import re
match = re.search(r'@router\.post\(("/otp/verify", response_model=TokenOut\)\s*def verify_otp\(.*?\):(.*?)(?=@router\.|\Z)', content, re.DOTALL)
if match:
    print("Found verify_otp function:")
    print(match.group(0))
else:
    print("verify_otp function not found with regex")
    # Try a simpler approach
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if '@router.post("/otp/verify"' in line:
            print(f"Found @router.post at line {i+1}: {line}")
            # Print the next 30 lines
            for j in range(i, min(i+30, len(lines))):
                print(f"{j+1:3d}: {lines[j]}")
            break