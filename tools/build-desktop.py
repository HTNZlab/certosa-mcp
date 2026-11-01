"""Build desktop bundles from a reviewed public tree and locked dependencies.
No downloads, global installation, runtime/config copies or private archives.
"""
from pathlib import Path
import argparse,json,hashlib,shutil,subprocess,zipfile,os

p=argparse.ArgumentParser()
p.add_argument('--source',required=True)
p.add_argument('--dependencies',required=True)
p.add_argument('--out',required=True)
p.add_argument('--mcpb-cli',required=True)
p.add_argument('--project',required=True)
a=p.parse_args()
source=Path(a.source).resolve();deps=Path(a.dependencies).resolve();out=Path(a.out).resolve()
project=Path(a.project).resolve(strict=True)
if not all(value.is_relative_to(project) for value in [source,deps,out.parent.resolve(strict=True)]):raise SystemExit('PROJECT_PATH_REQUIRED')
# The caller chooses a project output. Existing bundles/staging are preserved.
if out.exists():raise SystemExit('EXISTING_OUTPUT_PRESERVED')
parent=out.parent.resolve(strict=True)
if parent.drive.lower()!=source.drive.lower():raise SystemExit('PROJECT_DISK_REQUIRED')
out.mkdir();stage=out/'desktop';stage.mkdir()
package=json.loads((source/'package.json').read_text(encoding='utf-8'))
if package['name']!='certosa-mcp':raise SystemExit('REVIEWED_PUBLIC_SOURCE_REQUIRED')
version=package['version'];manifest=[]
def copy(src,target,base):
    if not src.resolve().is_relative_to(base):raise SystemExit('DEPENDENCY_LINK_OUTSIDE_TREE')
    if target.exists():raise SystemExit('DUPLICATE_PACKAGE_FILE')
    target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,target)
    manifest.append({'path':target.relative_to(stage).as_posix(),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
for folder in ['src','skills','assets']:
    for f in sorted((source/folder).rglob('*')):
        if f.is_file() and (f.suffix in ['.mjs','.ps1','.md','.yaml','.png']):copy(f,stage/f.relative_to(source),source)
for name in ['package.json','tools.json','secret-tools.json','LICENSE','README.md','README.it.md','DISTRIBUTION.md','CHANGELOG.md','LIVE-LAB.md','INSTALL.md','INSTALL.it.md']:
    copy(source/name,stage/name,source)
lock=json.loads((source/'package-lock.json').read_text(encoding='utf-8'))
installed=json.loads((deps/'.package-lock.json').read_text(encoding='utf-8'))
for name,info in lock['packages'].items():
    if not name:continue
    actual=installed['packages'].get(name)
    if not actual or actual.get('version')!=info.get('version') or actual.get('integrity')!=info.get('integrity'):raise SystemExit('LOCKED_DEPENDENCIES_REQUIRED')
for f in sorted(deps.rglob('*')):
    if f.is_file() and '.bin' not in f.relative_to(deps).parts and f.name!='.package-lock.json':copy(f,stage/'node_modules'/f.relative_to(deps),deps)
runtime='${user_config.project}/.certosa-connectors/'+version
mcpb={'manifest_version':'0.3','name':'certosa-archives','display_name':'Certosa Archives','version':version,'description':'Unlock Certosa archives locally, search and edit notebooks, validate and save app-compatible encrypted copies.','author':{'name':'HTNZlab','url':'https://github.com/HTNZlab'},'license':'MIT','homepage':'https://github.com/HTNZlab/certosa-mcp','server':{'type':'node','entry_point':'src/desktop-entry.mjs','mcp_config':{'command':'node','args':['${__dirname}/src/desktop-entry.mjs','${user_config.project}'],'env':{'TEMP':runtime+'/.tmp','TMP':runtime+'/.tmp','TMPDIR':runtime+'/.tmp','NODE_DISABLE_COMPILE_CACHE':'1'}}},'compatibility':{'platforms':['win32'],'runtimes':{'node':'>=22.13'}},'user_config':{'project':{'type':'directory','title':'Archive working folder','description':'Choose the approved local project folder for encrypted archives, backups, temporary files and connector runtime. The archive password is requested only in a separate native window.','required':True}},'tools_generated':True,'prompts_generated':True,'keywords':['certosa','notebooks','encrypted-archives','local-first']}
mcpb['icon']='assets/certosa.png'
(stage/'manifest.json').write_bytes((json.dumps(mcpb,indent=2)+'\n').encode())
(stage/'BUNDLE-MANIFEST.json').write_bytes((json.dumps({'version':version,'dependenciesLocked':True,'files':manifest},indent=2)+'\n').encode())
env=os.environ.copy()
subprocess.run(['node',a.mcpb_cli,'validate',str(stage/'manifest.json')],env=env,check=True)
subprocess.run(['node',a.mcpb_cli,'pack',str(stage),str(out/f'certosa-archives-{version}-windows.mcpb')],env=env,check=True)
portable=out/f'certosa-archives-{version}-windows-portable.zip'
with zipfile.ZipFile(portable,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for f in sorted(stage.rglob('*')):
        if f.is_file():z.write(f,f.relative_to(stage).as_posix())
assets=[out/f'certosa-archives-{version}-windows.mcpb',portable]
(out/'SHA256SUMS').write_bytes(''.join(hashlib.sha256(f.read_bytes()).hexdigest()+'  '+f.name+'\n' for f in assets).encode())
print('Desktop bundles built with locked dependencies. No client installed; no archive included.')
