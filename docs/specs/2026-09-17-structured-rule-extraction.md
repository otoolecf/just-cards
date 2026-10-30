# TDD Spec: Structured rule extraction and behavioral review

## Intent
Transform source prose into the existing executable primitives through a shared, versioned contract. Distinguish engine correctness from fidelity to the source, and expose assumptions instead of silently advertising every import as playable.

## Scope and outcomes
- One described JSON schema for table policy and extraction, shared by prompts, runtime validation, HTTP and MCP resources.
- Strict model extraction of executable policies and complete card values, evidence, assumptions, ambiguities and unsupported mechanics. No generated code execution or implicit family fallback after model failure.
- Separate bounded source review and one repair attempt, with provider failure/refusal reported honestly.
- Deterministic actual-engine scenarios: legal/illegal transitions, atomicity, visibility, card conservation, independent scoring, seeded complete rounds at supported player counts, and replay.
- Persistent versioned report. Unsupported or failed policies cannot start rooms. Supported candidates needing review can be explicitly accepted as an immutable new ruleset after server revalidation.
- Website and MCP use the same pipeline and validation. Builtin presets and existing rooms remain usable.

## Outside scope
New engine families (trick taking, jokers, bidding, arbitrary code), automatic public deployment, an assertion that model review proves source fidelity, and a full visual rules editor.

## Acceptance and tests (red first)
- Schema rejects unknown keys, invalid types, impossible combinations and values; prompt/resource use the same schema object.
- A model can emit a supported policy from unfamiliar wording; configured AI is not bypassed by the heuristic parser.
- Unsupported rules, fabricated evidence, refusal, invalid JSON and reviewer contradictions never become silently playable.
- Behavioral harness is deterministic and bounded, completes rounds, records coverage and fails invalid policy/score inputs; scores checked without engine scorer.
- Reports survive storage and appear in imports and saved draft views; review acceptance cannot override hard failures or stale reports.
- MCP session and server routes return the same report shape and validation gate.
- Focused browser test covers review before starting a room; full unit suite, check and build pass.

## Data and invariants
Canonical stored payload remains runtime-bundle/v1 with optional generationReport. New reports bind to executable policy and scoring values. No SQL migration needed. Source is untrusted data; quotations must occur in supplied text. Provider calls are bounded and abortable. Only declarative JSON is accepted. Human acknowledgement is explicit and immutable; behavioral failure and unsupported mechanics cannot be waived.

## Rollback
Use builtin presets or previously saved rooms. New imported drafts remain inspectable without enabling room creation. Revert extraction integration without altering event logs or stored room snapshots.

## WebSocket disconnect handling

Hibernating sockets can report reserved close status 1005, which cannot be sent
in a close frame. Normalize reserved close codes before responding. Browser import
waits must allow bounded model latency.
