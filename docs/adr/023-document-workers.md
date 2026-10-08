# 023: Bounded document workflows in isolated workers

Accepted for the phase 2 implementation, 9 October 2026. Builds on [ADR 022](022-background-agents.md).

## Decision

Retain Chromium for UTF-8 text/Markdown-source printing. Add pinned **pdf-lib 1.17.1** for supported PNG/JPEG embedding and structural optimization of plain PDFs in a fresh Electron utility process per job. Keep the durable service, approvals, generation fencing and artifact journal shared across both executors. Custom helpers select an existing workflow and frozen settings; briefs do not create arbitrary capabilities.

This ships useful document tasks without requiring a native converter installation. Structural optimization is deliberately narrow: use object streams, reparse, compare page geometry/rotation and raw non-structural stream hashes, select only a smaller candidate, and otherwise copy the original. Report measured sizes and unmet targets instead of implying a guaranteed compression ratio. pdf-lib exposes the relevant object-stream and appearance options in its [SaveOptions API](https://pdf-lib.js.org/docs/api/interfaces/saveoptions).

## Alternatives and boundaries

Chromium is already packaged and useful for text layout, but printing an imported PDF would rasterize or reconstruct it and does not establish preservation. Keep it for text only. pdf-lib allows unchanged content/image streams and a small JavaScript dependency footprint, but its permissive parser and lack of broad repair/optimization guarantees require conservative admission and fixture gates. A native PDF adapter can follow if a wider corpus establishes quality, dependency distribution and installer impact. Do not replace unsupported PDF features by flattening them silently.

Office conversion remains gated. Detecting LibreOffice on the machine is not sufficient evidence for fidelity, installation, fonts, lifecycle control or protected-file handling. Image downsampling and Office package compression likewise need separate quality targets before enabling them. These exclusions are visible in the panel and operating guide.

## Execution and trust

Native selection reads bounded bytes and rejects unsupported content before returning opaque grants. A run transaction freezes encrypted binary snapshots separately from its small progress record. No user path enters the renderer or document worker. Execution rechecks the source hash. Workflow, target, agent revision, style and inputs are part of new approval bindings; the legacy text-only binding remains compatible with pending v1 runs.

Parsing and rewriting happen outside the main/UI event loops. Electron [utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process) supports a Node child, message ports, environment/argument options, process metrics and termination. Kite uses one binary job at a time, a 30-second deadline, a 256 MB JavaScript heap setting and a sampled 512 MB working-set threshold. Kill after each result and on cancellation/shutdown, including cancellation before the child has emitted `spawn`.

This process has Node and OS user privileges: it is **not** an OS sandbox. The implementation supplies bytes and typed actions only, does not evaluate document code, and gives the child no provider credentials. Format limits and process termination reduce routine fault impact; they do not prove containment of a compromised parser. An OS-restricted native adapter remains a separate hardening decision.

Admission rejects encryption, signatures, forms, nonempty annotations, active actions/scripts, attachments and layers. Bound file size, page count, image dimensions, object count and nesting. Supported PNGs verify chunk lengths/CRC and reject unsupported color/animation/orientation metadata. Copy image bytes into an independent typed-array backing buffer before embedding: pdf-lib's JPEG reader otherwise sees Node pooled-buffer offsets incorrectly.

## Preview and publication

Artifacts retain SHA-256, measured size and verified page counts from the binary parser; compressed object streams cannot be counted with a raw `/Page` regular expression. Legacy Chromium output keeps its earlier structural checker. Journal the optimization report with the prepared output so crash recovery reconstructs identical reporting without a duplicate file. Preview/export recheck the full byte buffer after reading it.

Preview uses a separate Chromium session, sandbox/context isolation, no preload/Node, denied permissions/downloads/popups/navigation, and blocked external requests. A local HTTPS protocol handler serves only one tokenized immutable buffer. It never connects to DNS or a server. Session-local protocol handling is supported by Electron's [protocol API](https://www.electronjs.org/docs/latest/api/protocol). Allow Chromium's internal PDF-extension resources and `chrome://resources/`; otherwise the viewer opens a blank window. The viewer requires JavaScript, while document actions/scripts are rejected by admission. Limit open previews to three. Windows default-app opening has the receiving app's own trust boundary.

## Packaging and licenses

Add one pinned direct dependency and four unique transitive packages: `@pdf-lib/standard-fonts@1.0.0`, `@pdf-lib/upng@1.0.1`, `pako@1.0.11` and `tslib@1.14.1`. Nested copies can repeat. Runtime license files remain inside packaged modules and an aggregate [notice file](../../assets/document-engine-notices.txt) ships with assets. pdf-lib, standard-fonts and upng use MIT; pako uses MIT/Zlib; tslib uses 0BSD. These are dependency distribution records, not a legal opinion. [pdf-lib upstream license](https://github.com/Hopding/pdf-lib/blob/master/LICENSE.md).

Build `documentWorker.js` beside main. Resolve each packaged dependency from its actual parent using `createRequire`; Forge's config loader ignored the earlier `require.resolve` paths option and copied a different pako version. The same correction resolves the existing MathJax dependency tree accurately, so native/whiteboard packaging smoke checks are part of validation. Health checks report a missing worker/library without disabling text printing.

## Evidence and remaining work

[Packaged results](../performance/background/phase2.json) confirm the actual Windows worker and dependency versions, conversion/optimization, no-growth fallback, explicit rejection, visible offline preview, source preservation and zero workflow model calls. [Independent fidelity](../performance/background/phase2-fidelity.json) checks strict parsing, all output rendering, identical boxes/text and zero changed Poppler pixels on 15 optimized pages; PNG pixels/alpha and JPEG compressed streams remain identical. The fixture corpus is synthetic and bounded.

Native integration also covers encrypted binary snapshots, changes to originals after selection, batch work, in-flight cancellation, restart and publication recovery, and v1 schema migration preserving pending requests/helper revisions. The bundled UI checks actual preview pixels, reveal and exclusive export rather than only window creation.

Retain broader real-world document/font fixtures, repeated-run memory, live voice/overlay latency and identical-baseline installer delta as open gates. Probe timing and memory samples run without the companion/providers and do not establish those product performance claims. No Office, mail, browser or application-submission release is implied.
