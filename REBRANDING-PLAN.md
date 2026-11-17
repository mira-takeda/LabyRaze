# LABYRAZE identity preparation — not yet applied

The game still displays KiroBit. LABYRAZE is provisional pending availability, trademark and
hackathon-rule checks. No artwork or gameplay has been replaced.

## Proposed character: a living maze lantern

A compact, six-sided copper lantern with a turquoise light core, a short narrow handle and
two small asymmetric metal fins. Its expression comes from the light aperture, rather than
the white domed body and paired oval eyes of the Kiro reference. The silhouette is geometric
and mechanically constructed. No ghost skirt, mascot tracing or third-party reference art.
Working description: “the lantern that finds lost lights.” The name can be chosen later.

Fit it inside the existing **18 x 24** sprite canvas and existing movement/collision bounds.
Use the current animation slots for a two-frame glow/flicker; preserve facing adaptation,
captives, ally colour variants, timing, scale and the fixed Workshop palette. Approval of
this concept is required before drawing, generating or replacing any artwork.

## Safe sequence

1. Clear LABYRAZE and the final character/name for intended markets; verify Kiroween terms.
2. Approve a character sketch and asset licence. Create original pixel arrays only after approval.
3. Change visible product text, title, favicon and default character art in one isolated change.
   Keep historical Kiro/Kiroween attribution and all `.kiro/` evidence.
4. Keep all existing localStorage keys (`kirobit.*`), skin IDs, import tag and internal `kiro`
   character kind. Existing skins, scores, settings and cheats must load without migration.
   Relabel Workshop display text separately from its data format.
5. Keep the keyboard sequences and `CLASSIC_ARCADE_CODE` identifier unchanged. Keep legacy
   compatibility identifiers internal; commercial marketing must not depend on Kiro or Konami.
6. Run rendering, Workshop import/storage, cheat, audio, gameplay and production smoke checks.
   Compare protected gameplay files and defaults. No AI, difficulty or balance retuning.

GPL code licensing does not grant mascot or music rights. See LICENSE-SCOPE.md and RELEASE-AUDIT.md.
