with open('app/dashboard/inventory/page.tsx', 'r') as f:
    text = f.read()

import re
text = re.sub(r'".*?"|\'.*?\'|`.*?`|/\*.*?\*/|//.*', '', text)

opens = text.count('{')
closes = text.count('}')
print(f"Braces: {opens} vs {closes}")

p_opens = text.count('(')
p_closes = text.count(')')
print(f"Parens: {p_opens} vs {p_closes}")
