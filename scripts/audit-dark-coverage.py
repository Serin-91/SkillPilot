# 다크모드 이식용 감사 스크립트.
# 모바일 이식 세션에 새로 생긴 클래스 중 "다크 색 지정이 필요한 것 / 레이아웃 전용"을 분류한다.
# 실행: 프로젝트 루트(미니프로젝트3)에서  python skillpilot/scripts/audit-dark-coverage.py
# 자세한 배경은 skillpilot/HANDOFF_NEXT_CLAUDE.md 4-8절 참고.

import re, io

mas = io.open('skillpilot/src/app/dashboard.css', encoding='utf-8').read()
lab = io.open('SkillPilot-darkmode-lab/src/app/dashboard.css', encoding='utf-8').read()

labcls = set(re.findall(r'\.([a-zA-Z][\w-]*)', lab))

# tag every line: is it inside a mobile @media block?
tagged = []
depth = 0
mob = None
for ln in mas.split('\n'):
    m = re.search(r'@media[^{]*', ln)
    if m and '{' in ln and 'max-width' in m.group(0) and mob is None:
        mob = depth
    tagged.append((ln, mob is not None))
    depth += ln.count('{') - ln.count('}')
    if mob is not None and depth <= mob:
        mob = None

# classes appearing as selectors inside mobile blocks
mobile_sel = set()
for ln, inmob in tagged:
    if inmob and '{' in ln and not ln.strip().startswith('@'):
        for c in re.findall(r'\.([a-zA-Z][\w-]*)', ln.split('{')[0]):
            mobile_sel.add(c)
new = sorted(c for c in mobile_sel - labcls if re.fullmatch(r'[a-zA-Z][\w-]*', c))

# collect rules: (selector, body, inside_mobile)
rules = []
i = 0
n = len(tagged)
while i < n:
    ln, inmob = tagged[i]
    s = ln.strip()
    if '{' in ln and not s.startswith('@') and not s.startswith('/*'):
        sel = ln.split('{')[0]
        body = ln.split('{', 1)[1]
        j = i
        while '}' not in body and j + 1 < n:
            j += 1
            body += '\n' + tagged[j][0]
        rules.append((sel, body, inmob))
        i = j + 1
    else:
        i += 1

COLOR = re.compile(r'(?:^|[;{\s])(background|background-color|background-image|color|border|border-color|border-top|border-bottom|box-shadow|backdrop-filter|fill|stroke)\s*:')

need, nocolor = [], []
for c in new:
    hits = [r for r in rules if re.search(r'\.' + re.escape(c) + r'(?![\w-])', r[0])]
    col = [h for h in hits if COLOR.search(h[1])]
    if col:
        need.append((c, len(col), any(not h[2] for h in col)))
    else:
        nocolor.append(c)

print('모바일 시대 신규 클래스 총:', len(new))
print('  색/배경/보더 선언이 있어 다크 규칙이 필요:', len(need))
print('  레이아웃(크기·위치·정렬)만 → 다크 규칙 불필요:', len(nocolor))
onlymob = [c for c, k, o in need if not o]
print()
print('  색 정의가 모바일 @media 안에만 있는 것:', len(onlymob))
print('   ->', onlymob)
print()
print('  색 정의가 @media 밖에도 있는 것(다크도 밖에 쓰면 전 폭 커버):', len(need) - len(onlymob))
print()
print('다크 불필요(레이아웃 전용) 목록:')
print(' ', nocolor)
