# TDD Spec: mcp-server-scaffold-and-skill-orchestration

_Status: Completed_  
_Owner: Connor + agents_  
_Date: 2026-02-19_

## 1) Intent

Add an internal MCP scaffold that exposes Just Cards capabilities as tools/resources, supports model-source routing for rules generation (`session` vs `server`), and introduces skill orchestrators that use MCP tools without direct DB/network side effects.

## 2) In Scope

1. Create a new `src/lib/mcp` module with:
- tool registry and tool dispatcher,
- resource registry and resource reader,
- lightweight game-session state store for MCP gameplay tools.

2. Expose tools:
- `generate_ruleset`
- `validate_ruleset`
- `list_rulesets`
- `get_ruleset`
- `start_game`
- `get_game_state`
- `submit_move`
- `suggest_move`

3. Expose resources:
- primitives KB docs snapshots
- JSON schemas
- example rule bundles
- live ruleset snapshots
- live game snapshots

4. Model-source routing in `generate_ruleset` tool:
- default `model_source = "session"` using injectable session sampler
- fallback `model_source = "server"` using backend generation pipeline
- deterministic fallback when sampling/model path fails

5. Skill orchestrators that call MCP tools only:
- `ruleset-extractor-skill`
- `ruleset-repair-skill`
- `gameplay-agent-skill`

## 3) Out of Scope

1. External MCP transport hosting/deployment wiring.
2. Production auth for remote MCP clients.
3. Multiplayer authoritative room service migration to Durable Objects.

## 4) Expected Outcomes

1. MCP layer can be used as a single contract surface for chat clients.
2. `generate_ruleset` can prefer in-session model sampling while preserving robust fallback behavior.
3. Skill modules orchestrate tool flows and remain side-effect free except through MCP tools.
4. Basic game loop can be started/read/mutated/suggested through MCP calls.

## 5) Acceptance Criteria

- [x] tool list contains all required tool names.
- [x] resource list contains required static + live resources.
- [x] default generation path attempts session sampling and falls back safely.
- [x] server model path works when explicitly requested.
- [x] deterministic fallback path returns serviceable ruleset when model steps fail.
- [x] start/get/submit/suggest gameplay tools work against stored rulesets.
- [x] skill modules call tools in expected sequence and do not import ruleset/game stores directly.

## 6) Test Plan (Red -> Green)

1. Add failing MCP server tests for tool/resource contracts and generation routing behavior.
2. Add failing gameplay tool tests for start/get/submit/suggest loop.
3. Add failing skill tests validating orchestration order and fallback strategy.
4. Implement minimal MCP scaffold and skills.
5. Run targeted tests, then full `npm test`, `npm run check`, `npm run build`.

## 7) Planned Files

- `/Users/ConnorO/git_repos/just-cards/src/lib/mcp/server.ts`
- `/Users/ConnorO/git_repos/just-cards/src/lib/mcp/server.test.ts`
- `/Users/ConnorO/git_repos/just-cards/src/lib/mcp/types.ts`
- `/Users/ConnorO/git_repos/just-cards/src/lib/mcp/game-store.ts`
- `/Users/ConnorO/git_repos/just-cards/src/lib/mcp/skills/ruleset-extractor-skill.ts`
- `/Users/ConnorO/git_repos/just-cards/src/lib/mcp/skills/ruleset-repair-skill.ts`
- `/Users/ConnorO/git_repos/just-cards/src/lib/mcp/skills/gameplay-agent-skill.ts`
- `/Users/ConnorO/git_repos/just-cards/src/lib/mcp/skills/skills.test.ts`
- `/Users/ConnorO/git_repos/just-cards/docs/specs/2026-02-19-mcp-server-scaffold-and-skill-orchestration.md`
- `/Users/ConnorO/git_repos/just-cards/docs/README.md`

## 8) Verification Checklist

- [x] Spec written first
- [x] Failing tests added
- [x] Minimal implementation passes tests
- [x] Docs updated for contract changes
- [x] `npm run check` passes
- [x] `npm run build` passes
