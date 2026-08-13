import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  chmodSync,
  constants,
  cpSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  readSync,
  realpathSync,
  renameSync,
  rmdirSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { userInfo } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROFILE = 'warpkeep-greater-realm-production-bootstrap-v1';
const CANONICAL_ORIGIN_URL = 'https://github.com/ael-dev3/Warpkeep.git';
const CANONICAL_NPM_REGISTRY = 'https://registry.npmjs.org/';
const BOOTSTRAP_PATH = 'scripts/greater-realm-production-bootstrap.mjs';
const COMMIT = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const SHA512_INTEGRITY = /^sha512-([A-Za-z0-9+/]{86}==)$/u;
const SAFE_COMMAND_ARGUMENT = /^[\u0020-\u007e]{1,4096}$/u;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
const VERSION = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:[-+][0-9A-Za-z.-]+)?$/u;
const MAXIMUM_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAXIMUM_SECRET_BYTES = 514;
const EXPECTED_NODE_VERSION = 'v24.14.0';
const EXPECTED_NODE_SHA256 = '90e41658177a192c8c23940e58d8252544e5b40cbaef7bd52a3c3c54caf9dd91';
const EXPECTED_NPM_VERSION = '11.9.0';
const EXPECTED_NPM_TREE_SHA256 = 'bff72d9fd50e307b21344db40e0a6e5d680d1831a7fabbe3365d1f8b04dc0aab';
const EXPECTED_NPM_TREE_ENTRIES = 2_223;
const EXPECTED_NODE_TEAM = '2DC432GLL2';
const EXPECTED_PLATFORM = 'darwin';
const EXPECTED_ARCH = 'arm64';
const EXPECTED_MODULE_PACKAGE_COUNT = 16;
const HERMES_SOURCE_PARSER_RESOLVER = Object.freeze({
  typescript: Object.freeze({
    relativeTarget: '../../../node_modules/typescript',
    version: '7.0.2',
  }),
  yaml: Object.freeze({
    relativeTarget: '../../../node_modules/yaml',
    version: '2.9.0',
  }),
});
const HERMES_SOURCE_PARSER_IGNORED_PATHS = Object.freeze(
  ['node_modules/', 'services/auth-bridge/node_modules/'],
);
const HERMES_SOURCE_PARSER_TREE_MAXIMUM_ENTRIES = 2_048;
const HERMES_SOURCE_PARSER_TREE_MAXIMUM_BYTES = 32 * 1024 * 1024;
const HERMES_SOURCE_PARSER_PRODUCTION_NATIVE_PACKAGE =
  '@typescript/typescript-darwin-arm64';
// This pre-checkout bootstrap cannot import repository TypeScript. Keep this
// release-packet bound in lockstep with
// WARPKEEP_ENTRY_AGREEMENT_ACCEPTANCE_RECORDS_PER_FID_MAXIMUM.
const MAXIMUM_ENTRY_AGREEMENT_ACCEPTANCE_ROWS_PER_PLAYER = 5;
const POSITIVE_FID = /^[1-9][0-9]{0,15}$/u;
const CANONICAL_NONNEGATIVE_INTEGER = /^(?:0|[1-9][0-9]*)$/u;
const HERMES_NOTE = /^[^\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]{1,512}$/u;
const NOTIFICATION_PLAN_FILENAME =
  /^admission-notification-recovery-plan-[0-9]{8}T[0-9]{9}Z-[0-9a-f]{32}\.json$/u;
const LAUNCH_RUN_ID = /^run-[0-9a-f]{32}$/u;
const LAUNCH_LIFECYCLE_PROFILE = 'warpkeep-greater-realm-production-launch-lifecycle-v1';
const LAUNCH_LIFECYCLE_PHASES = Object.freeze([
  'allocated',
  'launch-installing',
  'launch-installed',
  'containment-prepared',
  'operator-contained',
  'cleanup-prepared',
  'tree-removing',
  'run-removed',
  'complete',
]);
const LAUNCH_LIFECYCLE_RECORD =
  /^(run-[0-9a-f]{32})-([0-9]{8})-(allocated|launch-installing|launch-installed|containment-prepared|operator-contained|cleanup-prepared|tree-removing|run-removed|complete)\.json$/u;
const LAUNCH_LIFECYCLE_TEMPORARY =
  /^\.(run-[0-9a-f]{32})-([0-9]{8})-(allocated|launch-installing|launch-installed|containment-prepared|operator-contained|cleanup-prepared|tree-removing|run-removed|complete)\.json-([1-9][0-9]*)-([0-9a-f]{64})-([0-9a-f]{64})\.tmp$/u;
const DECIMAL_IDENTITY = /^(?:0|[1-9][0-9]*)$/u;
const SAFE_LAUNCH_COMMAND = /^[a-z][a-z0-9-]{0,79}$/u;
const LAUNCH_TERMINAL_PROFILE = 'warpkeep-greater-realm-production-launch-terminal-v1';
const LAUNCH_TERMINAL_RECORD = /^(run-[0-9a-f]{32})-terminal\.json$/u;
const LAUNCH_TERMINAL_TEMPORARY =
  /^\.(run-[0-9a-f]{32})-terminal\.json-([0-9a-f]{64})\.tmp$/u;
const LAUNCH_LIFECYCLE_LOCK = /^(run-[0-9a-f]{32})-lifecycle\.lock$/u;
const BOOTSTRAP_RUN_TREE_HELPER = String.raw`
import hashlib,json,os,re,signal,stat,sys
MAX_ENTRIES=500000
MAX_DEPTH=128
MAX_BYTES=68719476736
RETENTION_KEYS=("schemaVersion","profile","materializationRoot","artifactPath","artifactDigest","moduleSourceCommit","moduleTreeId","dependencyClosureDigest","materializationDev","materializationIno","artifactDev","artifactIno","artifactMode","artifactUid","artifactNlink","artifactSize","artifactMtimeNs","artifactCtimeNs")
signal.signal(signal.SIGINT,signal.SIG_IGN)
signal.signal(signal.SIGTERM,signal.SIG_IGN)
def fail(): raise RuntimeError("GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_TREE_INVALID")
def canonical(value): return (json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=False)+"\n").encode()
def exact_root(path):
    item=os.lstat(path)
    if not stat.S_ISDIR(item.st_mode) or stat.S_ISLNK(item.st_mode) or item.st_uid != os.getuid() or stat.S_IMODE(item.st_mode) != 0o700 or os.path.realpath(path) != path: fail()
    return item
def exact_file(path,allow_links=(1,)):
    item=os.lstat(path)
    if not stat.S_ISREG(item.st_mode) or stat.S_ISLNK(item.st_mode) or item.st_uid != os.getuid() or stat.S_IMODE(item.st_mode) != 0o600 or item.st_nlink not in allow_links or item.st_size < 1 or item.st_size > 32768: fail()
    fd=os.open(path,os.O_RDONLY|getattr(os,"O_NOFOLLOW",0))
    try:
        opened=os.fstat(fd); value=b""
        while len(value) < opened.st_size:
            part=os.read(fd,opened.st_size-len(value))
            if not part: fail()
            value+=part
        after=os.fstat(fd)
        if (after.st_dev,after.st_ino,after.st_mode,after.st_nlink,after.st_size,after.st_mtime_ns,after.st_ctime_ns) != (opened.st_dev,opened.st_ino,opened.st_mode,opened.st_nlink,opened.st_size,opened.st_mtime_ns,opened.st_ctime_ns): fail()
        return value
    finally: os.close(fd)
def blockers(admin):
    result=[]
    receipts=os.path.join(admin,"greater-realm-cutover-receipts")
    if os.path.lexists(receipts):
        exact_root(receipts)
        if any(name.startswith(".greater-realm-cutover-") for name in os.listdir(receipts)): result.append("active-cutover-wal-or-lock")
    materializations=os.path.join(admin,"immutable-publish-materializations")
    if os.path.lexists(materializations):
        exact_root(materializations); names=os.listdir(materializations); complete={}; linked_complete=set(); invalid=False
        for name in names:
            match=re.fullmatch(r"\.greater-realm-immutable-cleanup-([0-9a-f]{64})\.json",name)
            if match is None: continue
            try:
                path=os.path.join(materializations,name); raw=json.loads(exact_file(path,(1,2)).decode("utf-8")); final_st=os.lstat(path)
                record=raw.get("record") if isinstance(raw,dict) else None
                if list(raw) != ["schemaVersion","profile","retentionDigest","phase","record"] or raw["schemaVersion"] != 1 or raw["profile"] != "warpkeep-greater-realm-immutable-artifact-cleanup-v1" or raw["retentionDigest"] != match.group(1) or raw["phase"] != "complete" or not isinstance(record,dict) or list(record) != list(RETENTION_KEYS): fail()
                root=record["materializationRoot"]
                digest=hashlib.sha256(b"warpkeep-greater-realm-immutable-artifact-retention-v1\0"+json.dumps(record,separators=(",",":"),ensure_ascii=False).encode()).hexdigest()
                decimal=lambda value:isinstance(value,str) and re.fullmatch(r"(?:0|[1-9][0-9]*)",value) is not None
                if digest != match.group(1) or record["schemaVersion"] != 1 or record["profile"] != "warpkeep-greater-realm-immutable-artifact-v1" or not isinstance(root,str) or os.path.realpath(root) != root or os.path.dirname(root) != materializations or re.fullmatch(r"[0-9a-f]{32}",os.path.basename(root)) is None or os.path.lexists(root) or record["artifactPath"] != os.path.join(root,"spacetimedb","dist","bundle.js") or re.fullmatch(r"[0-9a-f]{64}",record["artifactDigest"] or "") is None or re.fullmatch(r"[0-9a-f]{40}",record["moduleSourceCommit"] or "") is None or re.fullmatch(r"[0-9a-f]{40}",record["moduleTreeId"] or "") is None or re.fullmatch(r"[0-9a-f]{64}",record["dependencyClosureDigest"] or "") is None or not all(decimal(record[key]) for key in ("materializationDev","materializationIno","artifactDev","artifactIno","artifactUid","artifactSize","artifactMtimeNs","artifactCtimeNs")) or record["artifactMode"] != "600" or record["artifactNlink"] != "1": fail()
                complete[match.group(1)]=(root,final_st)
            except Exception: invalid=True; break
        if not invalid:
            for name in names:
                final=re.fullmatch(r"\.greater-realm-immutable-cleanup-([0-9a-f]{64})\.json",name)
                temporary=re.fullmatch(r"\.greater-realm-immutable-cleanup-([0-9a-f]{64})-[0-9a-f]{32}\.tmp",name)
                if final: continue
                if temporary and temporary.group(1) in complete:
                    item=os.lstat(os.path.join(materializations,name))
                    final_st=complete[temporary.group(1)][1]
                    exact=stat.S_ISREG(item.st_mode) and not stat.S_ISLNK(item.st_mode) and item.st_uid == os.getuid() and stat.S_IMODE(item.st_mode) == 0o600 and item.st_nlink in (1,2) and item.st_size <= 32768
                    linked=item.st_nlink == 2 and final_st.st_nlink == 2 and (item.st_dev,item.st_ino) == (final_st.st_dev,final_st.st_ino)
                    if exact and (item.st_nlink == 1 or linked):
                        if linked: linked_complete.add(temporary.group(1))
                        continue
                invalid=True; break
        if not invalid and any(st.st_nlink == 2 and digest not in linked_complete for digest,(_,st) in complete.items()): invalid=True
        if invalid: result.append("active-immutable-materialization")
    supervisors=os.path.join(admin,"greater-realm-publish-supervisors-v1")
    if os.path.lexists(supervisors):
        exact_root(supervisors)
        if os.listdir(supervisors): result.append("active-publish-supervisor")
    return result
def inventory(path):
    if not os.path.lexists(path):
        value={"state":"absent","entryCount":0,"byteCount":0,"entries":[]}
        return {"state":"absent","entryCount":0,"byteCount":0,"digest":hashlib.sha256(canonical(value)).hexdigest()}
    root=exact_root(path); entries=[]; byte_count=0
    root_fd=os.open(path,os.O_RDONLY|getattr(os,"O_DIRECTORY",0)|getattr(os,"O_NOFOLLOW",0))
    opened_root=os.fstat(root_fd)
    if (opened_root.st_dev,opened_root.st_ino,opened_root.st_mode,opened_root.st_uid) != (root.st_dev,root.st_ino,root.st_mode,root.st_uid): os.close(root_fd); fail()
    def walk(directory_fd,relative,depth):
        nonlocal byte_count
        if depth > MAX_DEPTH: fail()
        for name in sorted(os.listdir(directory_fd)):
            if name in (".","..") or "/" in name or "\x00" in name: fail()
            shown=name if not relative else relative+"/"+name; item=os.stat(name,dir_fd=directory_fd,follow_symlinks=False)
            if item.st_uid != os.getuid(): fail()
            common={"path":shown,"mode":stat.S_IMODE(item.st_mode),"dev":str(item.st_dev),"ino":str(item.st_ino),"nlink":item.st_nlink,"size":item.st_size,"mtimeNs":item.st_mtime_ns,"ctimeNs":item.st_ctime_ns}
            if stat.S_ISDIR(item.st_mode) and not stat.S_ISLNK(item.st_mode):
                if stat.S_IMODE(item.st_mode) != 0o700: fail()
                child_fd=os.open(name,os.O_RDONLY|getattr(os,"O_DIRECTORY",0)|getattr(os,"O_NOFOLLOW",0),dir_fd=directory_fd)
                try:
                    child=os.fstat(child_fd)
                    if (child.st_dev,child.st_ino,child.st_mode,child.st_uid) != (item.st_dev,item.st_ino,item.st_mode,item.st_uid): fail()
                    entries.append({**common,"kind":"directory"}); walk(child_fd,shown,depth+1)
                    after=os.fstat(child_fd); named=os.stat(name,dir_fd=directory_fd,follow_symlinks=False)
                    fields=lambda value:(value.st_dev,value.st_ino,value.st_mode,value.st_uid,value.st_nlink,value.st_size,value.st_mtime_ns,value.st_ctime_ns)
                    if fields(after) != fields(child) or (named.st_dev,named.st_ino) != (child.st_dev,child.st_ino): fail()
                finally: os.close(child_fd)
            elif stat.S_ISREG(item.st_mode) and not stat.S_ISLNK(item.st_mode):
                if stat.S_IMODE(item.st_mode) not in (0o400,0o500,0o600,0o644,0o700) or item.st_nlink != 1: fail()
                byte_count+=item.st_size; entries.append({**common,"kind":"file"})
            elif stat.S_ISLNK(item.st_mode):
                if item.st_nlink != 1: fail()
                entries.append({**common,"kind":"symlink","target":os.readlink(name,dir_fd=directory_fd)})
            else: fail()
            if len(entries) > MAX_ENTRIES or byte_count > MAX_BYTES: fail()
    try:
        walk(root_fd,"",0); after_root=os.fstat(root_fd)
        fields=lambda value:(value.st_dev,value.st_ino,value.st_mode,value.st_uid,value.st_nlink,value.st_size,value.st_mtime_ns,value.st_ctime_ns)
        if fields(after_root) != fields(opened_root): fail()
    finally: os.close(root_fd)
    current=os.lstat(path)
    if (current.st_dev,current.st_ino) != (root.st_dev,root.st_ino): fail()
    value={"state":"present","rootDev":str(root.st_dev),"rootIno":str(root.st_ino),"entryCount":len(entries),"byteCount":byte_count,"entries":entries}
    return {"state":"present","rootDev":str(root.st_dev),"rootIno":str(root.st_ino),"entryCount":len(entries),"byteCount":byte_count,"digest":hashlib.sha256(canonical(value)).hexdigest()}
def remove(path,expected_dev,expected_ino):
    root=exact_root(path)
    if (str(root.st_dev),str(root.st_ino)) != (expected_dev,expected_ino): fail()
    parent=os.path.dirname(path); name=os.path.basename(path)
    parent_fd=os.open(parent,os.O_RDONLY|getattr(os,"O_DIRECTORY",0)|getattr(os,"O_NOFOLLOW",0)); root_fd=None; count=0; byte_count=0
    try:
        root_fd=os.open(name,os.O_RDONLY|getattr(os,"O_DIRECTORY",0)|getattr(os,"O_NOFOLLOW",0),dir_fd=parent_fd)
        opened=os.fstat(root_fd)
        if (str(opened.st_dev),str(opened.st_ino)) != (expected_dev,expected_ino): fail()
        def walk(fd,depth,top):
            nonlocal count,byte_count
            if depth > MAX_DEPTH: fail()
            for child_name in sorted(os.listdir(fd),key=lambda value:(top and value == "launch-record.json",value)):
                item=os.stat(child_name,dir_fd=fd,follow_symlinks=False)
                if item.st_uid != os.getuid(): fail()
                count+=1
                if count > MAX_ENTRIES: fail()
                if stat.S_ISDIR(item.st_mode) and not stat.S_ISLNK(item.st_mode):
                    if stat.S_IMODE(item.st_mode) != 0o700: fail()
                    child_fd=os.open(child_name,os.O_RDONLY|getattr(os,"O_DIRECTORY",0)|getattr(os,"O_NOFOLLOW",0),dir_fd=fd)
                    try:
                        held=os.fstat(child_fd)
                        if (held.st_dev,held.st_ino,held.st_mode,held.st_uid) != (item.st_dev,item.st_ino,item.st_mode,item.st_uid): fail()
                        walk(child_fd,depth+1,False)
                    finally: os.close(child_fd)
                    after=os.stat(child_name,dir_fd=fd,follow_symlinks=False)
                    if (after.st_dev,after.st_ino) != (item.st_dev,item.st_ino): fail()
                    os.rmdir(child_name,dir_fd=fd); os.fsync(fd)
                elif stat.S_ISREG(item.st_mode) and not stat.S_ISLNK(item.st_mode):
                    if stat.S_IMODE(item.st_mode) not in (0o400,0o500,0o600,0o644,0o700) or item.st_nlink != 1: fail()
                    byte_count+=item.st_size
                    if byte_count > MAX_BYTES: fail()
                    os.unlink(child_name,dir_fd=fd); os.fsync(fd)
                elif stat.S_ISLNK(item.st_mode):
                    if item.st_nlink != 1: fail()
                    os.unlink(child_name,dir_fd=fd); os.fsync(fd)
                else: fail()
        walk(root_fd,0,True); os.close(root_fd); root_fd=None
        current=os.stat(name,dir_fd=parent_fd,follow_symlinks=False)
        if (str(current.st_dev),str(current.st_ino)) != (expected_dev,expected_ino): fail()
        os.rmdir(name,dir_fd=parent_fd); os.fsync(parent_fd)
    finally:
        if root_fd is not None: os.close(root_fd)
        os.close(parent_fd)
mode,path,*rest=sys.argv[1:]
if mode == "inventory" and not rest: print(json.dumps(inventory(path),sort_keys=True,separators=(",",":")))
elif mode == "delete" and len(rest) == 2: remove(path,rest[0],rest[1]); print('{"outcome":"removed"}')
elif mode == "blockers" and not rest: print(json.dumps({"blockers":blockers(path)},sort_keys=True,separators=(",",":")))
else: fail()
`;
const BOOTSTRAP_LIFECYCLE_LOCK_HELPER = String.raw`
import fcntl,json,os,signal,stat,sys
path,run_id=sys.argv[1:]
parent=os.path.dirname(path)
signal.signal(signal.SIGINT,signal.SIG_IGN)
signal.signal(signal.SIGTERM,signal.SIG_IGN)
fd=os.open(path,os.O_RDWR|os.O_CREAT|getattr(os,"O_NOFOLLOW",0),0o600)
try:
    item=os.fstat(fd)
    if not stat.S_ISREG(item.st_mode) or item.st_uid != os.getuid() or stat.S_IMODE(item.st_mode) != 0o600 or item.st_nlink != 1: raise RuntimeError()
    try: fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError: raise RuntimeError("GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_BUSY")
    current=os.lstat(path)
    if (current.st_dev,current.st_ino,current.st_nlink) != (item.st_dev,item.st_ino,1): raise RuntimeError("GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_LOCK_REPLACED")
    os.ftruncate(fd,0)
    body=(json.dumps({"schemaVersion":1,"profile":"warpkeep-greater-realm-production-launch-lock-v1","runId":run_id,"pid":os.getpid()},sort_keys=True,separators=(",",":"))+"\n").encode()
    offset=0
    while offset < len(body): offset+=os.write(fd,body[offset:])
    os.fsync(fd)
    parent_fd=os.open(parent,os.O_RDONLY|getattr(os,"O_DIRECTORY",0)|getattr(os,"O_NOFOLLOW",0)); os.fsync(parent_fd); os.close(parent_fd)
    print("READY",flush=True)
    sys.stdin.buffer.read(1)
    current=os.lstat(path)
    if (current.st_dev,current.st_ino,current.st_nlink) != (item.st_dev,item.st_ino,1): raise RuntimeError()
    os.unlink(path)
    parent_fd=os.open(parent,os.O_RDONLY|getattr(os,"O_DIRECTORY",0)|getattr(os,"O_NOFOLLOW",0)); os.fsync(parent_fd); os.close(parent_fd)
finally:
    fcntl.flock(fd,fcntl.LOCK_UN); os.close(fd)
`;

function validateHermesFidAndNote(arguments_) {
  if (
    arguments_.length !== 2 || !POSITIVE_FID.test(arguments_[0])
    || BigInt(arguments_[0]) > BigInt(Number.MAX_SAFE_INTEGER)
    || !HERMES_NOTE.test(arguments_[1]) || arguments_[1].trim() !== arguments_[1]
    || arguments_[1].startsWith('--')
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_COMMAND_ARGUMENTS_INVALID');
}

function foundedPublishExpectations(arguments_) {
  if (
    arguments_.length !== 5
    || !/^[a-z0-9][a-z0-9-]{2,79}$/u.test(arguments_[0])
    || arguments_.slice(1).some(value => !CANONICAL_NONNEGATIVE_INTEGER.test(value))
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_COMMAND_ARGUMENTS_INVALID');
  const [lane, founderRaw, enabledAllowedFidRaw, playerRaw, termsAcceptanceRaw] = arguments_;
  const founder = Number(founderRaw);
  const enabledAllowedFid = Number(enabledAllowedFidRaw);
  const player = Number(playerRaw);
  const termsAcceptance = Number(termsAcceptanceRaw);
  if (
    !Number.isSafeInteger(founder) || founder < 1 || founder > 100
    || !Number.isSafeInteger(enabledAllowedFid) || enabledAllowedFid > founder
    || !Number.isSafeInteger(player) || player > founder
    || !Number.isSafeInteger(termsAcceptance)
    || termsAcceptance > player * MAXIMUM_ENTRY_AGREEMENT_ACCEPTANCE_ROWS_PER_PLAYER
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_COMMAND_ARGUMENTS_INVALID');
  return Object.freeze({
    lane,
    environment: Object.freeze({
      WARPKEEP_EXPECTED_FOUNDER_COUNT: founderRaw,
      WARPKEEP_EXPECTED_ENABLED_ALLOWED_FID_COUNT: enabledAllowedFidRaw,
      WARPKEEP_EXPECTED_PLAYER_COUNT: playerRaw,
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: termsAcceptanceRaw,
    }),
  });
}

function recoveredPublishExpectations(arguments_) {
  if (arguments_.length !== 5 || !SHA256.test(arguments_[0])) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_COMMAND_ARGUMENTS_INVALID');
  }
  const expectations = foundedPublishExpectations(['recover', ...arguments_.slice(1)]);
  return Object.freeze({
    confirmationDigest: arguments_[0],
    environment: expectations.environment,
  });
}

const COMMANDS = Object.freeze({
  'import-inspect': Object.freeze({
    entrypoint: 'scripts/greater-realm-production-import-operator.ts',
    exactArguments: Object.freeze(['inspect']),
    privateInput: false,
    requiresAdminSecret: true,
  }),
  'import-apply': Object.freeze({
    entrypoint: 'scripts/greater-realm-production-import-operator.ts',
    exactArguments: Object.freeze(['apply', '--confirm']),
    privateInput: false,
    requiresAdminSecret: true,
  }),
  'import-recover-inspect': Object.freeze({
    entrypoint: 'scripts/greater-realm-production-import-operator.ts',
    exactArguments: Object.freeze(['recover-inspect']),
    privateInput: false,
    requiresAdminSecret: false,
  }),
  'import-recover': Object.freeze({
    entrypoint: 'scripts/greater-realm-production-import-operator.ts',
    validateArguments(arguments_) {
      if (arguments_.length !== 1 || !SHA256.test(arguments_[0])) {
        fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_COMMAND_ARGUMENTS_INVALID');
      }
      return Object.freeze(['recover', `--confirm-recovery=${arguments_[0]}`]);
    },
    privateInput: false,
    requiresAdminSecret: 'optional',
  }),
  publish: Object.freeze({
    entrypoint: 'scripts/greater-realm-production-publisher.ts',
    validateArguments(arguments_) {
      return Object.freeze([foundedPublishExpectations(arguments_).lane, '--confirm']);
    },
    privateInput: false,
    requiresAdminSecret: true,
    requiresSpacetimeExecutable: true,
    requiresSpacetimeCliConfig: true,
  }),
  'publish-recover-inspect': Object.freeze({
    entrypoint: 'scripts/greater-realm-production-publisher.ts',
    exactArguments: Object.freeze(['recover-inspect']),
    privateInput: false,
    requiresAdminSecret: false,
  }),
  'publish-recover': Object.freeze({
    entrypoint: 'scripts/greater-realm-production-publisher.ts',
    validateArguments(arguments_) {
      const recovered = recoveredPublishExpectations(arguments_);
      return Object.freeze([
        'recover',
        `--confirm-recovery=${recovered.confirmationDigest}`,
      ]);
    },
    privateInput: false,
    requiresAdminSecret: 'optional',
    requiresSpacetimeExecutable: 'optional',
    requiresSpacetimeCliConfig: 'optional',
    requiresCoupledPublishRecoveryAuthority: true,
  }),
  relocation: Object.freeze({
    entrypoint: 'scripts/greater-realm-production-relocation-operator.ts',
    validateArguments(arguments_) {
      const command = arguments_[0];
      const allowed = new Set([
        'inspect', 'prepare', 'begin-drain', 'freeze', 'plan', 'canary',
        'commit', 'halt', 'resume', 'rollback',
      ]);
      if (arguments_.length !== 1 || !allowed.has(command)) {
        fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_COMMAND_ARGUMENTS_INVALID');
      }
      return Object.freeze(command === 'inspect' ? [command] : [command, '--confirm']);
    },
    privateInput: false,
    requiresAdminSecret: true,
  }),
  'relocation-recover-inspect': Object.freeze({
    entrypoint: 'scripts/greater-realm-production-relocation-operator.ts',
    exactArguments: Object.freeze(['recover-inspect']),
    privateInput: false,
    requiresAdminSecret: false,
  }),
  'relocation-recover': Object.freeze({
    entrypoint: 'scripts/greater-realm-production-relocation-operator.ts',
    validateArguments(arguments_) {
      if (arguments_.length !== 1 || !SHA256.test(arguments_[0])) {
        fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_COMMAND_ARGUMENTS_INVALID');
      }
      return Object.freeze(['recover', `--confirm-recovery=${arguments_[0]}`]);
    },
    privateInput: false,
    requiresAdminSecret: 'optional',
  }),
  verify: Object.freeze({
    entrypoint: 'scripts/greater-realm-production-verifier.ts',
    validateArguments(arguments_) {
      if (
        arguments_.length !== 1
        || !/^(?:[1-9]|[1-9][0-9]|[1-5][0-9]{2}|600)$/u.test(arguments_[0])
      ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_COMMAND_ARGUMENTS_INVALID');
      return Object.freeze([`--expected-founder-count=${arguments_[0]}`]);
    },
    privateInput: false,
    requiresAdminSecret: true,
  }),
  'pages-active-evidence': Object.freeze({
    entrypoint: 'scripts/greater-realm-production-pages-evidence-operator.ts',
    validateArguments(arguments_) {
      if (
        arguments_.length !== 1
        || !/^(?:[1-9]|[1-9][0-9]|[1-5][0-9]{2}|600)$/u.test(arguments_[0])
      ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_COMMAND_ARGUMENTS_INVALID');
      return Object.freeze([`--expected-founder-count=${arguments_[0]}`]);
    },
    privateInput: false,
    requiresAdminSecret: true,
  }),
  'hermes-list-pending': Object.freeze({
    entrypoint: 'scripts/hermes-admin.ts',
    exactArguments: Object.freeze(['list-pending-access-requests']),
    privateInput: false,
    requiresAdminSecret: true,
    requiresNotificationSecret: false,
    hermesReleaseRow: 'list-pending',
  }),
  'hermes-admit-dry': Object.freeze({
    entrypoint: 'scripts/hermes-admin.ts',
    exactArguments: Object.freeze(['admit-founder', '--input-stdin', '--dry-run']),
    privateInput: 'required',
    requiresAdminSecret: false,
    requiresNotificationSecret: false,
    hermesReleaseRow: 'admit-dry',
  }),
  'hermes-admit-confirm': Object.freeze({
    entrypoint: 'scripts/hermes-admin.ts',
    exactArguments: Object.freeze(['admit-founder', '--input-stdin', '--confirm']),
    privateInput: 'required',
    requiresAdminSecret: true,
    requiresNotificationSecret: true,
    hermesReleaseRow: 'admit-confirm',
  }),
  'hermes-allow-dry': Object.freeze({
    entrypoint: 'scripts/hermes-admin.ts',
    validateArguments(arguments_) {
      validateHermesFidAndNote(arguments_);
      return Object.freeze(['allow-fid', ...arguments_, '--dry-run']);
    },
    privateInput: false,
    requiresAdminSecret: false,
    requiresNotificationSecret: false,
    hermesReleaseRow: 'allow-dry',
  }),
  'hermes-allow-confirm': Object.freeze({
    entrypoint: 'scripts/hermes-admin.ts',
    validateArguments(arguments_) {
      validateHermesFidAndNote(arguments_);
      return Object.freeze(['allow-fid', ...arguments_, '--confirm']);
    },
    privateInput: false,
    requiresAdminSecret: true,
    requiresNotificationSecret: true,
    hermesReleaseRow: 'allow-confirm',
  }),
  'hermes-notification-inspect': Object.freeze({
    entrypoint: 'scripts/hermes-admin.ts',
    validateArguments(arguments_) {
      if (
        arguments_.length !== 1 || !POSITIVE_FID.test(arguments_[0])
        || BigInt(arguments_[0]) > BigInt(Number.MAX_SAFE_INTEGER)
      ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_COMMAND_ARGUMENTS_INVALID');
      return Object.freeze(['inspect-admission-notification', arguments_[0], '--json']);
    },
    privateInput: false,
    requiresAdminSecret: false,
    requiresNotificationSecret: true,
    hermesReleaseRow: 'notification-inspect',
  }),
  'hermes-notification-recover-dry': Object.freeze({
    entrypoint: 'scripts/hermes-admin.ts',
    validateArguments(arguments_) {
      validateHermesFidAndNote(arguments_);
      return Object.freeze([
        'recover-admission-notification', ...arguments_, '--input-stdin', '--dry-run',
      ]);
    },
    privateInput: false,
    requiresAdminSecret: true,
    requiresNotificationSecret: true,
    hermesReleaseRow: 'notification-recover-dry',
  }),
  'hermes-notification-recover-confirm': Object.freeze({
    entrypoint: 'scripts/hermes-admin.ts',
    validateArguments(arguments_) {
      if (
        arguments_.length !== 2 || !NOTIFICATION_PLAN_FILENAME.test(arguments_[0])
        || !SHA256.test(arguments_[1])
      ) {
        fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_COMMAND_ARGUMENTS_INVALID');
      }
      return Object.freeze([
        'recover-admission-notification', ...arguments_, '--input-stdin', '--confirm',
      ]);
    },
    privateInput: false,
    requiresAdminSecret: true,
    requiresNotificationSecret: true,
    hermesReleaseRow: 'notification-recover-confirm',
  }),
});

export class GreaterRealmProductionBootstrapError extends Error {
  constructor(code, options) {
    super(code, options);
    this.name = 'GreaterRealmProductionBootstrapError';
    this.code = code;
  }
}

function fail(code, cause) {
  throw new GreaterRealmProductionBootstrapError(code, cause === undefined ? undefined : { cause });
}

function exactKeys(value, expected, code) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).toSorted();
  const sortedExpected = [...expected].toSorted();
  if (
    actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])
  ) fail(code);
  return value;
}

function inside(parent, child) {
  const difference = relative(parent, child);
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function updateLengthFramed(hash, label, value) {
  const labelBytes = Buffer.from(label, 'utf8');
  const valueBytes = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(labelBytes.length));
  hash.update(length).update(labelBytes);
  length.writeBigUInt64BE(BigInt(valueBytes.length));
  hash.update(length).update(valueBytes);
}

const LAUNCH_PHASES = Object.freeze([
  'launch-prepared',
  'bootstrap-validating',
  'operator-starting',
  'operator-gated',
  'operator-running',
  'operator-terminal',
  'complete',
]);

function launchArgumentsDigest(command, arguments_) {
  const hash = createHash('sha256');
  updateLengthFramed(hash, 'domain', 'warpkeep-production-launch-arguments-v1');
  updateLengthFramed(hash, 'command', command);
  for (const argument of arguments_) updateLengthFramed(hash, 'argument', argument);
  return hash.digest('hex');
}

function launchRecordPath(runRoot) {
  return join(runRoot, 'launch-record.json');
}

function canonicalLifecycleJson(value) {
  const normalize = current => {
    if (Array.isArray(current)) return current.map(normalize);
    if (current !== null && typeof current === 'object') {
      return Object.fromEntries(Object.keys(current).toSorted().map(key => [
        key,
        normalize(current[key]),
      ]));
    }
    return current;
  };
  return `${JSON.stringify(normalize(value))}\n`;
}

function launchLifecycleRecordDigest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseLaunchLifecycleRecord(value) {
  const raw = exactKeys(value, [
    'schemaVersion', 'profile', 'runId', 'ordinal', 'phase', 'previousRecordSha256',
    'pid', 'processStartIdentity', 'protectedMain', 'moduleTree', 'bootstrapBlob',
    'bootstrapSha256', 'command', 'commandArgumentsSha256', 'runDev', 'runIno',
    'launchRecordSha256', 'containedChildPid', 'containedChildProcessStartIdentity',
    'containedChildPgid', 'containmentConfirmationSha256',
    'cleanupConfirmationSha256', 'cleanupTreeInventorySha256', 'cleanupReason',
  ], 'GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_RECORD_INVALID');
  const rootAbsent = raw.runDev === null && raw.runIno === null;
  const rootPresent = typeof raw.runDev === 'string' && DECIMAL_IDENTITY.test(raw.runDev)
    && typeof raw.runIno === 'string' && DECIMAL_IDENTITY.test(raw.runIno);
  const cleanupPhase = [
    'cleanup-prepared', 'tree-removing', 'run-removed', 'complete',
  ].includes(raw.phase);
  const containmentAbsent = raw.containedChildPid === null
    && raw.containedChildProcessStartIdentity === null
    && raw.containedChildPgid === null
    && raw.containmentConfirmationSha256 === null;
  const containmentPresent = Number.isSafeInteger(raw.containedChildPid)
    && raw.containedChildPid > 1
    && typeof raw.containedChildProcessStartIdentity === 'string'
    && /^[\u0020-\u007e]{1,160}$/u.test(raw.containedChildProcessStartIdentity)
    && raw.containedChildPgid === raw.containedChildPid
    && typeof raw.containmentConfirmationSha256 === 'string'
    && SHA256.test(raw.containmentConfirmationSha256);
  if (
    raw.schemaVersion !== 1
    || raw.profile !== LAUNCH_LIFECYCLE_PROFILE
    || typeof raw.runId !== 'string' || !LAUNCH_RUN_ID.test(raw.runId)
    || !Number.isSafeInteger(raw.ordinal) || raw.ordinal < 1 || raw.ordinal > 99_999_999
    || !LAUNCH_LIFECYCLE_PHASES.includes(raw.phase)
    || !(raw.previousRecordSha256 === null || (
      typeof raw.previousRecordSha256 === 'string' && SHA256.test(raw.previousRecordSha256)
    ))
    || (raw.ordinal === 1) !== (raw.previousRecordSha256 === null)
    || !Number.isSafeInteger(raw.pid) || raw.pid < 1
    || typeof raw.processStartIdentity !== 'string'
    || !/^[\u0020-\u007e]{8,160}$/u.test(raw.processStartIdentity)
    || typeof raw.protectedMain !== 'string' || !COMMIT.test(raw.protectedMain)
    || typeof raw.moduleTree !== 'string' || !COMMIT.test(raw.moduleTree)
    || typeof raw.bootstrapBlob !== 'string' || !COMMIT.test(raw.bootstrapBlob)
    || typeof raw.bootstrapSha256 !== 'string' || !SHA256.test(raw.bootstrapSha256)
    || typeof raw.command !== 'string' || !SAFE_LAUNCH_COMMAND.test(raw.command)
    || typeof raw.commandArgumentsSha256 !== 'string' || !SHA256.test(raw.commandArgumentsSha256)
    || (!rootAbsent && !rootPresent)
    || (raw.phase === 'allocated' && !rootAbsent)
    || (['launch-installing', 'launch-installed'].includes(raw.phase) && !rootPresent)
    || !(raw.launchRecordSha256 === null || (
      typeof raw.launchRecordSha256 === 'string' && SHA256.test(raw.launchRecordSha256)
    ))
    || (raw.phase === 'launch-installed' && raw.launchRecordSha256 === null)
    || (!containmentAbsent && !containmentPresent)
    || (['containment-prepared', 'operator-contained'].includes(raw.phase)
      && !containmentPresent)
    || !(raw.cleanupConfirmationSha256 === null || (
      typeof raw.cleanupConfirmationSha256 === 'string'
      && SHA256.test(raw.cleanupConfirmationSha256)
    ))
    || cleanupPhase !== (raw.cleanupConfirmationSha256 !== null)
    || !(raw.cleanupTreeInventorySha256 === null || (
      typeof raw.cleanupTreeInventorySha256 === 'string'
      && SHA256.test(raw.cleanupTreeInventorySha256)
    ))
    || cleanupPhase !== (raw.cleanupTreeInventorySha256 !== null)
    || !(raw.cleanupReason === null || raw.cleanupReason === 'confirmed-dead-owner'
      || raw.cleanupReason === 'completed-current-owner')
    || cleanupPhase !== (raw.cleanupReason !== null)
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_RECORD_INVALID');
  return Object.freeze(raw);
}

function lifecycleRecordBasename(record) {
  return `${record.runId}-${String(record.ordinal).padStart(8, '0')}-${record.phase}.json`;
}

function readLifecycleRecordFile(path, expectedBasename) {
  const opened = readExactFile(path, 32 * 1024, 0o600, Object.freeze([1n, 2n]));
  try {
    const bytes = Buffer.from(opened.bytes);
    let parsed;
    try {
      parsed = parseLaunchLifecycleRecord(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
      );
    } catch (error) {
      if (error instanceof GreaterRealmProductionBootstrapError) throw error;
      fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_RECORD_INVALID', error);
    }
    if (lifecycleRecordBasename(parsed) !== expectedBasename) {
      fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_RECORD_INVALID');
    }
    return Object.freeze({ record: parsed, digest: launchLifecycleRecordDigest(bytes), bytes });
  } finally {
    opened.bytes.fill(0);
    closeSync(opened.descriptor);
  }
}

function lifecycleAuthorityDirectory(runRoot) {
  return join(dirname(dirname(runRoot)), 'bootstrap-run-lifecycle-v1');
}

function parseLaunchTerminalRecord(value, runId) {
  const raw = exactKeys(value, [
    'schemaVersion', 'profile', 'runId', 'finalLifecycleRecordSha256',
    'finalLifecycleRecord',
  ], 'GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_TERMINAL_INVALID');
  const finalRecord = parseLaunchLifecycleRecord(raw.finalLifecycleRecord);
  const finalBytes = Buffer.from(canonicalLifecycleJson(finalRecord), 'utf8');
  const finalDigest = launchLifecycleRecordDigest(finalBytes);
  finalBytes.fill(0);
  if (
    raw.schemaVersion !== 1 || raw.profile !== LAUNCH_TERMINAL_PROFILE
    || raw.runId !== runId || finalRecord.runId !== runId || finalRecord.phase !== 'complete'
    || typeof raw.finalLifecycleRecordSha256 !== 'string'
    || raw.finalLifecycleRecordSha256 !== finalDigest
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_TERMINAL_INVALID');
  return Object.freeze({ ...raw, finalLifecycleRecord: finalRecord });
}

function readLaunchTerminal(directory, runId) {
  const finalPath = join(directory, `${runId}-terminal.json`);
  const temporaryNames = readdirSync(directory).filter(name => {
    const match = LAUNCH_TERMINAL_TEMPORARY.exec(name);
    return match !== null && match[1] === runId;
  });
  if (temporaryNames.length > 1) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_TERMINAL_INVALID');
  }
  const read = path => {
    const opened = readExactFile(path, 32 * 1024, 0o600, Object.freeze([1n, 2n]));
    try {
      const bytes = Buffer.from(opened.bytes);
      let raw;
      try {
        raw = parseLaunchTerminalRecord(
          JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
          runId,
        );
      } catch (error) {
        bytes.fill(0);
        throw error;
      }
      const digest = launchLifecycleRecordDigest(bytes);
      bytes.fill(0);
      return Object.freeze({ path, raw, digest, status: opened.status });
    } finally {
      opened.bytes.fill(0);
      closeSync(opened.descriptor);
    }
  };
  const final = bootstrapPathExistsNoFollow(finalPath) ? read(finalPath) : undefined;
  const temporary = temporaryNames.length === 0
    ? undefined
    : read(join(directory, temporaryNames[0]));
  if (temporary !== undefined) {
    const expected = LAUNCH_TERMINAL_TEMPORARY.exec(temporaryNames[0])[2];
    if (temporary.digest !== expected) {
      fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_TERMINAL_INVALID');
    }
  }
  if (final !== undefined && temporary !== undefined) {
    if (
      final.digest !== temporary.digest || final.status.dev !== temporary.status.dev
      || final.status.ino !== temporary.status.ino || final.status.nlink !== 2n
      || temporary.status.nlink !== 2n
    ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_TERMINAL_INVALID');
    return Object.freeze({ ...final, publicationState: 'linked', finalPath,
      temporaryPath: temporary.path });
  }
  if (final !== undefined) {
    if (final.status.nlink !== 1n) {
      fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_TERMINAL_INVALID');
    }
    return Object.freeze({ ...final, publicationState: 'installed', finalPath,
      temporaryPath: undefined });
  }
  if (temporary !== undefined) {
    if (temporary.status.nlink !== 1n) {
      fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_TERMINAL_INVALID');
    }
    return Object.freeze({ ...temporary, publicationState: 'prelink', finalPath,
      temporaryPath: temporary.path });
  }
  return undefined;
}

function readLaunchLifecycleChain(runRoot, options = {}) {
  const runId = basename(runRoot);
  if (!LAUNCH_RUN_ID.test(runId)) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_RECORD_INVALID');
  }
  const directory = options.directory ?? lifecycleAuthorityDirectory(runRoot);
  if (!bootstrapPathExistsNoFollow(directory)) return Object.freeze({
    directory,
    records: Object.freeze([]),
    partialTemporaries: Object.freeze([]),
  });
  if (exactPrivateDirectory(directory) !== directory) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_RECORD_INVALID');
  }
  const installed = new Map();
  const temporaries = new Map();
  const partialTemporaries = [];
  const names = readdirSync(directory);
  if (names.length > 4_096) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_RECORD_INVALID');
  }
  for (const name of names) {
    if (LAUNCH_TERMINAL_RECORD.test(name) || LAUNCH_TERMINAL_TEMPORARY.test(name)) continue;
    const lockMatch = LAUNCH_LIFECYCLE_LOCK.exec(name);
    if (lockMatch !== null) {
      const status = lstatSync(join(directory, name), { bigint: true });
      if (
        !status.isFile() || status.isSymbolicLink() || status.nlink !== 1n
        || (status.mode & 0o7777n) !== 0o600n || status.size > 4n * 1024n
        || (process.getuid !== undefined && status.uid !== BigInt(process.getuid()))
      ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_RECORD_INVALID');
      continue;
    }
    const finalMatch = LAUNCH_LIFECYCLE_RECORD.exec(name);
    const temporaryMatch = LAUNCH_LIFECYCLE_TEMPORARY.exec(name);
    if (finalMatch === null && temporaryMatch === null) {
      fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_RECORD_INVALID');
    }
    const match = finalMatch ?? temporaryMatch;
    if (match[1] !== runId) continue;
    const path = join(directory, name);
    const expectedBasename = `${match[1]}-${match[2]}-${match[3]}.json`;
    let entry;
    try {
      entry = readLifecycleRecordFile(path, expectedBasename);
    } catch (error) {
      if (temporaryMatch === null) throw error;
      const status = lstatSync(path, { bigint: true });
      if (
        !status.isFile() || status.isSymbolicLink()
        || ![1n, 2n].includes(status.nlink)
        || (status.mode & 0o7777n) !== 0o600n
        || (process.getuid !== undefined && status.uid !== BigInt(process.getuid()))
        || status.size > 32n * 1024n
      ) throw error;
      partialTemporaries.push(Object.freeze({
        path,
        runId: temporaryMatch[1],
        ordinal: Number(temporaryMatch[2]),
        phase: temporaryMatch[3],
        pid: Number(temporaryMatch[4]),
        processStartIdentitySha256: temporaryMatch[5],
        expectedRecordSha256: temporaryMatch[6],
        dev: status.dev.toString(),
        ino: status.ino.toString(),
        nlink: Number(status.nlink),
        size: Number(status.size),
      }));
      continue;
    }
    if (temporaryMatch !== null && (
      entry.record.pid !== Number(temporaryMatch[4])
      || createHash('sha256').update(entry.record.processStartIdentity).digest('hex')
        !== temporaryMatch[5]
      || entry.digest !== temporaryMatch[6]
    )) {
      entry.bytes.fill(0);
      fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_RECORD_INVALID');
    }
    const key = `${match[2]}:${match[3]}`;
    const target = finalMatch === null ? temporaries : installed;
    if (target.has(key)) {
      entry.bytes.fill(0);
      fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_RECORD_INVALID');
    }
    target.set(key, Object.freeze({ ...entry, path }));
  }
  const effective = [];
  for (const key of new Set([...installed.keys(), ...temporaries.keys()])) {
    const final = installed.get(key);
    const temporary = temporaries.get(key);
    if (final !== undefined && temporary !== undefined) {
      const finalStatus = lstatSync(final.path, { bigint: true });
      const temporaryStatus = lstatSync(temporary.path, { bigint: true });
      if (
        final.digest !== temporary.digest
        || finalStatus.dev !== temporaryStatus.dev || finalStatus.ino !== temporaryStatus.ino
        || finalStatus.nlink !== 2n || temporaryStatus.nlink !== 2n
      ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_RECORD_INVALID');
      temporary.bytes.fill(0);
      effective.push(Object.freeze({
        ...final,
        publicationState: 'linked',
        finalPath: final.path,
        temporaryPath: temporary.path,
      }));
    } else if (final !== undefined) {
      if (lstatSync(final.path, { bigint: true }).nlink !== 1n) {
        fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_RECORD_INVALID');
      }
      effective.push(Object.freeze({
        ...final,
        publicationState: 'installed',
        finalPath: final.path,
        temporaryPath: undefined,
      }));
    } else {
      if (lstatSync(temporary.path, { bigint: true }).nlink !== 1n) {
        fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_RECORD_INVALID');
      }
      effective.push(Object.freeze({
        ...temporary,
        publicationState: 'prelink',
        finalPath: join(directory, lifecycleRecordBasename(temporary.record)),
        temporaryPath: temporary.path,
      }));
    }
  }
  effective.sort((left, right) => left.record.ordinal - right.record.ordinal);
  const terminal = readLaunchTerminal(directory, runId);
  const compacting = terminal !== undefined
    && effective.length > 0
    && terminal.raw.finalLifecycleRecordSha256 === effective.at(-1).digest
    && JSON.stringify(terminal.raw.finalLifecycleRecord) === JSON.stringify(effective.at(-1).record);
  let previous;
  const allowedPhases = Object.freeze({
    allocated: Object.freeze(['launch-installing', 'cleanup-prepared']),
    'launch-installing': Object.freeze(['launch-installed', 'cleanup-prepared']),
    'launch-installed': Object.freeze(['containment-prepared', 'cleanup-prepared']),
    'containment-prepared': Object.freeze(['operator-contained']),
    'operator-contained': Object.freeze(['cleanup-prepared']),
    'cleanup-prepared': Object.freeze(['tree-removing', 'run-removed']),
    'tree-removing': Object.freeze(['run-removed']),
    'run-removed': Object.freeze(['complete']),
    complete: Object.freeze([]),
  });
  for (const entry of effective) {
    if (
      (previous === undefined
        ? (!compacting && (
            entry.record.ordinal !== 1 || entry.record.previousRecordSha256 !== null
            || !['allocated', 'cleanup-prepared'].includes(entry.record.phase)
          ))
        : (entry.record.ordinal !== previous.record.ordinal + 1
          || entry.record.previousRecordSha256 !== previous.digest))
      || (previous !== undefined && !allowedPhases[previous.record.phase].includes(
        entry.record.phase,
      ))
      || (previous !== undefined && [
        'runId', 'pid', 'processStartIdentity', 'protectedMain', 'moduleTree',
        'bootstrapBlob', 'bootstrapSha256', 'command', 'commandArgumentsSha256',
      ].some(key => entry.record[key] !== previous.record[key]))
      || (previous !== undefined && previous.record.runDev !== null
        && (entry.record.runDev !== previous.record.runDev
          || entry.record.runIno !== previous.record.runIno))
      || (previous !== undefined && previous.record.launchRecordSha256 !== null
        && !(previous.record.phase === 'launch-installed'
          && ['containment-prepared', 'cleanup-prepared'].includes(entry.record.phase))
        && entry.record.launchRecordSha256 !== previous.record.launchRecordSha256)
      || (previous !== undefined && previous.record.containedChildPid !== null
        && [
          'containedChildPid', 'containedChildProcessStartIdentity', 'containedChildPgid',
          'containmentConfirmationSha256',
        ].some(key => entry.record[key] !== previous.record[key]))
      || (previous !== undefined && previous.record.cleanupConfirmationSha256 !== null
        && (entry.record.cleanupConfirmationSha256
          !== previous.record.cleanupConfirmationSha256
          || entry.record.cleanupTreeInventorySha256
            !== previous.record.cleanupTreeInventorySha256
          || entry.record.cleanupReason !== previous.record.cleanupReason))
    ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_RECORD_INVALID');
    previous = entry;
  }
  for (const partial of partialTemporaries) {
    const key = `${String(partial.ordinal).padStart(8, '0')}:${partial.phase}`;
    if (installed.has(key) || temporaries.has(key)) {
      fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_RECORD_INVALID');
    }
  }
  if (terminal !== undefined && effective.length === 0) {
    effective.push(Object.freeze({
      record: terminal.raw.finalLifecycleRecord,
      digest: terminal.raw.finalLifecycleRecordSha256,
      publicationState: terminal.publicationState,
      finalPath: terminal.finalPath,
      temporaryPath: terminal.temporaryPath,
      terminal: true,
    }));
  } else if (terminal !== undefined && !compacting) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_TERMINAL_INVALID');
  }
  return Object.freeze({
    directory,
    records: Object.freeze(effective),
    partialTemporaries: Object.freeze(partialTemporaries),
    terminal,
  });
}

function repairLaunchLifecyclePublications(runRoot, options = {}) {
  let chain = readLaunchLifecycleChain(runRoot, options);
  if (chain.partialTemporaries.length !== 0) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_RECORD_INVALID');
  }
  for (const entry of chain.records) {
    if (entry.publicationState === 'prelink') {
      linkSync(entry.temporaryPath, entry.finalPath);
      fsyncBootstrapDirectory(chain.directory);
    }
    if (entry.publicationState !== 'installed') {
      unlinkSync(entry.temporaryPath);
      fsyncBootstrapDirectory(chain.directory);
    }
  }
  chain = readLaunchLifecycleChain(runRoot, options);
  if (
    chain.partialTemporaries.length !== 0
    || chain.records.some(entry => entry.publicationState !== 'installed')
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_RECORD_INVALID');
  return chain;
}

function publishLaunchLifecycleRecord(runRoot, record, options = {}) {
  const parsed = parseLaunchLifecycleRecord(record);
  if (!bootstrapPathExistsNoFollow(options.directory ?? lifecycleAuthorityDirectory(runRoot))) {
    const directory = options.directory ?? lifecycleAuthorityDirectory(runRoot);
    mkdirSync(directory, { mode: 0o700 });
    fsyncBootstrapDirectory(dirname(directory));
  }
  const chain = repairLaunchLifecyclePublications(runRoot, options);
  const current = chain.records.at(-1);
  if (
    parsed.runId !== basename(runRoot)
    || parsed.ordinal !== (current?.record.ordinal ?? 0) + 1
    || parsed.previousRecordSha256 !== (current?.digest ?? null)
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_RECORD_INVALID');
  if (exactPrivateDirectory(chain.directory) !== chain.directory) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_RECORD_INVALID');
  }
  const bytes = Buffer.from(canonicalLifecycleJson(parsed), 'utf8');
  const digest = launchLifecycleRecordDigest(bytes);
  const basename_ = lifecycleRecordBasename(parsed);
  const final = join(chain.directory, basename_);
  const startDigest = createHash('sha256').update(parsed.processStartIdentity).digest('hex');
  const temporary = join(
    chain.directory,
    `.${basename_}-${parsed.pid}-${startDigest}-${digest}.tmp`,
  );
  let descriptor;
  try {
    descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
      | (constants.O_NOFOLLOW ?? 0), 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temporary, final);
    fsyncBootstrapDirectory(chain.directory);
    unlinkSync(temporary);
    fsyncBootstrapDirectory(chain.directory);
  } finally {
    bytes.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return readLaunchLifecycleChain(runRoot, options).records.at(-1);
}

function nextLaunchLifecycleRecord(previous, phase, updates = {}) {
  return Object.freeze({
    ...previous.record,
    ...updates,
    ordinal: previous.record.ordinal + 1,
    phase,
    previousRecordSha256: previous.digest,
  });
}

function publishLaunchTerminal(directory, complete) {
  const terminal = Object.freeze({
    schemaVersion: 1,
    profile: LAUNCH_TERMINAL_PROFILE,
    runId: complete.record.runId,
    finalLifecycleRecordSha256: complete.digest,
    finalLifecycleRecord: complete.record,
  });
  const bytes = Buffer.from(canonicalLifecycleJson(terminal), 'utf8');
  const digest = launchLifecycleRecordDigest(bytes);
  const final = join(directory, `${complete.record.runId}-terminal.json`);
  const temporary = join(directory, `.${complete.record.runId}-terminal.json-${digest}.tmp`);
  let descriptor;
  try {
    descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
      | (constants.O_NOFOLLOW ?? 0), 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    try {
      linkSync(temporary, final);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const installed = readLaunchTerminal(directory, complete.record.runId);
      if (installed?.digest !== digest) {
        fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_PREDECESSOR_CAS_FAILED');
      }
      unlinkSync(temporary);
      fsyncBootstrapDirectory(directory);
      return installed;
    }
    fsyncBootstrapDirectory(directory);
    unlinkSync(temporary);
    fsyncBootstrapDirectory(directory);
  } finally {
    bytes.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return readLaunchTerminal(directory, complete.record.runId);
}

function compactLaunchLifecycleAuthority(runRoot, complete) {
  const chain = repairLaunchLifecyclePublications(runRoot);
  if (
    chain.records.at(-1)?.record.phase !== 'complete'
    || chain.records.at(-1)?.digest !== complete.digest
    || bootstrapPathExistsNoFollow(runRoot)
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_COMPACTION_INVALID');
  publishLaunchTerminal(chain.directory, complete);
  for (const entry of chain.records) {
    if (entry.terminal === true) continue;
    if (bootstrapPathExistsNoFollow(entry.finalPath)) {
      unlinkSync(entry.finalPath);
      fsyncBootstrapDirectory(chain.directory);
    }
  }
  const terminal = readLaunchTerminal(chain.directory, complete.record.runId);
  if (terminal?.publicationState !== 'installed') {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_COMPACTION_INVALID');
  }
  return terminal;
}

function parseLaunchRecord(value) {
  const raw = exactKeys(value, [
    'schemaVersion', 'profile', 'phase', 'pid', 'protectedMain', 'moduleTree',
    'bootstrapBlob', 'bootstrapSha256', 'command', 'commandArgumentsSha256',
    'processStartIdentity', 'runDev', 'runIno', 'childPid',
    'childProcessStartIdentity', 'childPgid', 'terminal',
  ], 'GREATER_REALM_PRODUCTION_BOOTSTRAP_LAUNCH_RECORD_INVALID');
  const childAbsent = raw.childPid === null && raw.childProcessStartIdentity === null
    && raw.childPgid === null;
  const childPresent = Number.isSafeInteger(raw.childPid) && raw.childPid > 1
    && typeof raw.childProcessStartIdentity === 'string'
    && /^[\u0020-\u007e]{1,160}$/u.test(raw.childProcessStartIdentity)
    && raw.childPgid === raw.childPid;
  const terminalPhase = raw.phase === 'operator-terminal' || raw.phase === 'complete';
  if (
    raw.schemaVersion !== 1
    || raw.profile !== 'warpkeep-greater-realm-production-launch-v1'
    || !LAUNCH_PHASES.includes(raw.phase)
    || !Number.isSafeInteger(raw.pid) || raw.pid < 1
    || typeof raw.processStartIdentity !== 'string'
    || !/^[\u0020-\u007e]{8,160}$/u.test(raw.processStartIdentity)
    || typeof raw.runDev !== 'string' || !DECIMAL_IDENTITY.test(raw.runDev)
    || typeof raw.runIno !== 'string' || !DECIMAL_IDENTITY.test(raw.runIno)
    || typeof raw.protectedMain !== 'string' || !COMMIT.test(raw.protectedMain)
    || typeof raw.moduleTree !== 'string' || !COMMIT.test(raw.moduleTree)
    || typeof raw.bootstrapBlob !== 'string' || !COMMIT.test(raw.bootstrapBlob)
    || typeof raw.bootstrapSha256 !== 'string' || !SHA256.test(raw.bootstrapSha256)
    || typeof raw.command !== 'string' || !SAFE_LAUNCH_COMMAND.test(raw.command)
    || typeof raw.commandArgumentsSha256 !== 'string' || !SHA256.test(raw.commandArgumentsSha256)
    || (!childAbsent && !childPresent)
    || (['launch-prepared', 'bootstrap-validating', 'operator-starting'].includes(raw.phase)
      !== childAbsent)
    || terminalPhase !== (raw.terminal !== null)
    || !(
      raw.terminal === null
      || (exactKeys(raw.terminal, ['code', 'signal', 'interruptedBy', 'reason'],
        'GREATER_REALM_PRODUCTION_BOOTSTRAP_LAUNCH_RECORD_INVALID')
        && (raw.terminal.code === null || Number.isSafeInteger(raw.terminal.code))
        && (raw.terminal.signal === null
          || raw.terminal.signal === 'SIGINT' || raw.terminal.signal === 'SIGTERM'
          || raw.terminal.signal === 'SIGKILL')
        && (raw.terminal.interruptedBy === null
          || raw.terminal.interruptedBy === 'SIGINT'
          || raw.terminal.interruptedBy === 'SIGTERM')
        && ['operator-exit', 'bootstrap-interrupt', 'timeout'].includes(raw.terminal.reason)
        && (raw.terminal.reason !== 'bootstrap-interrupt'
          || raw.terminal.interruptedBy !== null)
        && (raw.terminal.reason !== 'operator-exit'
          || raw.terminal.interruptedBy === null))
    )
    || (raw.phase === 'complete' && (
      raw.terminal.code !== 0
      || raw.terminal.signal !== null
      || raw.terminal.interruptedBy !== null
      || raw.terminal.reason !== 'operator-exit'
    ))
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LAUNCH_RECORD_INVALID');
  return Object.freeze(raw);
}

function readLaunchRecord(input) {
  const opened = readExactFile(launchRecordPath(input.runRoot), 16 * 1024, 0o600);
  try {
    let parsed;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(opened.bytes));
    } catch (error) {
      fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LAUNCH_RECORD_INVALID', error);
    }
    const record = parseLaunchRecord(parsed);
    const runStatus = lstatSync(input.runRoot, { bigint: true });
    if (
      record.pid !== process.pid || record.protectedMain !== input.commit
      || record.processStartIdentity !== processStartIdentity(process.pid)
      || record.runDev !== runStatus.dev.toString() || record.runIno !== runStatus.ino.toString()
      || record.moduleTree !== input.tree || record.bootstrapBlob !== input.bootstrapBlob
      || record.bootstrapSha256 !== input.bootstrapSha256 || record.command !== input.commandName
      || record.commandArgumentsSha256
        !== launchArgumentsDigest(input.commandName, input.launchArguments)
    ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LAUNCH_RECORD_INVALID');
    return record;
  } finally {
    opened.bytes.fill(0);
    closeSync(opened.descriptor);
  }
}

function fsyncBootstrapDirectory(path) {
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const status = fstatSync(descriptor);
    if (!status.isDirectory()) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LAUNCH_RECORD_INVALID');
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function bootstrapPathExistsNoFollow(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function writeLaunchRecord(input, record) {
  const current = readLaunchRecord(input);
  const allowed = Object.freeze({
    'launch-prepared': Object.freeze(['bootstrap-validating']),
    'bootstrap-validating': Object.freeze(['operator-starting']),
    'operator-starting': Object.freeze(['operator-gated']),
    'operator-gated': Object.freeze(['operator-running', 'operator-terminal']),
    'operator-running': Object.freeze(['operator-terminal']),
    'operator-terminal': Object.freeze(['complete']),
    complete: Object.freeze([]),
  });
  if (!allowed[current.phase].includes(record.phase)) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LAUNCH_RECORD_INVALID');
  }
  const parsed = parseLaunchRecord(record);
  const path = launchRecordPath(input.runRoot);
  const bytes = Buffer.from(canonicalLifecycleJson(parsed), 'utf8');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const temporary = join(input.runRoot, `.launch-record-${parsed.phase}-${digest}.json.tmp`);
  let descriptor;
  try {
    descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
      | (constants.O_NOFOLLOW ?? 0), 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, path);
    fsyncBootstrapDirectory(input.runRoot);
  } finally {
    bytes.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return readLaunchRecord(input);
}

function npmTreeIdentity(root, privateCopy) {
  const canonical = realpathSync(root);
  if (canonical !== root) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_NPM_RUNTIME_INVALID');
  const entries = [];
  const walk = (directory, prefix = '') => {
    for (const name of readdirSync(directory).toSorted()) {
      const path = join(directory, name);
      const relativePath = prefix === '' ? name : `${prefix}/${name}`;
      const status = lstatSync(path, { bigint: true });
      if (
        status.isSymbolicLink()
        || (process.getuid !== undefined && status.uid !== 0n
          && status.uid !== BigInt(process.getuid()))
      ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_NPM_RUNTIME_INVALID');
      if (status.isDirectory()) {
        if ((status.mode & 0o7777n) !== BigInt(privateCopy ? 0o700 : 0o755)) {
          fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_NPM_RUNTIME_INVALID');
        }
        entries.push(Object.freeze({ path: relativePath, kind: 'directory', executable: false,
          size: 0, absolutePath: path }));
        walk(path, relativePath);
      } else if (status.isFile()) {
        const sourceMode = status.mode & 0o7777n;
        const executable = privateCopy ? sourceMode === 0o700n : sourceMode === 0o755n;
        if (
          status.nlink !== 1n
          || (privateCopy
            ? sourceMode !== 0o600n && sourceMode !== 0o700n
            : sourceMode !== 0o644n && sourceMode !== 0o755n)
          || status.size > 32n * 1024n * 1024n
        ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_NPM_RUNTIME_INVALID');
        entries.push(Object.freeze({ path: relativePath, kind: 'file', executable,
          size: Number(status.size), absolutePath: path }));
      } else {
        fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_NPM_RUNTIME_INVALID');
      }
      if (entries.length > EXPECTED_NPM_TREE_ENTRIES) {
        fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_NPM_RUNTIME_INVALID');
      }
    }
  };
  walk(root);
  if (entries.length !== EXPECTED_NPM_TREE_ENTRIES) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_NPM_RUNTIME_INVALID');
  }
  const hash = createHash('sha256');
  updateLengthFramed(hash, 'domain', 'warpkeep-chatgpt-bundled-npm-11.9.0-tree-v1');
  for (const entry of entries) {
    updateLengthFramed(hash, 'path', entry.path);
    updateLengthFramed(hash, 'kind', entry.kind);
    updateLengthFramed(hash, 'executable', entry.executable ? 'true' : 'false');
    updateLengthFramed(hash, 'size', String(entry.size));
    if (entry.kind === 'file') {
      updateLengthFramed(
        hash,
        'content-sha256',
        createHash('sha256').update(readFileSync(entry.absolutePath)).digest(),
      );
    }
  }
  const digest = hash.digest('hex');
  if (digest !== EXPECTED_NPM_TREE_SHA256) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_NPM_RUNTIME_INVALID');
  }
  return Object.freeze({ digest, entries });
}

function stageNpmRuntime(input, sourceRoot) {
  // /Applications is group-writable by the local admin group on supported
  // macOS hosts. Authority comes from the sealed app plus the hard-pinned
  // before/private-copy/after tree digest, not from that ancestor mode.
  npmTreeIdentity(sourceRoot, false);
  const toolchainRoot = join(input.runRoot, 'toolchain');
  mkdirSync(toolchainRoot, { mode: 0o700 });
  const destination = join(toolchainRoot, 'npm');
  cpSync(sourceRoot, destination, { recursive: true, force: false, errorOnExist: true });
  const normalize = directory => {
    chmodSync(directory, 0o700);
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const status = lstatSync(path);
      if (status.isDirectory()) normalize(path);
      else if (status.isFile()) chmodSync(path, (status.mode & 0o111) === 0 ? 0o600 : 0o700);
      else fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_NPM_RUNTIME_INVALID');
    }
  };
  normalize(destination);
  npmTreeIdentity(destination, true);
  npmTreeIdentity(sourceRoot, false);
  return destination;
}

function exactPrivateDirectory(path) {
  const status = lstatSync(path);
  if (
    !status.isDirectory()
    || status.isSymbolicLink()
    || (process.getuid !== undefined && status.uid !== process.getuid())
    || (status.mode & 0o7777) !== 0o700
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_PRIVATE_DIRECTORY_INVALID');
  return realpathSync(path);
}

function attestCanonicalRunRoot(runRoot) {
  const accountHome = realpathSync(userInfo().homedir);
  if (!isAbsolute(accountHome) || resolve(accountHome) !== accountHome) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_PRIVATE_DIRECTORY_INVALID');
  }
  let ancestor = accountHome;
  while (true) {
    const status = lstatSync(ancestor);
    if (
      status.isSymbolicLink() || !status.isDirectory()
      || (status.mode & 0o022) !== 0
      || (status.uid !== 0 && process.getuid !== undefined && status.uid !== process.getuid())
    ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_PRIVATE_DIRECTORY_INVALID');
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  let parent = accountHome;
  for (const child of ['.warpkeep', 'private', 'production-admin-v1', 'bootstrap-runs-v1']) {
    parent = join(parent, child);
    if (exactPrivateDirectory(parent) !== parent) {
      fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_PRIVATE_DIRECTORY_INVALID');
    }
  }
  const canonicalRunRoot = exactPrivateDirectory(runRoot);
  if (
    canonicalRunRoot !== runRoot
    || dirname(canonicalRunRoot) !== parent
    || !/^run-[0-9a-f]{32}$/u.test(basename(canonicalRunRoot))
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_PRIVATE_DIRECTORY_INVALID');
  return canonicalRunRoot;
}

function hermesPlanDirectories(runRoot, row) {
  const needsFounder = row === 'admit-dry' || row === 'admit-confirm';
  const needsNotificationRecovery = row === 'notification-recover-dry'
    || row === 'notification-recover-confirm';
  const needsPendingCensus = row === 'list-pending';
  if (!needsFounder && !needsNotificationRecovery && !needsPendingCensus) {
    return Object.freeze({});
  }
  const productionAdminRoot = dirname(dirname(runRoot));
  const planRoot = join(productionAdminRoot, 'hermes-release-plans-v1');
  const founder = join(planRoot, 'founder-admission');
  const notificationRecovery = join(planRoot, 'admission-notification-recovery');
  const reportRoot = join(productionAdminRoot, 'hermes-release-reports-v1');
  const pendingCensus = join(reportRoot, 'pending-access-requests');
  for (const path of [
    ...(needsFounder || needsNotificationRecovery ? [planRoot] : []),
    ...(needsFounder ? [founder] : []),
    ...(needsNotificationRecovery ? [notificationRecovery] : []),
    ...(needsPendingCensus ? [reportRoot, pendingCensus] : []),
  ]) {
    try {
      mkdirSync(path, { mode: 0o700 });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
    if (exactPrivateDirectory(path) !== path) {
      fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_PRIVATE_DIRECTORY_INVALID');
    }
  }
  return Object.freeze({
    ...(needsFounder ? { founder } : {}),
    ...(needsNotificationRecovery ? { notificationRecovery } : {}),
    ...(needsPendingCensus ? { pendingCensus } : {}),
  });
}

function readExactFile(path, maximumBytes, mode, allowedNlinks = Object.freeze([1n])) {
  let descriptor;
  let bytes;
  try {
    const pathStatus = lstatSync(path, { bigint: true });
    if (
      !pathStatus.isFile()
      || pathStatus.isSymbolicLink()
      || !allowedNlinks.includes(pathStatus.nlink)
      || (pathStatus.mode & 0o7777n) !== BigInt(mode)
      || (process.getuid !== undefined && pathStatus.uid !== BigInt(process.getuid()))
      || pathStatus.size < 1n
      || pathStatus.size > BigInt(maximumBytes)
    ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_PRIVATE_FILE_INVALID');
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (
      before.dev !== pathStatus.dev
      || before.ino !== pathStatus.ino
      || before.mode !== pathStatus.mode
      || before.nlink !== pathStatus.nlink
      || before.size !== pathStatus.size
    ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_PRIVATE_FILE_INVALID');
    bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, null);
      if (count <= 0) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_PRIVATE_FILE_INVALID');
      offset += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    const afterPath = lstatSync(path, { bigint: true });
    if (
      after.dev !== before.dev || after.ino !== before.ino || after.mode !== before.mode
      || after.nlink !== before.nlink || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs
      || afterPath.dev !== before.dev || afterPath.ino !== before.ino
      || afterPath.mode !== before.mode || afterPath.nlink !== before.nlink
      || afterPath.size !== before.size || afterPath.mtimeNs !== before.mtimeNs
      || afterPath.ctimeNs !== before.ctimeNs
    ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_PRIVATE_FILE_INVALID');
    const result = bytes;
    bytes = undefined;
    return Object.freeze({ descriptor, bytes: result, status: after });
  } catch (error) {
    bytes?.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
    if (error instanceof GreaterRealmProductionBootstrapError) throw error;
    return fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_PRIVATE_FILE_INVALID', error);
  }
}

function runExact(executable, arguments_, options = {}) {
  const result = (options.spawnSync ?? spawnSync)(executable, arguments_, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
    shell: false,
    stdio: options.stdio,
    windowsHide: true,
  });
  if (result.error || result.signal !== null || result.status !== 0) {
    fail(options.code ?? 'GREATER_REALM_PRODUCTION_BOOTSTRAP_CHILD_FAILED');
  }
  return String(result.stdout ?? '');
}

function gitEnvironment(runRoot) {
  const emptyHome = join(runRoot, 'git-home');
  if (exactPrivateDirectory(emptyHome) !== emptyHome || readdirSync(emptyHome).length !== 0) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_GIT_ENVIRONMENT_INVALID');
  }
  return Object.freeze({
    HOME: emptyHome,
    PATH: '/usr/bin:/bin',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_PROTOCOL_FROM_USER: '0',
  });
}

const GIT_CONFIGURATION = Object.freeze([
  '-c', 'credential.helper=',
  '-c', 'core.askPass=',
  '-c', 'core.autocrlf=false',
  '-c', 'core.eol=lf',
  '-c', 'core.fsmonitor=false',
  '-c', 'core.hooksPath=/dev/null',
  '-c', 'core.symlinks=true',
  '-c', 'http.followRedirects=false',
  '-c', 'http.proxy=',
  '-c', 'https.proxy=',
  '-c', 'protocol.file.allow=never',
  '-c', 'remote.origin.proxy=',
  '-c', 'url.https://github.com/.insteadOf=',
]);

function git(input, arguments_, options = {}) {
  return runExact('/usr/bin/git', [
    '--no-pager', '--no-replace-objects', ...GIT_CONFIGURATION,
    ...(input.cloneRoot === undefined ? [] : [`--git-dir=${join(input.cloneRoot, '.git')}`,
      `--work-tree=${input.cloneRoot}`]),
    ...arguments_,
  ], {
    cwd: input.cloneRoot,
    env: input.gitEnvironment,
    spawnSync: options.spawnSync,
    code: options.code ?? 'GREATER_REALM_PRODUCTION_BOOTSTRAP_GIT_FAILED',
  });
}

function gitBlobOid(bytes) {
  return createHash('sha1')
    .update(`blob ${bytes.byteLength}\0`, 'utf8')
    .update(bytes)
    .digest('hex');
}

export function parseGreaterRealmProductionBootstrapArguments(arguments_) {
  if (!Array.isArray(arguments_) || arguments_.length < 13) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_ARGUMENTS_INVALID');
  }
  const [runRootRaw, cloneRootRaw, commit, tree, bootstrapBlob, bootstrapSha256,
    nodeBundlePathRaw, spacetimeExecutablePathRaw, spacetimeCliConfigPathRaw,
    adminSecretPathRaw,
    notificationSecretPathRaw, privateInputPathRaw,
    commandName, ...rawArguments]
    = arguments_;
  if (
    !isAbsolute(runRootRaw) || resolve(runRootRaw) !== runRootRaw
    || !isAbsolute(cloneRootRaw) || resolve(cloneRootRaw) !== cloneRootRaw
    || !inside(runRootRaw, cloneRootRaw)
    || !COMMIT.test(commit) || !COMMIT.test(tree) || !COMMIT.test(bootstrapBlob)
    || !SHA256.test(bootstrapSha256)
    || !isAbsolute(nodeBundlePathRaw) || resolve(nodeBundlePathRaw) !== nodeBundlePathRaw
    || !(spacetimeExecutablePathRaw === '-' || (
      isAbsolute(spacetimeExecutablePathRaw)
      && resolve(spacetimeExecutablePathRaw) === spacetimeExecutablePathRaw
    ))
    || !(spacetimeCliConfigPathRaw === '-' || (
      isAbsolute(spacetimeCliConfigPathRaw)
      && resolve(spacetimeCliConfigPathRaw) === spacetimeCliConfigPathRaw
    ))
    || !(adminSecretPathRaw === '-' || (
      isAbsolute(adminSecretPathRaw) && resolve(adminSecretPathRaw) === adminSecretPathRaw
    ))
    || !(notificationSecretPathRaw === '-' || (
      isAbsolute(notificationSecretPathRaw)
      && resolve(notificationSecretPathRaw) === notificationSecretPathRaw
    ))
    || !(privateInputPathRaw === '-' || (
      isAbsolute(privateInputPathRaw) && resolve(privateInputPathRaw) === privateInputPathRaw
    ))
    || typeof commandName !== 'string'
    || !(commandName in COMMANDS)
    || rawArguments.some(argument => (
      typeof argument !== 'string' || !SAFE_COMMAND_ARGUMENT.test(argument)
    ))
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_ARGUMENTS_INVALID');
  const command = COMMANDS[commandName];
  const spacetimeExecutableRequired = command.requiresSpacetimeExecutable ?? false;
  if (
    spacetimeExecutableRequired !== 'optional'
    && spacetimeExecutableRequired !== (spacetimeExecutablePathRaw !== '-')
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_COMMAND_ARGUMENTS_INVALID');
  const spacetimeCliConfigRequired = command.requiresSpacetimeCliConfig ?? false;
  if (
    spacetimeCliConfigRequired !== 'optional'
    && spacetimeCliConfigRequired !== (spacetimeCliConfigPathRaw !== '-')
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_COMMAND_ARGUMENTS_INVALID');
  if (
    command.requiresAdminSecret !== 'optional'
    && command.requiresAdminSecret !== (adminSecretPathRaw !== '-')
  ) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_COMMAND_ARGUMENTS_INVALID');
  }
  if ((command.requiresNotificationSecret ?? false) !== (notificationSecretPathRaw !== '-')) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_COMMAND_ARGUMENTS_INVALID');
  }
  if (command.requiresCoupledPublishRecoveryAuthority === true) {
    const supplied = [
      spacetimeExecutablePathRaw !== '-',
      spacetimeCliConfigPathRaw !== '-',
      adminSecretPathRaw !== '-',
    ];
    if (!supplied.every(value => value === supplied[0])) {
      fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_COMMAND_ARGUMENTS_INVALID');
    }
  }
  if (command.exactArguments !== undefined && rawArguments.length !== 0) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_COMMAND_ARGUMENTS_INVALID');
  }
  if (command.privateInput === false && privateInputPathRaw !== '-') {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_COMMAND_ARGUMENTS_INVALID');
  }
  if (command.privateInput === 'required' && privateInputPathRaw === '-') {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_COMMAND_ARGUMENTS_INVALID');
  }
  const commandArguments = command.exactArguments ?? command.validateArguments(rawArguments);
  const publishExpectationEnvironment = commandName === 'publish'
    ? foundedPublishExpectations(rawArguments).environment
    : commandName === 'publish-recover'
      ? recoveredPublishExpectations(rawArguments).environment
      : undefined;
  return Object.freeze({
    runRoot: runRootRaw,
    cloneRoot: cloneRootRaw,
    commit,
    tree,
    bootstrapBlob,
    bootstrapSha256,
    nodeBundlePath: nodeBundlePathRaw,
    spacetimeExecutablePath: spacetimeExecutablePathRaw === '-'
      ? undefined
      : spacetimeExecutablePathRaw,
    spacetimeCliConfigPath: spacetimeCliConfigPathRaw === '-'
      ? undefined
      : spacetimeCliConfigPathRaw,
    adminSecretPath: adminSecretPathRaw === '-' ? undefined : adminSecretPathRaw,
    notificationSecretPath: notificationSecretPathRaw === '-'
      ? undefined
      : notificationSecretPathRaw,
    privateInputPath: privateInputPathRaw === '-' ? undefined : privateInputPathRaw,
    commandName,
    command,
    commandArguments,
    publishExpectationEnvironment,
    launchArguments: Object.freeze([...rawArguments]),
  });
}

function assertBootstrapEnvironment(environment) {
  const allowed = new Set(['PATH', 'TMPDIR']);
  if (
    Object.keys(environment).some(key => !allowed.has(key))
    || environment.PATH !== '/usr/bin:/bin'
    || environment.TMPDIR === undefined
    || !isAbsolute(environment.TMPDIR)
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_ENVIRONMENT_INVALID');
}

function attestRuntime(input, spawnSyncImpl) {
  const bundleNodePath = realpathSync(input.nodeBundlePath);
  const nodePath = realpathSync(process.execPath);
  const nodeStatus = lstatSync(bundleNodePath, { bigint: true });
  const stagedStatus = lstatSync(nodePath, { bigint: true });
  if (
    !nodeStatus.isFile() || nodeStatus.isSymbolicLink() || nodeStatus.nlink !== 1n
    || (nodeStatus.mode & 0o7777n) !== 0o755n
    || !stagedStatus.isFile() || stagedStatus.isSymbolicLink() || stagedStatus.nlink !== 1n
    || (stagedStatus.mode & 0o7777n) !== 0o500n
    || createHash('sha256').update(readFileSync(bundleNodePath)).digest('hex')
      !== EXPECTED_NODE_SHA256
    || createHash('sha256').update(readFileSync(nodePath)).digest('hex') !== EXPECTED_NODE_SHA256
    || process.platform !== EXPECTED_PLATFORM || process.arch !== EXPECTED_ARCH
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_RUNTIME_INVALID');
  if (runExact(nodePath, ['--version'], {
    env: { PATH: '/usr/bin:/bin' }, spawnSync: spawnSyncImpl,
    code: 'GREATER_REALM_PRODUCTION_BOOTSTRAP_RUNTIME_INVALID',
  }).trim() !== EXPECTED_NODE_VERSION) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_RUNTIME_INVALID');
  const appRoot = resolve(dirname(bundleNodePath), '..', '..', '..', '..');
  const sourceNpmRoot = join(resolve(dirname(bundleNodePath), '..'), 'lib', 'node_modules', 'npm');
  const authorityResult = (spawnSyncImpl ?? spawnSync)(
    '/usr/bin/codesign', ['-dvv', bundleNodePath], {
      env: { PATH: '/usr/bin:/bin' }, encoding: 'utf8', shell: false,
      windowsHide: true,
    },
  );
  if (authorityResult.error || authorityResult.signal !== null || authorityResult.status !== 0) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_RUNTIME_INVALID');
  }
  const authority = `${authorityResult.stdout ?? ''}${authorityResult.stderr ?? ''}`;
  if (!authority.includes(`TeamIdentifier=${EXPECTED_NODE_TEAM}`)) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_RUNTIME_INVALID');
  }
  runExact('/usr/bin/codesign', ['--verify', '--deep', '--strict', appRoot], {
    env: { PATH: '/usr/bin:/bin' }, spawnSync: spawnSyncImpl,
    code: 'GREATER_REALM_PRODUCTION_BOOTSTRAP_RUNTIME_INVALID',
  });
  const stagedNpmRoot = stageNpmRuntime(input, sourceNpmRoot);
  const npmCli = join(stagedNpmRoot, 'bin', 'npm-cli.js');
  if (runExact(nodePath, [npmCli, '--version'], {
    env: { PATH: '/usr/bin:/bin' }, spawnSync: spawnSyncImpl,
    code: 'GREATER_REALM_PRODUCTION_BOOTSTRAP_RUNTIME_INVALID',
  }).trim() !== EXPECTED_NPM_VERSION) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_RUNTIME_INVALID');
  return Object.freeze({
    nodePath, bundleNodePath, npmCli, appRoot, sourceNpmRoot, stagedNpmRoot,
  });
}

function trackedTree(input, spawnSyncImpl) {
  const output = git(input, ['ls-tree', '-r', '-z', '-l', input.commit], { spawnSync: spawnSyncImpl });
  const entries = [];
  for (const record of output.split('\0')) {
    if (record === '') continue;
    const match = record.match(/^100644 blob ([0-9a-f]{40}) ([0-9]+)\t([^\0\r\n]+)$/u);
    if (match === null || isAbsolute(match[3]) || match[3].split('/').some(value => (
      value === '' || value === '.' || value === '..'
    ))) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_TREE_INVALID');
    entries.push(Object.freeze({ oid: match[1], size: Number(match[2]), path: match[3] }));
  }
  if (entries.length < 1 || entries.some((entry, index) => (
    index > 0 && entries[index - 1].path >= entry.path
  ))) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_TREE_INVALID');
  return Object.freeze(entries);
}

function attestClone(input, spawnSyncImpl, allowedIgnoredPaths = Object.freeze([])) {
  const root = realpathSync(input.cloneRoot);
  if (root !== input.cloneRoot || !inside(input.runRoot, root)) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_CLONE_INVALID');
  }
  if (git(input, ['rev-parse', 'HEAD'], { spawnSync: spawnSyncImpl }).trim() !== input.commit) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_CLONE_INVALID');
  }
  if (git(input, ['rev-parse', 'HEAD^{tree}'], { spawnSync: spawnSyncImpl }).trim() !== input.tree) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_CLONE_INVALID');
  }
  if (git(input, ['remote', 'get-url', 'origin'], { spawnSync: spawnSyncImpl }).trim()
    !== CANONICAL_ORIGIN_URL) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_CLONE_INVALID');
  const entries = trackedTree(input, spawnSyncImpl);
  const bootstrapEntry = entries.find(value => value.path === BOOTSTRAP_PATH);
  if (bootstrapEntry?.oid !== input.bootstrapBlob) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_IDENTITY_INVALID');
  }
  for (const entry of entries) {
    const path = join(root, ...entry.path.split('/'));
    const status = lstatSync(path, { bigint: true });
    if (
      !status.isFile() || status.isSymbolicLink() || status.nlink !== 1n
      || (status.mode & 0o7777n) !== 0o644n
      || (process.getuid !== undefined && status.uid !== BigInt(process.getuid()))
      || status.size !== BigInt(entry.size)
    ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_TREE_INVALID');
    const bytes = readFileSync(path);
    try {
      if (gitBlobOid(bytes) !== entry.oid) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_TREE_INVALID');
    } finally {
      bytes.fill(0);
    }
  }
  const ordinary = git(input, ['ls-files', '--others', '--exclude-standard', '-z'], {
    spawnSync: spawnSyncImpl,
  });
  const ignored = git(input, [
    'ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z',
  ], {
    spawnSync: spawnSyncImpl,
  });
  const ordinaryEntries = ordinary.split('\0').filter(Boolean);
  const ignoredEntries = ignored.split('\0').filter(Boolean).toSorted();
  const expectedIgnoredEntries = [...allowedIgnoredPaths].toSorted();
  if (
    ordinaryEntries.length !== 0
    || ignoredEntries.length !== expectedIgnoredEntries.length
    || ignoredEntries.some(
      (path, index) => path !== expectedIgnoredEntries[index],
    )
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_TREE_INVALID');
  const bootstrapPath = fileURLToPath(import.meta.url);
  const bootstrapBytes = readFileSync(bootstrapPath);
  try {
    if (
      createHash('sha256').update(bootstrapBytes).digest('hex') !== input.bootstrapSha256
      || gitBlobOid(bootstrapBytes) !== input.bootstrapBlob
    ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_IDENTITY_INVALID');
  } finally {
    bootstrapBytes.fill(0);
  }
  return entries;
}

function materializeClone(input, spawnSyncImpl) {
  // Checkout occurs only after the exact bootstrap blob has been extracted and
  // launched by the fixed outer envelope. Checkout transforms are irrelevant
  // to authority because attestClone immediately compares every regular 0644
  // byte sequence to its raw Git blob framing before any import or install.
  git(input, ['checkout', '-B', 'main', input.commit], {
    spawnSync: spawnSyncImpl,
    code: 'GREATER_REALM_PRODUCTION_BOOTSTRAP_CHECKOUT_FAILED',
  });
  for (const entry of trackedTree(input, spawnSyncImpl)) {
    chmodSync(join(input.cloneRoot, ...entry.path.split('/')), 0o644);
  }
}

function npmEnvironment(input, runtime) {
  const rootCache = join(input.runRoot, 'root-npm-cache');
  const moduleCache = join(input.runRoot, 'module-archive-cache');
  const home = join(input.runRoot, 'npm-home');
  const temporary = join(input.runRoot, 'tmp');
  for (const path of [rootCache, moduleCache, home, temporary]) {
    mkdirSync(path, { mode: 0o700, recursive: true });
    exactPrivateDirectory(path);
  }
  return Object.freeze({
    rootCache,
    moduleCache,
    environment: Object.freeze({
      HOME: home,
      PATH: `${dirname(runtime.nodePath)}:/usr/bin:/bin`,
      TMPDIR: temporary,
      npm_config_audit: 'false',
      npm_config_cache: rootCache,
      npm_config_fund: 'false',
      npm_config_globalconfig: '/dev/null',
      npm_config_ignore_scripts: 'true',
      npm_config_noproxy: '*',
      npm_config_proxy: '',
      npm_config_https_proxy: '',
      npm_config_registry: CANONICAL_NPM_REGISTRY,
      npm_config_userconfig: '/dev/null',
    }),
  });
}

function installRootDependencies(input, runtime, npm, spawnSyncImpl) {
  runExact(runtime.nodePath, [
    npm.npmCli, 'ci', '--ignore-scripts', '--no-audit', '--no-fund',
    `--cache=${npm.rootCache}`, `--registry=${CANONICAL_NPM_REGISTRY}`,
    '--userconfig=/dev/null', '--globalconfig=/dev/null',
  ], {
    cwd: input.cloneRoot,
    env: npm.environment,
    stdio: 'inherit',
    spawnSync: spawnSyncImpl,
    maxBuffer: 128 * 1024 * 1024,
    code: 'GREATER_REALM_PRODUCTION_BOOTSTRAP_NPM_INSTALL_FAILED',
  });
  const rootLock = JSON.parse(readFileSync(join(input.cloneRoot, 'package-lock.json'), 'utf8'));
  const installedLock = JSON.parse(readFileSync(
    join(input.cloneRoot, 'node_modules', '.package-lock.json'), 'utf8',
  ));
  if (
    rootLock.lockfileVersion !== 3 || installedLock.lockfileVersion !== 3
    || rootLock.name !== installedLock.name || rootLock.version !== installedLock.version
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_NPM_CLOSURE_INVALID');
  const rootPackages = exactKeys(rootLock.packages, Object.keys(rootLock.packages),
    'GREATER_REALM_PRODUCTION_BOOTSTRAP_NPM_CLOSURE_INVALID');
  const installedPackages = installedLock.packages;
  const actualInstalledKeys = Object.keys(installedPackages).toSorted();
  const compatibleRootPackage = path => {
    const package_ = rootPackages[path];
    return (package_.os === undefined || package_.os.includes('darwin'))
      && (package_.cpu === undefined || package_.cpu.includes('arm64'));
  };
  const allowedInstalledKeys = new Set(Object.keys(rootPackages)
    .filter(path => path.startsWith('node_modules/') && compatibleRootPackage(path)));
  const requiredInstalledKeys = Object.keys(rootPackages).filter(path => (
    path.startsWith('node_modules/')
    && compatibleRootPackage(path)
    && rootPackages[path].optional !== true
  ));
  if (
    actualInstalledKeys.some(path => !allowedInstalledKeys.has(path))
    || requiredInstalledKeys.some(path => !actualInstalledKeys.includes(path))
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_NPM_CLOSURE_INVALID');
  for (const [path, installed] of Object.entries(installedPackages)) {
    if (path === '' || !path.startsWith('node_modules/')) {
      fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_NPM_CLOSURE_INVALID');
    }
    const expected = rootPackages[path];
    if (
      expected === undefined || installed.version !== expected.version
      || installed.integrity !== expected.integrity
      || installed.resolved !== expected.resolved
    ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_NPM_CLOSURE_INVALID');
  }
  const tsxManifest = JSON.parse(readFileSync(
    join(input.cloneRoot, 'node_modules', 'tsx', 'package.json'), 'utf8',
  ));
  if (tsxManifest.name !== 'tsx' || tsxManifest.version !== '4.23.0') {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_NPM_CLOSURE_INVALID');
  }
}

function readExactJson(path, maximumBytes) {
  const mode = Number(lstatSync(path, { bigint: true }).mode & 0o7777n);
  if (![0o600, 0o644].includes(mode)) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_HERMES_RESOLVER_INVALID');
  }
  const opened = readExactFile(path, maximumBytes, mode);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
      opened.bytes,
    ));
  } finally {
    opened.bytes.fill(0);
    closeSync(opened.descriptor);
  }
}

function fsyncExactDirectory(path) {
  if (
    typeof constants.O_DIRECTORY !== 'number'
    || typeof constants.O_NOFOLLOW !== 'number'
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_HERMES_RESOLVER_INVALID');
  const descriptor = openSync(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const status = fstatSync(descriptor);
    if (
      !status.isDirectory()
      || (process.getuid !== undefined && status.uid !== process.getuid())
      || ![0o700, 0o755].includes(status.mode & 0o7777)
    ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_HERMES_RESOLVER_INVALID');
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function exactHermesSourceParserPackageTree(root, expectedName) {
  const code = 'GREATER_REALM_PRODUCTION_BOOTSTRAP_HERMES_RESOLVER_INVALID';
  const hash = createHash('sha256');
  let entryCount = 0;
  let aggregateBytes = 0;
  const pending = [Object.freeze({ absolute: root, relative: '' })];
  while (pending.length > 0) {
    const current = pending.pop();
    const names = readdirSync(current.absolute).toSorted();
    for (const name of names) {
      const absolute = join(current.absolute, name);
      const relativePath = current.relative === ''
        ? name
        : `${current.relative}/${name}`;
      const before = lstatSync(absolute, { bigint: true });
      entryCount += 1;
      if (
        entryCount > HERMES_SOURCE_PARSER_TREE_MAXIMUM_ENTRIES
        || before.isSymbolicLink()
        || (process.getuid !== undefined && before.uid !== BigInt(process.getuid()))
      ) fail(code);
      const mode = Number(before.mode & 0o7777n);
      if (before.isDirectory()) {
        if (![0o700, 0o755].includes(mode)) fail(code);
        updateLengthFramed(hash, 'directory-path', relativePath);
        updateLengthFramed(hash, 'directory-mode', String(mode));
        pending.push(Object.freeze({ absolute, relative: relativePath }));
        continue;
      }
      if (
        !before.isFile()
        || before.nlink !== 1n
        || ![0o600, 0o644, 0o700, 0o755].includes(mode)
        || before.size < 0n
        || before.size > BigInt(HERMES_SOURCE_PARSER_TREE_MAXIMUM_BYTES)
        || aggregateBytes > HERMES_SOURCE_PARSER_TREE_MAXIMUM_BYTES
          - Number(before.size)
      ) fail(code);
      const opened = readExactFile(
        absolute,
        HERMES_SOURCE_PARSER_TREE_MAXIMUM_BYTES,
        mode,
      );
      try {
        aggregateBytes += opened.bytes.byteLength;
        updateLengthFramed(hash, 'file-path', relativePath);
        updateLengthFramed(hash, 'file-mode', String(mode));
        updateLengthFramed(hash, 'file-size', String(opened.bytes.byteLength));
        updateLengthFramed(
          hash,
          'file-sha256',
          createHash('sha256').update(opened.bytes).digest('hex'),
        );
      } finally {
        opened.bytes.fill(0);
        closeSync(opened.descriptor);
      }
    }
  }
  if (entryCount < 1 || aggregateBytes < 1) fail(code);
  updateLengthFramed(hash, 'package-name', expectedName);
  updateLengthFramed(hash, 'entry-count', String(entryCount));
  updateLengthFramed(hash, 'aggregate-bytes', String(aggregateBytes));
  return Object.freeze({
    aggregateBytes,
    digest: hash.digest('hex'),
    entryCount,
  });
}

function exactInstalledHermesSourceParserPackage({
  cloneRoot,
  installedLock,
  name,
  rootLock,
  version,
}) {
  const code = 'GREATER_REALM_PRODUCTION_BOOTSTRAP_HERMES_RESOLVER_INVALID';
  const lockPath = `node_modules/${name}`;
  const targetPath = join(cloneRoot, ...lockPath.split('/'));
  const targetStatus = lstatSync(targetPath);
  const rootPackage = rootLock.packages?.[lockPath];
  const installedPackage = installedLock.packages?.[lockPath];
  if (
    !targetStatus.isDirectory()
    || targetStatus.isSymbolicLink()
    || realpathSync(targetPath) !== targetPath
    || (process.getuid !== undefined && targetStatus.uid !== process.getuid())
    || ![0o700, 0o755].includes(targetStatus.mode & 0o7777)
    || rootLock.lockfileVersion !== 3
    || installedLock.lockfileVersion !== 3
    || rootPackage?.version !== version
    || installedPackage?.version !== version
    || installedPackage.integrity !== rootPackage.integrity
    || installedPackage.resolved !== rootPackage.resolved
  ) fail(code);
  const manifest = readExactJson(join(targetPath, 'package.json'), 64 * 1024);
  if (manifest.name !== name || manifest.version !== version) fail(code);
  return Object.freeze({
    path: targetPath,
    tree: exactHermesSourceParserPackageTree(targetPath, name),
  });
}

function attestHermesSourceParserResolver(cloneRoot, expectedIdentity) {
  const code = 'GREATER_REALM_PRODUCTION_BOOTSTRAP_HERMES_RESOLVER_INVALID';
  try {
    if (realpathSync(cloneRoot) !== cloneRoot) fail(code);
    const authBridgeRoot = join(cloneRoot, 'services', 'auth-bridge');
    const resolverRoot = join(authBridgeRoot, 'node_modules');
    const rootNodeModules = join(cloneRoot, 'node_modules');
    for (const path of [authBridgeRoot, resolverRoot, rootNodeModules]) {
      const status = lstatSync(path);
      if (
        !status.isDirectory()
        || status.isSymbolicLink()
        || realpathSync(path) !== path
        || (process.getuid !== undefined && status.uid !== process.getuid())
        || ![0o700, 0o755].includes(status.mode & 0o7777)
        || (path === resolverRoot && (status.mode & 0o7777) !== 0o700)
      ) fail(code);
    }
    const expectedNames = Object.keys(HERMES_SOURCE_PARSER_RESOLVER).toSorted();
    const entries = readdirSync(resolverRoot, { withFileTypes: true });
    const names = entries.map(entry => entry.name).toSorted();
    if (
      names.length !== expectedNames.length
      || names.some((name, index) => name !== expectedNames[index])
      || entries.some(entry => !entry.isSymbolicLink())
    ) fail(code);

    const rootLock = readExactJson(join(cloneRoot, 'package-lock.json'), 4 * 1024 * 1024);
    const installedLock = readExactJson(
      join(rootNodeModules, '.package-lock.json'),
      4 * 1024 * 1024,
    );
    const packageIdentities = {};
    for (const name of expectedNames) {
      const expected = HERMES_SOURCE_PARSER_RESOLVER[name];
      const linkPath = join(resolverRoot, name);
      const linkStatus = lstatSync(linkPath);
      const installed = exactInstalledHermesSourceParserPackage({
        cloneRoot,
        installedLock,
        name,
        rootLock,
        version: expected.version,
      });
      if (
        !linkStatus.isSymbolicLink()
        || linkStatus.nlink !== 1
        || (process.getuid !== undefined && linkStatus.uid !== process.getuid())
        || readlinkSync(linkPath) !== expected.relativeTarget
        || realpathSync(linkPath) !== installed.path
      ) fail(code);
      packageIdentities[name] = installed.tree;
    }
    const nativePackageName = expectedIdentity?.nativePackageName
      ?? HERMES_SOURCE_PARSER_PRODUCTION_NATIVE_PACKAGE;
    if (
      nativePackageName !== HERMES_SOURCE_PARSER_PRODUCTION_NATIVE_PACKAGE
      && nativePackageName
        !== `@typescript/typescript-${process.platform}-${process.arch}`
    ) fail(code);
    packageIdentities[nativePackageName] =
      exactInstalledHermesSourceParserPackage({
        cloneRoot,
        installedLock,
        name: nativePackageName,
        rootLock,
        version: '7.0.2',
      }).tree;
    const identity = Object.freeze({
      nativePackageName,
      resolverRoot,
      packages: Object.freeze(expectedNames),
      packageIdentities: Object.freeze(packageIdentities),
    });
    if (
      expectedIdentity?.packageIdentities !== undefined
      && JSON.stringify(identity.packageIdentities)
        !== JSON.stringify(expectedIdentity.packageIdentities)
    ) fail(code);
    return identity;
  } catch (error) {
    if (
      error instanceof GreaterRealmProductionBootstrapError
      && error.code === code
    ) throw error;
    fail(code, error);
  }
}

function installHermesSourceParserResolver(
  cloneRoot,
  nativePackageName = HERMES_SOURCE_PARSER_PRODUCTION_NATIVE_PACKAGE,
) {
  const code = 'GREATER_REALM_PRODUCTION_BOOTSTRAP_HERMES_RESOLVER_INVALID';
  const authBridgeRoot = join(cloneRoot, 'services', 'auth-bridge');
  const resolverRoot = join(authBridgeRoot, 'node_modules');
  try {
    const parentStatus = lstatSync(authBridgeRoot, { bigint: true });
    if (
      !parentStatus.isDirectory()
      || parentStatus.isSymbolicLink()
      || realpathSync(authBridgeRoot) !== authBridgeRoot
      || (process.getuid !== undefined && parentStatus.uid !== BigInt(process.getuid()))
      || (parentStatus.mode & 0o022n) !== 0n
    ) fail(code);
    chmodSync(authBridgeRoot, 0o700);
    const normalizedParent = lstatSync(authBridgeRoot, { bigint: true });
    if (
      normalizedParent.dev !== parentStatus.dev
      || normalizedParent.ino !== parentStatus.ino
      || !normalizedParent.isDirectory()
      || normalizedParent.isSymbolicLink()
      || (normalizedParent.mode & 0o7777n) !== 0o700n
      || (process.getuid !== undefined
        && normalizedParent.uid !== BigInt(process.getuid()))
    ) fail(code);
    mkdirSync(resolverRoot, { mode: 0o700 });
    chmodSync(resolverRoot, 0o700);
    for (const name of Object.keys(HERMES_SOURCE_PARSER_RESOLVER).toSorted()) {
      symlinkSync(
        HERMES_SOURCE_PARSER_RESOLVER[name].relativeTarget,
        join(resolverRoot, name),
        'dir',
      );
    }
    fsyncExactDirectory(resolverRoot);
    fsyncExactDirectory(authBridgeRoot);
    return attestHermesSourceParserResolver(cloneRoot, Object.freeze({
      nativePackageName,
    }));
  } catch (error) {
    if (
      error instanceof GreaterRealmProductionBootstrapError
      && error.code === code
    ) throw error;
    fail(code, error);
  }
}

async function runOperatorWithPostflightAttestation(operator, postflight) {
  let result;
  let operatorError;
  try {
    result = await operator();
  } catch (error) {
    operatorError = error;
  }
  let postflightError;
  try {
    await postflight();
  } catch (error) {
    postflightError = error;
  }
  if (operatorError !== undefined && postflightError !== undefined) {
    throw new AggregateError(
      [operatorError, postflightError],
      'GREATER_REALM_PRODUCTION_BOOTSTRAP_OPERATOR_AND_POSTFLIGHT_FAILED',
    );
  }
  if (postflightError !== undefined) throw postflightError;
  if (operatorError !== undefined) throw operatorError;
  return result;
}

function packageNameAndVersion(key) {
  const separator = key.lastIndexOf('@');
  const name = key.slice(0, separator);
  const version = key.slice(separator + 1);
  if (!PACKAGE_NAME.test(name) || !VERSION.test(version)) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_MODULE_LOCK_INVALID');
  }
  return Object.freeze({ name, version });
}

export function selectGreaterRealmDarwinArm64ModulePackages(lock) {
  const pending = ['spacetimedb@2.6.1', 'typescript@5.6.3', 'esbuild@0.25.12', 'tsx@4.20.6'];
  const selected = new Map();
  while (pending.length > 0) {
    const key = pending.pop();
    if (selected.has(key)) continue;
    const identity = packageNameAndVersion(key);
    const packageRecord = lock.packages?.[key];
    const snapshot = lock.snapshots?.[key];
    const integrity = packageRecord?.resolution?.integrity;
    if (snapshot === undefined || typeof integrity !== 'string' || !SHA512_INTEGRITY.test(integrity)) {
      fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_MODULE_LOCK_INVALID');
    }
    const dependencies = [];
    for (const field of ['dependencies', 'optionalDependencies']) {
      for (const [name, version] of Object.entries(snapshot[field] ?? {})) {
        const dependencyKey = `${name}@${version}`;
        const dependencyRecord = lock.packages?.[dependencyKey];
        const compatible = (dependencyRecord?.os === undefined
          || JSON.stringify(dependencyRecord.os) === JSON.stringify(['darwin']))
          && (dependencyRecord?.cpu === undefined
            || JSON.stringify(dependencyRecord.cpu) === JSON.stringify(['arm64']));
        if (!compatible) {
          if (field !== 'optionalDependencies') {
            fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_MODULE_LOCK_INVALID');
          }
          continue;
        }
        dependencies.push(dependencyKey);
        pending.push(dependencyKey);
      }
    }
    selected.set(key, Object.freeze({
      key, ...identity, integrity, dependencies: Object.freeze(dependencies.toSorted()),
    }));
  }
  const packages = [...selected.values()].toSorted((left, right) => left.key.localeCompare(right.key));
  if (
    packages.length !== EXPECTED_MODULE_PACKAGE_COUNT
    || !packages.some(value => value.key === '@esbuild/darwin-arm64@0.25.12')
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_MODULE_LOCK_INVALID');
  return Object.freeze(packages);
}

export function canonicalNpmPackageTarballUrl(package_) {
  const leaf = package_.name.includes('/') ? package_.name.slice(package_.name.lastIndexOf('/') + 1) : package_.name;
  const url = new URL(`${package_.name}/-/${leaf}-${package_.version}.tgz`, CANONICAL_NPM_REGISTRY);
  if (url.origin !== 'https://registry.npmjs.org' || url.username !== '' || url.password !== '') {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_MODULE_URL_INVALID');
  }
  return url;
}

function cacheArchivePath(cacheRoot, integrity) {
  const match = integrity.match(SHA512_INTEGRITY);
  if (match === null) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_MODULE_LOCK_INVALID');
  const digest = Buffer.from(match[1], 'base64').toString('hex');
  if (!/^[0-9a-f]{128}$/u.test(digest)) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_MODULE_LOCK_INVALID');
  }
  return Object.freeze({
    path: join(cacheRoot, '_cacache', 'content-v2', 'sha512', digest.slice(0, 2),
      digest.slice(2, 4), digest.slice(4)),
    digest,
  });
}

function downloadExactArchive(url, maximumBytes = MAXIMUM_ARCHIVE_BYTES) {
  return new Promise((resolvePromise, rejectPromise) => {
    const request = httpsRequest(url, {
      method: 'GET',
      headers: { accept: 'application/octet-stream', 'accept-encoding': 'identity' },
      timeout: 30_000,
      agent: false,
    }, response => {
      if (
        response.statusCode !== 200
        || response.headers.location !== undefined
        || response.headers['content-encoding'] !== undefined
      ) {
        response.resume();
        rejectPromise(new Error('GREATER_REALM_PRODUCTION_BOOTSTRAP_MODULE_FETCH_REJECTED'));
        return;
      }
      const chunks = [];
      let total = 0;
      response.on('data', chunk => {
        total += chunk.length;
        if (total > maximumBytes) {
          request.destroy(new Error('GREATER_REALM_PRODUCTION_BOOTSTRAP_MODULE_FETCH_REJECTED'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolvePromise(Buffer.concat(chunks, total)));
      response.on('error', rejectPromise);
    });
    request.on('timeout', () => request.destroy(
      new Error('GREATER_REALM_PRODUCTION_BOOTSTRAP_MODULE_FETCH_REJECTED'),
    ));
    request.on('error', rejectPromise);
    request.end();
  });
}

function installArchive(cacheRoot, package_, bytes) {
  const expected = cacheArchivePath(cacheRoot, package_.integrity);
  if (createHash('sha512').update(bytes).digest('hex') !== expected.digest) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_MODULE_ARCHIVE_DIGEST_MISMATCH');
  }
  mkdirSync(dirname(expected.path), { recursive: true, mode: 0o700 });
  let installed = false;
  try {
    const descriptor = openSync(expected.path, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try {
      writeFileSync(descriptor, bytes);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    installed = true;
    const directory = openSync(dirname(expected.path), constants.O_RDONLY);
    try { fsyncSync(directory); } finally { closeSync(directory); }
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
  const verified = readExactFile(expected.path, MAXIMUM_ARCHIVE_BYTES, 0o600);
  try {
    if (createHash('sha512').update(verified.bytes).digest('hex') !== expected.digest) {
      fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_MODULE_ARCHIVE_DIGEST_MISMATCH');
    }
  } finally {
    verified.bytes.fill(0);
    closeSync(verified.descriptor);
  }
  return installed;
}

export async function stageGreaterRealmModuleArchives(input) {
  const fetchArchive = input.fetchArchive ?? downloadExactArchive;
  const installed = [];
  for (const package_ of input.packages) {
    const expected = cacheArchivePath(input.cacheRoot, package_.integrity);
    let present = true;
    try {
      const verified = readExactFile(expected.path, MAXIMUM_ARCHIVE_BYTES, 0o600);
      try {
        if (createHash('sha512').update(verified.bytes).digest('hex') !== expected.digest) {
          fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_MODULE_ARCHIVE_DIGEST_MISMATCH');
        }
      } finally {
        verified.bytes.fill(0);
        closeSync(verified.descriptor);
      }
    } catch (error) {
      if (!(error instanceof GreaterRealmProductionBootstrapError)) throw error;
      present = false;
    }
    if (present) continue;
    const bytes = await fetchArchive(canonicalNpmPackageTarballUrl(package_));
    try {
      installArchive(input.cacheRoot, package_, bytes);
      installed.push(package_.key);
    } finally {
      bytes.fill(0);
    }
  }
  if (input.packages.length !== EXPECTED_MODULE_PACKAGE_COUNT) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_MODULE_LOCK_INVALID');
  }
  return Object.freeze({ packageCount: input.packages.length, installed: Object.freeze(installed) });
}

function createBootstrapSignalController() {
  let interruptedBy;
  let groupPid;
  let forwarder;
  const forward = signal => {
    interruptedBy ??= signal;
    if (forwarder !== undefined) {
      forwarder(signal);
      return;
    }
    if (groupPid !== undefined) {
      try { process.kill(-groupPid, signal); } catch (error) {
        if (error?.code !== 'ESRCH') throw error;
      }
    }
  };
  const onSigint = () => forward('SIGINT');
  const onSigterm = () => forward('SIGTERM');
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
  return Object.freeze({
    get interruptedBy() { return interruptedBy; },
    bindGroup(pid) { groupPid = pid; },
    unbindGroup(pid) { if (groupPid === pid) groupPid = undefined; },
    setForwarder(callback) { forwarder = callback; },
    signalGroup(signal) {
      if (groupPid === undefined) return;
      try { process.kill(-groupPid, signal); } catch (error) {
        if (error?.code !== 'ESRCH') throw error;
      }
    },
    dispose() {
      forwarder = undefined;
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
    },
  });
}

function processStartIdentity(pid) {
  const output = runExact('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], {
    env: { PATH: '/usr/bin:/bin' },
    code: 'GREATER_REALM_PRODUCTION_BOOTSTRAP_OPERATOR_IDENTITY_INVALID',
  }).trim();
  if (!/^[\u0020-\u007e]{8,160}$/u.test(output)) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_OPERATOR_IDENTITY_INVALID');
  }
  return output;
}

function bootstrapProcessGroupExists(pgid) {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    if (error?.code === 'EPERM') return true;
    throw error;
  }
}

function bootstrapProcessIdentityState(pid, expectedStartIdentity) {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error?.code === 'ESRCH') return 'dead';
    if (error?.code === 'EPERM') return 'live-uninspectable';
    throw error;
  }
  const result = spawnSync('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin' },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0 || typeof result.stdout !== 'string' || result.stdout.trim() === '') {
    return 'live-uninspectable';
  }
  return result.stdout.trim() === expectedStartIdentity ? 'live-exact' : 'live-reused';
}

function bootstrapDelay(milliseconds) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
}

async function waitForBootstrapProcessGroupAbsence(pgid, milliseconds) {
  const deadline = Date.now() + milliseconds;
  while (bootstrapProcessGroupExists(pgid)) {
    if (Date.now() >= deadline) return false;
    await bootstrapDelay(Math.min(50, Math.max(1, deadline - Date.now())));
  }
  return true;
}

async function containBootstrapProcessGroup(input) {
  const assertAttributable = () => {
    const state = bootstrapProcessIdentityState(input.pgid, input.processStartIdentity);
    if (state === 'live-reused' || state === 'live-uninspectable') {
      fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_OPERATOR_CONTAINMENT_AMBIGUOUS');
    }
  };
  assertAttributable();
  input.signalGroup(input.initialSignal);
  if (await waitForBootstrapProcessGroupAbsence(input.pgid, input.terminationGraceMs)) return;
  assertAttributable();
  input.signalGroup('SIGKILL');
  if (!await waitForBootstrapProcessGroupAbsence(input.pgid, input.killGraceMs)) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_OPERATOR_CONTAINMENT_FAILED');
  }
}

function runBootstrapTreeHelper(mode, path, ...arguments_) {
  const result = spawnSync('/usr/bin/python3', [
    '-I', '-S', '-B', '-c', BOOTSTRAP_RUN_TREE_HELPER, mode, path, ...arguments_,
  ], {
    detached: true,
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin' },
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.signal !== null || result.status !== 0) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_TREE_HELPER_FAILED');
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_TREE_HELPER_FAILED', error);
  }
}

async function withBootstrapLifecycleLock(runRoot, operation) {
  const directory = lifecycleAuthorityDirectory(runRoot);
  const runId = basename(runRoot);
  const lockPath = join(directory, `${runId}-lifecycle.lock`);
  const holder = spawn('/usr/bin/python3', [
    '-I', '-S', '-B', '-c', BOOTSTRAP_LIFECYCLE_LOCK_HELPER, lockPath, runId,
  ], {
    detached: true,
    env: { PATH: '/usr/bin:/bin' },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const closePromise = new Promise(resolvePromise => {
    holder.once('close', (code, signal) => resolvePromise({ code, signal }));
  });
  const readyPromise = new Promise((resolvePromise, rejectPromise) => {
    let output = '';
    holder.once('error', rejectPromise);
    holder.stdout.setEncoding('utf8');
    holder.stdout.on('data', chunk => {
      output += String(chunk);
      if (output.length > 64) rejectPromise(new Error('LIFECYCLE_LOCK_OUTPUT_INVALID'));
      if (output === 'READY\n') resolvePromise();
    });
    holder.once('close', () => {
      if (output !== 'READY\n') rejectPromise(new Error('LIFECYCLE_LOCK_NOT_ACQUIRED'));
    });
  });
  await readyPromise;
  let result;
  let primaryError;
  try {
    result = await operation();
  } catch (error) {
    primaryError = error;
  }
  holder.stdin.end();
  const closed = await closePromise;
  const releaseFailed = closed.code !== 0 || closed.signal !== null;
  if (primaryError !== undefined && releaseFailed) {
    throw new AggregateError(
      [primaryError, new Error('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_LOCK_RELEASE_FAILED')],
      'GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_AND_LOCK_RELEASE_FAILED',
    );
  }
  if (primaryError !== undefined) throw primaryError;
  if (releaseFailed) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_LOCK_RELEASE_FAILED');
  return result;
}

function writeGate(stream, value) {
  return new Promise((resolvePromise, rejectPromise) => {
    stream.once('error', rejectPromise);
    stream.end(value, 'utf8', resolvePromise);
  });
}

function finalOperatorEnvironment(input, runtime, npm, planDirectories) {
  return Object.freeze({
    HOME: npm.environment.HOME,
    PATH: npm.environment.PATH,
    TMPDIR: npm.environment.TMPDIR,
    WKGR_PRODUCTION_BOOTSTRAP_PROFILE: PROFILE,
    WKGR_PRODUCTION_PROTECTED_COMMIT: input.commit,
    WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT: npm.moduleCache,
    ...(input.commandName === 'publish'
      ? {
          WKGR_PRODUCTION_PROOF_NODE_EXECUTABLE: runtime.nodePath,
          WKGR_PRODUCTION_PROOF_HOME: npm.environment.HOME,
          WKGR_PRODUCTION_PROOF_TMPDIR: npm.environment.TMPDIR,
        }
      : {}),
    ...(input.publishExpectationEnvironment === undefined
      ? {}
      : input.publishExpectationEnvironment),
    ...(input.adminSecretPath === undefined
      ? {}
      : { WKGR_PRODUCTION_ADMIN_SECRET_PATH: input.adminSecretPath }),
    ...(input.notificationSecretPath === undefined
      ? {}
      : { WKGR_PRODUCTION_NOTIFICATION_SECRET_PATH: input.notificationSecretPath }),
    ...(input.privateInputPath === undefined
      ? {}
      : { WKGR_PRODUCTION_PRIVATE_INPUT_PATH: input.privateInputPath }),
    ...(input.spacetimeExecutablePath === undefined
      ? {}
      : { SPACETIME_BIN: input.spacetimeExecutablePath }),
    ...(input.spacetimeCliConfigPath === undefined
      ? {}
      : {
          WKGR_PRODUCTION_SPACETIME_CLI_CONFIG_PATH:
            input.spacetimeCliConfigPath,
        }),
    ...(input.command.hermesReleaseRow === undefined
      ? {}
      : {
          WKGR_HERMES_RELEASE_COMMAND: input.command.hermesReleaseRow,
          ...(planDirectories.founder === undefined
            ? {}
            : { WKGR_HERMES_FOUNDER_PLAN_DIRECTORY: planDirectories.founder }),
          ...(planDirectories.notificationRecovery === undefined
            ? {}
            : {
                WKGR_HERMES_NOTIFICATION_RECOVERY_PLAN_DIRECTORY:
                  planDirectories.notificationRecovery,
              }),
          ...(planDirectories.pendingCensus === undefined
            ? {}
            : {
                WKGR_HERMES_PENDING_CENSUS_DIRECTORY:
                  planDirectories.pendingCensus,
              }),
          WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
          WARPKEEP_SPACETIMEDB_DATABASE:
            'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
          WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
        }),
  });
}

async function runFinalOperator(
  input,
  runtime,
  npm,
  signalController,
  spawnImpl = spawn,
  timeoutOptions = {},
) {
  const tsxCli = join(input.cloneRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const planDirectories = input.command.hermesReleaseRow === undefined
    ? undefined
    : hermesPlanDirectories(input.runRoot, input.command.hermesReleaseRow);
  // Only the canonical path strings cross this boundary. The entrypoint must
  // remove them from process.env immediately, complete provenance/proof/lock
  // setup, and only then O_NOFOLLOW-open the secret immediately before its
  // first authenticated transport operation. Git, npm, and proof children
  // therefore never inherit secret bytes or an open secret descriptor.
  const childEnvironment = finalOperatorEnvironment(
    input,
    runtime,
    npm,
    planDirectories,
  );
  const gateScript = [
    'IFS= read -r wkgr_gate <&3 || exit 0',
    '[ "$wkgr_gate" = WKGR_RELEASE_OPERATOR_START_V1 ] || exit 64',
    'exec "$@"',
  ].join('; ');
  const child = spawnImpl('/bin/sh', [
    '-c', gateScript, 'warpkeep-production-operator-gate',
    runtime.nodePath, tsxCli, join(input.cloneRoot, input.command.entrypoint),
    ...input.commandArguments,
  ], {
    cwd: input.cloneRoot,
    env: childEnvironment,
    shell: false,
    stdio: ['ignore', 'inherit', 'inherit', 'pipe'],
    detached: true,
    windowsHide: true,
  });
  const resultPromise = new Promise((resolvePromise, rejectPromise) => {
    child.once('error', rejectPromise);
    child.once('close', (code, signal) => resolvePromise({ code, signal }));
  });
  if (!Number.isSafeInteger(child.pid) || child.pid < 2 || child.stdio?.[3] === undefined) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_OPERATOR_SPAWN_INVALID');
  }
  let identity;
  try {
    identity = processStartIdentity(child.pid);
  } catch (error) {
    child.stdio[3].end();
    await Promise.race([resultPromise.catch(() => undefined), bootstrapDelay(5_000)]);
    if (bootstrapProcessGroupExists(child.pid)) {
      throw new AggregateError(
        [error, new Error('GREATER_REALM_PRODUCTION_BOOTSTRAP_OPERATOR_CONTAINMENT_AMBIGUOUS')],
        'GREATER_REALM_PRODUCTION_BOOTSTRAP_OPERATOR_AND_CONTAINMENT_FAILED',
      );
    }
    throw error;
  }
  const operatorTimeoutMs = timeoutOptions.operatorTimeoutMs ?? 45 * 60 * 1_000;
  const terminationGraceMs = timeoutOptions.terminationGraceMs ?? 5_000;
  const killGraceMs = timeoutOptions.killGraceMs ?? 5_000;
  let escalationPromise;
  let rejectContainmentFailure;
  const containmentFailure = new Promise((_, rejectPromise) => {
    rejectContainmentFailure = rejectPromise;
  });
  const escalate = initialSignal => {
    if (escalationPromise !== undefined) return escalationPromise;
    escalationPromise = containBootstrapProcessGroup({
      pgid: child.pid,
      processStartIdentity: identity,
      initialSignal,
      terminationGraceMs,
      killGraceMs,
      signalGroup: signal => signalController.signalGroup(signal),
    });
    escalationPromise.catch(rejectContainmentFailure);
    return escalationPromise;
  };
  signalController.setForwarder(signal => { void escalate(signal); });
  signalController.bindGroup(child.pid);
  let timeout;
  let timedOut = false;
  try {
    let launchRecord = readLaunchRecord(input);
    launchRecord = writeLaunchRecord(input, Object.freeze({
      ...launchRecord,
      phase: 'operator-gated',
      childPid: child.pid,
      childProcessStartIdentity: identity,
      childPgid: child.pid,
    }));
    await new Promise(resolvePromise => setImmediate(resolvePromise));
    let gateReleased = false;
    if (signalController.interruptedBy === undefined) {
      await writeGate(child.stdio[3], 'WKGR_RELEASE_OPERATOR_START_V1\n');
      gateReleased = true;
      launchRecord = writeLaunchRecord(input, Object.freeze({
        ...launchRecord,
        phase: 'operator-running',
      }));
    } else {
      child.stdio[3].end();
    }
    timeout = setTimeout(() => {
      timedOut = true;
      void escalate('SIGTERM');
    }, operatorTimeoutMs);
    timeout.unref?.();
    const result = await Promise.race([resultPromise, containmentFailure]);
    if (bootstrapProcessGroupExists(child.pid)) await escalate('SIGTERM');
    if (escalationPromise !== undefined) await escalationPromise;
    if (bootstrapProcessGroupExists(child.pid)) {
      fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_OPERATOR_CONTAINMENT_FAILED');
    }
    launchRecord = writeLaunchRecord(input, Object.freeze({
      ...launchRecord,
      phase: 'operator-terminal',
      terminal: Object.freeze({
        code: result.code,
        signal: result.signal,
        interruptedBy: signalController.interruptedBy ?? null,
        reason: timedOut
          ? 'timeout'
          : signalController.interruptedBy === undefined
            ? 'operator-exit'
            : 'bootstrap-interrupt',
      }),
    }));
    if (timedOut) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_OPERATOR_TIMED_OUT');
    if (result.signal !== null || result.code !== 0) {
      fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_OPERATOR_FAILED');
    }
    if (!gateReleased || signalController.interruptedBy !== undefined) {
      fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_INTERRUPTED');
    }
    return launchRecord;
  } catch (primaryError) {
    let containmentError;
    try {
      if (bootstrapProcessGroupExists(child.pid)) await escalate('SIGTERM');
      if (escalationPromise !== undefined) await escalationPromise;
      if (bootstrapProcessGroupExists(child.pid)) {
        fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_OPERATOR_CONTAINMENT_FAILED');
      }
    } catch (error) {
      containmentError = error;
    }
    if (containmentError !== undefined) {
      throw new AggregateError(
        [primaryError, containmentError],
        'GREATER_REALM_PRODUCTION_BOOTSTRAP_OPERATOR_AND_CONTAINMENT_FAILED',
      );
    }
    throw primaryError;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    signalController.unbindGroup(child.pid);
    signalController.setForwarder(undefined);
  }
}

function cleanupCompletedBootstrapRunLocked(input, completedLaunchRecord) {
  const runStatus = lstatSync(input.runRoot, { bigint: true });
  const opened = readExactFile(launchRecordPath(input.runRoot), 16 * 1024, 0o600);
  let launchDigest;
  try {
    launchDigest = createHash('sha256').update(opened.bytes).digest('hex');
  } finally {
    opened.bytes.fill(0);
    closeSync(opened.descriptor);
  }
  const launchRecord = readLaunchRecord(input);
  if (
    launchRecord.phase !== 'complete'
    || canonicalLifecycleJson(launchRecord) !== canonicalLifecycleJson(completedLaunchRecord)
    || launchRecord.runDev !== runStatus.dev.toString()
    || launchRecord.runIno !== runStatus.ino.toString()
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_SELF_CLEAN_INVALID');
  if (launchRecord.childPid !== null) {
    const childState = bootstrapProcessIdentityState(
      launchRecord.childPid,
      launchRecord.childProcessStartIdentity,
    );
    if (
      childState === 'live-exact' || childState === 'live-uninspectable'
      || bootstrapProcessGroupExists(launchRecord.childPgid)
    ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_SELF_CLEAN_INVALID');
  }
  let chain = repairLaunchLifecyclePublications(input.runRoot);
  let latest = chain.records.at(-1);
  if (
    latest === undefined || latest.record.phase !== 'launch-installed'
    || latest.record.runDev !== runStatus.dev.toString()
    || latest.record.runIno !== runStatus.ino.toString()
    || [
      ['pid', launchRecord.pid],
      ['processStartIdentity', launchRecord.processStartIdentity],
      ['protectedMain', launchRecord.protectedMain],
      ['moduleTree', launchRecord.moduleTree],
      ['bootstrapBlob', launchRecord.bootstrapBlob],
      ['bootstrapSha256', launchRecord.bootstrapSha256],
      ['command', launchRecord.command],
      ['commandArgumentsSha256', launchRecord.commandArgumentsSha256],
    ].some(([key, value]) => latest.record[key] !== value)
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_SELF_CLEAN_INVALID');
  const adminRoot = dirname(dirname(input.runRoot));
  const blockerInspection = runBootstrapTreeHelper('blockers', adminRoot);
  if (!Array.isArray(blockerInspection.blockers)) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_SELF_CLEAN_INVALID');
  }
  if (blockerInspection.blockers.length !== 0) {
    return Object.freeze({
      outcome: 'retained-active-cutover-authority',
      runId: basename(input.runRoot),
      lifecycleRecordSha256: latest.digest,
      launchRecordSha256: launchDigest,
      blockers: Object.freeze([...blockerInspection.blockers].toSorted()),
    });
  }
  const inventory = runBootstrapTreeHelper('inventory', input.runRoot);
  if (
    inventory.state !== 'present' || inventory.rootDev !== runStatus.dev.toString()
    || inventory.rootIno !== runStatus.ino.toString()
    || typeof inventory.digest !== 'string' || !SHA256.test(inventory.digest)
  ) fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_SELF_CLEAN_INVALID');
  const confirmation = createHash('sha256').update(canonicalLifecycleJson(Object.freeze({
    domain: 'warpkeep-production-launch-current-owner-cleanup-v1',
    lifecycleRecordSha256: latest.digest,
    launchRecordSha256: launchDigest,
    treeInventorySha256: inventory.digest,
  }))).digest('hex');
  latest = publishLaunchLifecycleRecord(input.runRoot, nextLaunchLifecycleRecord(
    latest,
    'cleanup-prepared',
    Object.freeze({
      launchRecordSha256: launchDigest,
      cleanupConfirmationSha256: confirmation,
      cleanupTreeInventorySha256: inventory.digest,
      cleanupReason: 'completed-current-owner',
    }),
  ));
  if (runBootstrapTreeHelper('inventory', input.runRoot).digest !== inventory.digest) {
    fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LIFECYCLE_TREE_CHANGED');
  }
  latest = publishLaunchLifecycleRecord(
    input.runRoot,
    nextLaunchLifecycleRecord(latest, 'tree-removing'),
  );
  runBootstrapTreeHelper(
    'delete',
    input.runRoot,
    latest.record.runDev,
    latest.record.runIno,
  );
  latest = publishLaunchLifecycleRecord(
    input.runRoot,
    nextLaunchLifecycleRecord(latest, 'run-removed'),
  );
  latest = publishLaunchLifecycleRecord(
    input.runRoot,
    nextLaunchLifecycleRecord(latest, 'complete'),
  );
  compactLaunchLifecycleAuthority(input.runRoot, latest);
  return Object.freeze({
    outcome: 'cleaned',
    runId: basename(input.runRoot),
    cleanupConfirmationSha256: confirmation,
    treeInventorySha256: inventory.digest,
  });
}

async function cleanupCompletedBootstrapRun(input, completedLaunchRecord) {
  return withBootstrapLifecycleLock(
    input.runRoot,
    () => cleanupCompletedBootstrapRunLocked(input, completedLaunchRecord),
  );
}

export async function runGreaterRealmProductionBootstrap(inputArguments, dependencies = {}) {
  const signalController = createBootstrapSignalController();
  try {
    assertBootstrapEnvironment(dependencies.environment ?? process.env);
    const input = parseGreaterRealmProductionBootstrapArguments(inputArguments);
    const runRoot = attestCanonicalRunRoot(input.runRoot);
    let launchRecord = readLaunchRecord(input);
    if (launchRecord.phase !== 'launch-prepared') {
      fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_LAUNCH_RECORD_INVALID');
    }
    launchRecord = writeLaunchRecord(input, Object.freeze({
      ...launchRecord,
      phase: 'bootstrap-validating',
    }));
    const gitEnv = gitEnvironment(runRoot);
    const context = Object.freeze({ ...input, gitEnvironment: gitEnv });
    const runtime = attestRuntime(context, dependencies.spawnSync);
    materializeClone(context, dependencies.spawnSync);
    const treeBefore = attestClone(context, dependencies.spawnSync);
    const npm = npmEnvironment(context, runtime);
    installRootDependencies(
      context,
      runtime,
      { ...npm, npmCli: runtime.npmCli },
      dependencies.spawnSync,
    );
    // Import only after npm's integrity-bound, no-lifecycle installation and the
    // complete raw tracked-tree proof above.
    const yamlUrl = pathToFileURL(join(input.cloneRoot, 'node_modules', 'yaml', 'dist', 'index.js'));
    const { parse } = await import(yamlUrl.href);
    const lockBytes = readFileSync(join(input.cloneRoot, 'spacetimedb', 'pnpm-lock.yaml'));
    let packages;
    try {
      packages = selectGreaterRealmDarwinArm64ModulePackages(parse(lockBytes.toString('utf8')));
    } finally {
      lockBytes.fill(0);
    }
    await stageGreaterRealmModuleArchives({
      packages,
      cacheRoot: npm.moduleCache,
      fetchArchive: dependencies.fetchArchive,
    });
    const parserResolver = input.command.hermesReleaseRow === undefined
      ? undefined
      : installHermesSourceParserResolver(input.cloneRoot);
    const allowedIgnoredPaths = parserResolver === undefined
      ? Object.freeze(['node_modules/'])
      : HERMES_SOURCE_PARSER_IGNORED_PATHS;
    const treeAfter = attestClone(
      context,
      dependencies.spawnSync,
      allowedIgnoredPaths,
    );
    if (JSON.stringify(treeAfter) !== JSON.stringify(treeBefore)) {
      fail('GREATER_REALM_PRODUCTION_BOOTSTRAP_TREE_CHANGED');
    }
    launchRecord = writeLaunchRecord(input, Object.freeze({
      ...launchRecord,
      phase: 'operator-starting',
    }));
    if (parserResolver !== undefined) {
      attestHermesSourceParserResolver(input.cloneRoot, parserResolver);
    }
    launchRecord = await runOperatorWithPostflightAttestation(
      () => runFinalOperator(
        context,
        runtime,
        npm,
        signalController,
        dependencies.spawn,
        dependencies.operatorTimeouts,
      ),
      () => {
        if (parserResolver !== undefined) {
          attestHermesSourceParserResolver(input.cloneRoot, parserResolver);
        }
        attestClone(context, dependencies.spawnSync, allowedIgnoredPaths);
      },
    );
    runExact('/usr/bin/codesign', ['--verify', '--deep', '--strict', runtime.appRoot], {
      env: { PATH: '/usr/bin:/bin' }, spawnSync: dependencies.spawnSync,
      code: 'GREATER_REALM_PRODUCTION_BOOTSTRAP_RUNTIME_CHANGED',
    });
    npmTreeIdentity(runtime.sourceNpmRoot, false);
    npmTreeIdentity(runtime.stagedNpmRoot, true);
    launchRecord = writeLaunchRecord(input, Object.freeze({ ...launchRecord, phase: 'complete' }));
    const launchCleanup = await cleanupCompletedBootstrapRun(input, launchRecord);
    return Object.freeze({
      profile: PROFILE,
      protectedCommit: input.commit,
      moduleTreeId: input.tree,
      bootstrapBlob: input.bootstrapBlob,
      bootstrapSha256: input.bootstrapSha256,
      moduleArchiveCount: packages.length,
      command: input.commandName,
      launchCleanup,
    });
  } finally {
    signalController.dispose();
  }
}

export const greaterRealmProductionBootstrapTestSeams = Object.freeze({
  assertEnvironment: assertBootstrapEnvironment,
  attestHermesSourceParserResolver,
  cacheArchivePath,
  cleanupCompletedRun: cleanupCompletedBootstrapRun,
  containProcessGroup: containBootstrapProcessGroup,
  createSignalController: createBootstrapSignalController,
  finalOperatorEnvironment,
  gitBlobOid,
  installHermesSourceParserResolver,
  launchArgumentsDigest,
  parseLaunchRecord,
  parseLaunchLifecycleRecord,
  publishLaunchLifecycleRecord,
  readLaunchLifecycleChain,
  repairLaunchLifecyclePublications,
  runFinalOperator,
  runOperatorWithPostflightAttestation,
  runTreeHelper: runBootstrapTreeHelper,
  selectPackages: selectGreaterRealmDarwinArm64ModulePackages,
  withLifecycleLock: withBootstrapLifecycleLock,
});

async function main() {
  const receipt = await runGreaterRealmProductionBootstrap(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    const code = error instanceof GreaterRealmProductionBootstrapError
      ? error.code
      : 'GREATER_REALM_PRODUCTION_BOOTSTRAP_FAILED';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
