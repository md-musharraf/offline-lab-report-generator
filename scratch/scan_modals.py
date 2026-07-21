import os

ROOT_DIR = r"c:\Users\mddil\OneDrive\Pictures\OneDrive\Desktop\offline_lab_1"

def scan_modals():
    for root, dirs, files in os.walk(ROOT_DIR):
        if any(skip in root for skip in ['node_modules', '.next', 'dist', '.git', 'scratch']):
            continue
            
        for file in files:
            if not file.endswith(('.tsx', '.ts')):
                continue
            filepath = os.path.join(root, file)
            rel = os.path.relpath(filepath, ROOT_DIR)
            
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                if 'fixed inset-0' in content:
                    lines = content.splitlines()
                    for idx, line in enumerate(lines):
                        if 'fixed inset-0' in line:
                            # Print surrounding context (3 lines before and after)
                            start = max(0, idx - 2)
                            end = min(len(lines), idx + 4)
                            print(f"=== {rel}:{idx+1} ===")
                            for j in range(start, end):
                                prefix = "--> " if j == idx else "    "
                                print(f"{j+1:4d}: {prefix}{lines[j]}")
                            print()
            except Exception as e:
                pass

if __name__ == "__main__":
    scan_modals()
