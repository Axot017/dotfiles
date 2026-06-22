---
name: codebase-memory
description: "Use the codebase knowledge graph for structural code queries. Triggers on: explore the codebase, understand the architecture, what functions exist, show me the structure, who calls this function, what does X call, trace the call chain, find callers of, show dependencies, impact analysis, dead code, unused functions, high fan-out, high fan-in, refactor candidates, code quality audit, graph query syntax, Cypher query examples, edge types, how to use search_graph."
---

# Codebase Memory — Knowledge Graph Tools

Graph tools return precise structural results in ~500 tokens vs huge grep dumps. Prefer them for definitions, call relationships, architecture, dependencies, impact analysis, and quality audits.

## Tool Names in Pi

Use the direct Pi tools named `codebase_memory_mcp_*`:

- `codebase_memory_mcp_index_repository`
- `codebase_memory_mcp_index_status`
- `codebase_memory_mcp_list_projects`
- `codebase_memory_mcp_delete_project`
- `codebase_memory_mcp_search_graph`
- `codebase_memory_mcp_search_code`
- `codebase_memory_mcp_trace_path`
- `codebase_memory_mcp_detect_changes`
- `codebase_memory_mcp_query_graph`
- `codebase_memory_mcp_get_graph_schema`
- `codebase_memory_mcp_get_code_snippet`
- `codebase_memory_mcp_get_architecture`
- `codebase_memory_mcp_manage_adr`
- `codebase_memory_mcp_ingest_traces`

## Quick Decision Matrix

| Question | Tool call |
|----------|-----------|
| Is this repo indexed? | `list_projects`, then `index_status(project=...)` |
| Index/update this repo | `index_repository(repo_path=".", mode="fast"|"moderate"|"full")` |
| Architecture overview | `get_architecture(project=...)` |
| What node/edge types exist? | `get_graph_schema(project=...)` |
| Find functions/classes/routes by words | `search_graph(query="...")` |
| Find by exact/regex name | `search_graph(name_pattern=".*Name.*")` |
| Find source text/literals | `search_code(pattern="...")` |
| Read exact symbol source | `search_graph(...)` then `get_code_snippet(qualified_name="...")` |
| Who calls X? | `trace_path(function_name="X", direction="inbound")` |
| What does X call? | `trace_path(function_name="X", direction="outbound")` |
| Full call context | `trace_path(function_name="X", direction="both")` |
| Data flow for a parameter | `trace_path(mode="data_flow", parameter_name="...")` |
| Cross-service call chain | `trace_path(mode="cross_service")` or `query_graph` |
| Complex graph aggregation | `query_graph` with Cypher |
| Impact of local changes | `detect_changes()` |
| Risk-classified trace | `trace_path(risk_labels=true)` |
| Dead code candidates | `search_graph(max_degree=0, exclude_entry_points=true)` |

## Exploration Workflow

1. `codebase_memory_mcp_list_projects` — check if the project is indexed.
2. If missing/stale: `codebase_memory_mcp_index_repository(repo_path=".", mode="fast")`.
   - Use `mode="moderate"` or `mode="full"` when semantic search or similarity edges are needed.
   - Use `persistence=true` when creating a shareable `.codebase-memory/graph.db.zst` artifact.
3. `codebase_memory_mcp_get_architecture(project=...)` — get packages, services, dependencies, clusters.
4. `codebase_memory_mcp_get_graph_schema(project=...)` — verify labels, relationships, and properties.
5. `codebase_memory_mcp_search_graph(project=..., query="...")` or `name_pattern="..."` — find exact symbols.
6. `codebase_memory_mcp_get_code_snippet(project=..., qualified_name="...")` — read source after finding the exact `qualified_name`.

## Tracing Workflow

1. `search_graph(name_pattern=".*FuncName.*", label="Function")` — discover exact name/qualified name.
2. `trace_path(function_name="FuncName", direction="both", depth=3)` — trace callers/callees.
3. If tracing value movement: `trace_path(mode="data_flow", parameter_name="param")`.
4. If tracing service boundaries: `trace_path(mode="cross_service")` and/or Cypher over `HTTP_CALLS` / `ASYNC_CALLS`.
5. `detect_changes(project=..., scope="...", depth=2)` — map git diff to affected symbols.

## Quality Analysis

### Dead Code

Use degree-zero non-entry symbols as candidates:

```text
search_graph(max_degree=0, exclude_entry_points=true)
```

### High Fan-Out

Use Cypher for directional degree:

```cypher
MATCH (f:Function)-[:CALLS]->(callee)
WITH f, count(callee) AS fanout
WHERE fanout >= 10
RETURN f.qualified_name, f.file_path, fanout
ORDER BY fanout DESC
LIMIT 50
```

### High Fan-In

```cypher
MATCH (caller)-[:CALLS]->(f:Function)
WITH f, count(caller) AS fanin
WHERE fanin >= 10
RETURN f.qualified_name, f.file_path, fanin
ORDER BY fanin DESC
LIMIT 50
```

### Hot Paths / Complexity

Functions and methods may expose: `complexity`, `cognitive`, `loop_count`, `loop_depth`, `transitive_loop_depth`, `linear_scan_in_loop`, `alloc_in_loop`, `recursion_in_loop`, `unguarded_recursion`, `param_count`, `max_access_depth`.

```cypher
MATCH (f:Function)
WHERE f.transitive_loop_depth >= 3 OR f.linear_scan_in_loop >= 1 OR f.unguarded_recursion = true
RETURN f.qualified_name, f.file_path, f.transitive_loop_depth, f.linear_scan_in_loop, f.unguarded_recursion
ORDER BY f.transitive_loop_depth DESC
LIMIT 50
```

## Search Patterns

### `search_graph`

Use for structural discovery. Helpful parameters:

- `query="update settings"` — BM25 full-text with camelCase splitting and structural boosting.
- `label="Function"|"Method"|"Class"|"Route"` — narrow by node type.
- `name_pattern=".*Handler.*"` — regex against names.
- `qn_pattern=".*pkg.*Handler.*"` — regex against qualified names.
- `file_pattern=".*src/.*"` — narrow by file path.
- `relationship="CALLS"`, `min_degree=10`, `max_degree=0` — filter nodes by relationship degree.
- `semantic_query=["publish","message"]` — vector search; requires moderate/full index; must be an array.
- `limit` and `offset` — paginate when `has_more=true`.

### `search_code`

Use for text/literal search enriched by graph context. It deduplicates to containing functions and ranks definitions/popular code over tests.

- Default mode is compact signatures.
- Use `mode="full"` for source or `mode="files"` for paths only.
- Default limit is 10; raise `limit` or narrow with `path_filter` because there is no offset.

## Cypher Examples for `query_graph`

```cypher
MATCH (a)-[r:HTTP_CALLS]->(b)
RETURN a.name, b.name, r.url_path, r.confidence
LIMIT 20
```

```cypher
MATCH (f:Function)
WHERE f.name =~ '.*Handler.*'
RETURN f.qualified_name, f.file_path
LIMIT 50
```

```cypher
MATCH (a)-[:CALLS]->(b)
WHERE a.name = 'main'
RETURN b.name, b.qualified_name, b.file_path
LIMIT 50
```

```cypher
MATCH (f:Function)
OPTIONAL MATCH (caller)-[:CALLS]->(f)
OPTIONAL MATCH (f)-[:CALLS]->(callee)
RETURN f.qualified_name, count(DISTINCT caller) AS fanin, count(DISTINCT callee) AS fanout
ORDER BY fanin DESC, fanout DESC
LIMIT 50
```

## Edge Types

Common relationships:

`CALLS`, `HTTP_CALLS`, `ASYNC_CALLS`, `IMPORTS`, `DEFINES`, `DEFINES_METHOD`, `HANDLES`, `IMPLEMENTS`, `OVERRIDE`, `USAGE`, `FILE_CHANGES_WITH`, `CONTAINS_FILE`, `CONTAINS_FOLDER`, `CONTAINS_PACKAGE`.

Confirm actual labels/edges with `get_graph_schema(project=...)` before writing complex Cypher.

## Gotchas

1. `search_graph(relationship="HTTP_CALLS")` filters nodes by degree; it does not return actual edge rows. Use `query_graph` to inspect edges and edge properties.
2. `search_graph` default limit is 200. Always check `has_more`; paginate with `offset`.
3. `search_code` default limit is 10 and has no offset; narrow or raise `limit`.
4. `query_graph` has no pagination and a hard 100k row ceiling. Add `LIMIT` and use `max_rows`.
5. `trace_path` works best with exact names. Use `search_graph` first when names are ambiguous.
6. `direction="outbound"` only shows callees; use `direction="both"` for full context.
7. For cross-repo links, first index target projects, then run `index_repository(mode="cross-repo-intelligence", target_projects=["*"])` on the source repo.
