# Phase 2 New York data-alpha gate

**Status:** Guided runner implemented; live source run and reviewer acceptance pending

WP-201 through WP-210 provide the connector/rights SDK, bounded ingestion, canonical model, reversible resolution, deterministic camping evaluator, official New York and secondary source definitions, and reproducible public-pack prototype. Their deterministic local acceptance cases pass, but implementation alone does not accept the phase.

Follow the [Phase 2 guided acceptance procedure](PHASE_2_GUIDED_ACCEPTANCE.md). The single command binds evidence to a clean commit, runs the local acceptance surface, probes all official registrations without bulk downloads, and prepares a reviewer-controlled proposal. The authoritative state is `config/phase2-gate.json`; it remains blocked until a passing live report is reviewed and explicitly recorded.

The gate does not permit waiving the Phase 2 stop conditions. Phase 3 still owns production basemap compilation, complete production-pack construction, offline explore/search, catalog activation, and field-beta behavior.
