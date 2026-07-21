import os

ROOT_DIR = r"c:\Users\mddil\OneDrive\Pictures\OneDrive\Desktop\offline_lab_1"

def scan_offline_lab():
    matches = []
    for root, dirs, files in os.walk(ROOT_DIR):
        if any(skip in root for skip in ['node_modules', '.next', 'dist', '.git', 'scratch']):
            continue
            
        for file in files:
            if not file.endswith(('.tsx', '.ts', '.css', '.js', '.json', '.html')):
                continue
            filepath = os.path.join(root, file)
            rel = os.path.relpath(filepath, ROOT_DIR)
            
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                if 'offline lab' in content.lower():
                    # find lines
                    lines = content.splitlines()
                    for idx, line in enumerate(lines):
                        if 'offline lab' in line.lower():
                            matches.append(f"{rel}:{idx+1}: {line.strip()}")
            except Exception as e:
                pass
                
    print("=== OCCURRENCES OF 'Offline Lab' ===")
    for m in matches:
        print(m)

if __name__ == "__main__":
    scan_offline_lab()
