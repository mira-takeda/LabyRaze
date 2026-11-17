# Private release preparation

- [ ] Confirm the Kiroween submission rules, deadlines and source licence requirement.
- [ ] Clear the provisional LABYRAZE title and approve the independent mascot concept.
- [ ] Resolve current Kiro-derived art rights or replace the art after approval.
- [ ] Record Flow provider/model, generation date, applicable terms and music redistribution rights.
- [ ] Select separate permissions for artwork and music; review LICENSE-SCOPE.md.
- [ ] Review THIRD-PARTY-NOTICES.md and retain it with the browser build.
- [ ] Review the sanitized public-source export, including metadata and historical evidence.
- [ ] Verify `docs/verification/latest.json` contains actual successful required gates and no required skips.
- [ ] Audition both soundtrack codecs and their loop seam on the supported browsers/devices.
- [ ] Recheck dependency advisories when network access is available; dev dependencies are not risk-free.
- [ ] Create a clean public-history root from the reviewed export. Keep local recovery history private.
- [ ] Obtain explicit authorization before creating/pushing a remote or publishing a release.

No publication, visibility change, remote creation or release upload is performed by the tools.
`npm run release:export` prepares a local sanitized source tree only. It retains the full `.kiro/`
tree, redacting the original machine path in the export while leaving the working evidence intact.
The historical baseline bytes and experimental measurements remain unchanged.

Suggested first public commit (only after rights clearance and authorization): initialize Git
inside the reviewed export, add the files, commit with the owner's chosen author identity, then
review the staged content before adding any remote. The present workspace's `.git` may be blocked
by managed filesystem permissions; recovery files under `.release-local/` remain available locally.
