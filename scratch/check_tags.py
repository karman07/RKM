import re

def parse_jsx(content):
    # Remove strings and comments
    content = re.sub(r'"{.*?}"|\'.*?\'||{/\*.*?\*/}', '', content)
    
    lines = content.split('\n')
    open_tags = []
    
    for i, line in enumerate(lines):
        # find all <tagName and </tagName>
        tags = re.findall(r'<([a-zA-Z0-9_]+)[\s>]|</([a-zA-Z0-9_]+)>', line)
        for t in tags:
            if t[0]: # opening
                if t[0] not in ['img', 'br', 'hr', 'input', 'link', 'meta', 'path', 'svg', 'circle']:
                    open_tags.append((t[0], i+1))
            elif t[1]: # closing
                if t[1] not in ['img', 'br', 'hr', 'input', 'link', 'meta', 'path', 'svg', 'circle']:
                    if open_tags and open_tags[-1][0] == t[1]:
                        open_tags.pop()
                    else:
                        print(f"Mismatched closing tag </{t[1]}> at line {i+1}. Expected closing for <{open_tags[-1][0]}> at line {open_tags[-1][1]}")
    
    if open_tags:
        for t in open_tags:
            print(f"Unclosed tag <{t[0]}> at line {t[1]}")

with open('app/dashboard/inventory/page.tsx', 'r') as f:
    parse_jsx(f.read())
