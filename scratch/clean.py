import re
with open('app/dashboard/inventory/page.tsx', 'r') as f:
    lines = f.readlines()

depth = 0
for i, line in enumerate(lines):
    # Extremely naïve JSX stripping
    clean = re.sub(r'".*?"|\'.*?\'|{.*?}', '', line)
    # Ignore comments
    if '//' in clean: clean = clean[:clean.index('//')]
    
    opens = clean.count('<div')
    closes = clean.count('</div')
    
    # Self-closing div logic
    # Find all <div ... />
    self_closing = len(re.findall(r'<div[^>]*/>', line))
    opens -= self_closing
    
    depth += opens - closes
    if opens != closes:
        # print(f"Line {i+1}: +{opens} -{closes} -> depth {depth} | {line.strip()}")
        pass
        
print(f"Final depth: {depth}")
