"""Checks certificate20.txt (or the file given as the first argument, against the height given as the
second) with the verifier printed in Appendix G of the paper.

paper_verify.py is that verifier, copied verbatim. This script applies exactly two edits to its source
before running it, and prints them:
  1. the coordinate alphabet is extended past G (the first 17 symbols keep their values, so the
     paper's own 722 lines read exactly as before);
  2. the closing assertions about card 727 are replaced by assertions about the new final card.
Everything else, including the combination rule, is the paper's code.
"""
import hashlib
import sys
from pathlib import Path

here = Path(__file__).parent
source = (here / 'paper_verify.py').read_text()

OLD_SYMBOLS = "symbols = '0123456789ABCDEFG'"
alphabet = (here / 'symbols.mjs').read_text().split('`')[1]
assert alphabet.startswith('0123456789ABCDEFG') and len(set(alphabet)) == len(alphabet)
assert not any(c in alphabet for c in ' ():')
NEW_SYMBOLS = 'symbols = ' + repr(alphabet)
OLD_TAIL = source[source.index('    assert len(AA) == 728'):]
NEW_TAIL = '''    # Card 727 is still the paper's card ...
    assert len(TT[727]) == 251 and AA[727] == set() and HH[727] == 21
    # ... and the new final card needs nothing (its height is reported and checked below).
    assert AA[-1] == set()
    return len(AA) - 1, TT[-1], HH[-1]
'''
assert source.count(OLD_SYMBOLS) == 1 and source.endswith(OLD_TAIL)
patched = source.replace(OLD_SYMBOLS, NEW_SYMBOLS).replace(OLD_TAIL, NEW_TAIL)

print('Edit 1:', OLD_SYMBOLS, '->', NEW_SYMBOLS)
print('Edit 2: replaced the closing lines')
print('  ' + OLD_TAIL.strip().replace('\n', '\n  '))
print('with')
print('  ' + NEW_TAIL.strip().replace('\n', '\n  '))
print()

namespace = {}
exec(compile(patched, 'paper_verify (patched)', 'exec'), namespace)
path = Path(sys.argv[1]) if len(sys.argv) > 1 else here / 'certificate20.txt'
target = int(sys.argv[2]) if len(sys.argv) > 2 else 20
data = path.read_text()
original = data.split('\n728 ')[0] + '\n'
assert hashlib.sha256(original.encode()).hexdigest() == '3fa12d36a6d4dbb185e3f2808c8dfde13d85ee309afbca030d6ad17ae9fe3d04', \
    'the first 722 lines must be the paper certificate, byte for byte'
if not __debug__:
    sys.exit('Run without -O: the checks are assertions.')
last, envelope, height = namespace['verify'](data)
assert height == target, f'final card has height {height}, expected {target}'
xs = [x for x, _ in envelope]
ys = [y for _, y in envelope]
print(f'PASS: the paper certificate is unchanged; {last - 727} new cards; final card {last} needs nothing and has height {height}.')
print(f'Its envelope has {len(envelope)} cells within a {max(xs) - min(xs) + 1}x{max(ys) - min(ys) + 1} box.')
