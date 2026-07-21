import os
import re

ROOT_DIR = r"c:\Users\mddil\OneDrive\Pictures\OneDrive\Desktop\offline_lab_1"
OLD_NAMES = ["My Pathology Lab", "My Pathology LIS", "Pathology LIS"]

def scan_files():
    found_old_names = []
    broken_imports = []
    syntax_issues = []
    center_issues = []

    for root, dirs, files in os.walk(ROOT_DIR):
        # Skip certain directories
        if any(skip in root for skip in ['node_modules', '.next', 'dist', 'pathology-lis', '.git', 'scratch']):
            continue
            
        for file in files:
            if not file.endswith(('.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html')):
                continue
                
            filepath = os.path.join(root, file)
            rel_path = os.path.relpath(filepath, ROOT_DIR)
            
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                    lines = content.splitlines()
                    
                # 1. Search for old names
                for name in OLD_NAMES:
                    if name.lower() in content.lower():
                        # Find line numbers
                        for idx, line in enumerate(lines):
                            if name.lower() in line.lower():
                                found_old_names.append({
                                    'file': rel_path,
                                    'line': idx + 1,
                                    'content': line.strip(),
                                    'match': name
                                })
                                
                # 2. Check for common import issues or styling/centering bugs
                for idx, line in enumerate(lines):
                    # Check for centering/flex wrapper issue (e.g. justify-center without flex, or items-center without flex)
                    if 'items-center' in line or 'justify-center' in line:
                        if 'flex' not in line and 'grid' not in line and 'inline-flex' not in line:
                            # Might be a potential centering issue if it is intended to center
                            center_issues.append({
                                'file': rel_path,
                                'line': idx + 1,
                                'content': line.strip(),
                                'reason': "centering class (items-center/justify-center) used without flex/grid/inline-flex on the same line"
                            })
                            
                    # Check for broken import style paths
                    if 'import' in line and ('../' in line or '@/' in line):
                        # Simple check for @/ paths or nested relative imports
                        pass
                        
            except Exception as e:
                print(f"Error reading {rel_path}: {e}")

    print("=== OLD NAMES FOUND ===")
    for item in found_old_names:
        print(f"{item['file']}:{item['line']}: Found '{item['match']}' -> {item['content']}")

    print("\n=== POTENTIAL CENTERING/FLEX ISSUES ===")
    for item in center_issues:
        print(f"{item['file']}:{item['line']}: {item['reason']} -> {item['content']}")

if __name__ == "__main__":
    scan_files()
