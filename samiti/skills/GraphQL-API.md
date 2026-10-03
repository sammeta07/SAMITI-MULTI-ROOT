# Skill: GraphQL API Generator & Modifier (SAMITI-MULTI-ROOT)

## System Role & Responsibilities
You are a full-stack engineer working on the `SAMITI-MULTI-ROOT` monorepo. Your objective is to design, modify, or extend GraphQL APIs across both backend and frontend environments while strictly adhering to repository conventions and validation steps.

---

## Technical Stack Context
- **Monorepo:** SAMITI-MULTI-ROOT
- **Backend Environment (`BE2/`):** TypeScript, GraphQL, MySQL (`query`/`execute` from `BE2/src/config/db`)
- **Frontend Environment (`samiti/`):** Angular, GraphQL Services (`POST` to `environment.graphqlUrl` with `{ withCredentials: true }`)

---

## Standard Operating Procedures (SOP)

### 1. Backend Implementation Rules (`BE2/`)

#### A. New GraphQL API Module Creation
When creating a brand-new GraphQL API:
1. Create a new file under `BE2/src/graphql/<domain>/<kebab-case-name>.graphql.ts`.
2. Export exactly 4 items using lowerCamelCase named prefixes:
   - `<name>Types` (Type definitions as a template string)
   - `<name>QueryFields` (Query definitions as a template string)
   - `<name>MutationFields` (Mutation definitions as a template string)
   - `<name>Resolvers` (Object containing `{ Query: { ... }, Mutation: { ... } }`)
3. Ensure resolver functions follow the exact signature: `async method(_: any, args: { ... }, context: any)`.
4. **Authentication Logic:**
   - Extract token from `context.headers.authorization` (strip `Bearer `) or `context.cookies.token`.
   - Verify token using `context.jwt.verify`.

#### B. Module Registration (`BE2/src/graphql/samiti-graphql.ts`)
Register every new module across these 5 required points:
1. Import the module exports.
2. Add `<name>Types` to the `typeDefs` template string.
3. Add `<name>QueryFields` inside `type Query { }`.
4. Add `<name>MutationFields` inside `type Mutation { }`.
5. Spread `<name>Resolvers.Query` and `<name>Resolvers.Mutation` into the main `resolvers` object.

#### C. Database & Field Modifications
- **Database Migrations:** Create SQL scripts inside `BE2/src/migrations/` and register them in `BE2/run-migration.ts`.
- **Extending Existing Types:**
  - Update the GraphQL schema type definition.
  - Update SQL `SELECT` queries (explicitly alias `snake_case` DB columns to `camelCase` using `AS`).
  - Update internal node objects.
  - Update the `serializeNode` transformer function (`?? null` for optional fields, `Boolean(row.field)` for booleans).

#### D. Backend Verification
Execute the type-check command before proceeding:
```bash
cd BE2 && npx tsc -p tsconfig.json --noEmit