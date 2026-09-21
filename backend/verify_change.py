# Simple test to verify the file can be read and func import is present
try:
    with open('app/routes/auth.py', 'r') as f:
        lines = f.readlines()

    # Check if func import is present
    func_import_found = any('from sqlalchemy import func' in line for line in lines)
    print(f"Func import found: {func_import_found}")

    # Look for the verify_otp function and check the lookup line
    for i, line in enumerate(lines):
        if 'existing_user = db.query(User).filter(' in line:
            print(f"Found lookup line at line {i+1}: {line.strip()}")
            # Show the next few lines to see the full expression
            for j in range(i, min(i+5, len(lines))):
                print(f"  {j+1:3d}: {lines[j].rstrip()}")
            break

except Exception as e:
    print(f"Error reading file: {e}")