from pathlib import Path
import shutil
root=Path(r'D:\高效管理\提交材料').resolve()
targets=[root/'.项目概要介绍-验收图',root/'.项目概要介绍-验收图-A4',root/'项目概要介绍-版式验收.pdf']
for target in targets:
    resolved=target.resolve()
    if root not in resolved.parents:
        raise RuntimeError(f'out of bounds: {resolved}')
    if resolved.is_dir():
        shutil.rmtree(resolved)
        print(f'REMOVED_DIR={resolved}')
    elif resolved.is_file():
        resolved.unlink()
        print(f'REMOVED_FILE={resolved}')
for p in sorted(root.iterdir()):
    print(p.name.encode('unicode_escape').decode('ascii'), p.stat().st_size if p.is_file() else '<DIR>')
