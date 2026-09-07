# Native release input verification — 2026-09-07

Both commands completed successfully against the same independently captured
source, before the signer observer repair:

- Commit: `f342b4aaffc17ab41cd33d29cd0a07f5772e32e4`
- Tree: `b1f711e73e21ba513121ccfaa1d6037dd8e91552`
- Profile: `warpkeep-spacetime-binding-final-preparation-linux-x64-v1`

These are credential-free local build/compatibility results, not production
observations, installed generated bindings, or a final release freeze.

## All-realm binding runtime

From the Windows checkout, ran the fixed runtime in Ubuntu-24.04 with an empty
inherited environment and pinned Linux Node 22.22.3:

```powershell
wsl -d Ubuntu-24.04 -- /usr/bin/env -i HOME=/home/snapmeter PATH=/home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin:/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC /home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/scripts/local-binding-runtime.mjs --all-realms
```

Session 65338 exited 0. Its fixed parent checked G001 current binding equality,
G001 freeze compatibility and paired G002/PTR generation under one source
identity. Counts returned: G001 **180**, G002 **50**, PTR **25**.

| Output | SHA-256 |
| --- | --- |
| G001 current bundle | `7811ce8485cb101e9bd864ca801ade3823353389832921554c757a847d8cf48a` |
| G001 baseline compatibility bundle | `179103343455b16a02cbb55205e867c6d4590cf7e9bb614c611d91f15e215801` |
| G001 frozen compatibility bundle | `a2d7f204ed591aadb98696225d68332ee573519187e0989e68f528da8064cd49` |
| G001 baseline descriptor | `cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03` |
| G001 frozen descriptor | `cf3cbfff9087c04bd9de553410adb49100c40dbdecebc59e265f83cb904dd04d` |
| G002 bundle | `0037a0979a460aea8607a36fccd649d4311046925faeb3d8186276ac0a6ccbd3` |
| PTR bundle | `c5c2cc46d428e85c87352c341d1a5235a69336a960f566b0a91a484deba3ec4e` |

Compatibility explicitly checked the frozen writers `admin_allow_fid`,
`admin_admit_founder_v1`, `admin_disable_fid`, `admin_bump_auth_epoch`,
`access_request_submit_v1`, and `admin_reset_access_request_v1`.

## Four native operation bundles

```powershell
& .git/ci-node-22.22.3/node.exe scripts/local-operation-bundle-runtime.mjs
```

Session 77042 exited 0. Each bundle passed the fixed twice-build comparison
and native load check, returning its exact two lane exports and expected
invalid-input factory rejection.

| Lane | Bytes | Bundle SHA-256 |
| --- | ---: | --- |
| activation | 143788 | `957f4123cc368ac3c57c48d54560055895e6612df7320dabe53b5501c0acae5b` |
| g001 | 117977 | `c6e56b3114bfead0c0f67ba5e4bc04b6af3679d80585969df594658b933b5a63` |
| g002 | 482695 | `7d5686f44ab8ec4f07947f75709dd77f72f42ac343d6277376808ad1d3b051e2` |
| ptr | 483730 | `dd0529b3bc58b9a276cb24664a49c8759d22462ac0b3a9a7101a82062c828724` |

## Remaining work

Read-only source-pin and inventory derivation also succeeded locally: two
source-pin outputs and seven inventory/count outputs, with **1,077** derived
closure members. None was installed; this is an observed count, not a new pin.

R11–R13 remain incomplete. These results clear native input checks for the
recorded snapshot only. The complete candidate installer, full generated
consumer family, convergence/recovery checks, unfinished activation authority,
Linux production execution contracts and final source freeze remain required.
The CLI summaries do not retain generated bodies for later installation;
the final assembler must derive them from its own single source snapshot.
