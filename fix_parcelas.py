with open(r'c:\Users\jotac\dyad-apps\jota-app-basico\src\components\contas-pagar\ParcelasTab.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start = None
end = None
for i, line in enumerate(lines):
    if i >= 600 and '<AlertDialog>' in line and 'Trigger' not in line and start is None:
        start = i
    if start is not None and '</AlertDialog>' in line and 'Trigger' not in line:
        end = i
        break

print(f"start={start+1}, end={end+1}")

indent = '                                                                '
new_lines = [
    indent + '<Button\n',
    indent + '    variant="ghost"\n',
    indent + '    size="icon"\n',
    indent + '    title="Estornar Pagamento"\n',
    indent + '    disabled={parcelaEstornando === p.id}\n',
    indent + '    onClick={() => handleUndoPayment(p)}\n',
    indent + '>\n',
    indent + '    {parcelaEstornando === p.id\n',
    indent + '        ? <Loader2 className="w-4 h-4 animate-spin" />\n',
    indent + '        : <Undo2 className="w-4 h-4 text-orange-500" />\n',
    indent + '    }\n',
    indent + '</Button>\n',
]

new_content = lines[:start] + new_lines + lines[end+1:]
with open(r'c:\Users\jotac\dyad-apps\jota-app-basico\src\components\contas-pagar\ParcelasTab.tsx', 'w', encoding='utf-8') as f:
    f.writelines(new_content)
print("DONE")
