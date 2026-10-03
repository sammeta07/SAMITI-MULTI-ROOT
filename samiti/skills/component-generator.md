# Skill: Angular Component & Service Generator (SAMITI-MULTI-ROOT)

## System Role & Responsibilities
You are a full-stack Angular engineer working on the `samiti/` app in the `SAMITI-MULTI-ROOT` monorepo. Your objective is to create a complete, fully tested, and end-to-end integrated UI component and state/data layer following exact project patterns.

---

## Technical Stack & Target Paths
- **Frontend App Root:** `samiti/`
- **Target Directories:**
  - Components: `samiti/src/app/components/<domain>/<kebab-case-name>/`
  - Models: `samiti/src/app/models/<domain>/<kebab-case-name>.models.ts`
  - Services: `samiti/src/app/services/<domain>/<kebab-case-name>.service.ts`

---

## File Creation Requirements

When asked to create a new component, generate all **7 essential files** in a structured and fully implemented manner (no empty placeholders or `// TODO`s):

1. **HTML Template (`<kebab-name>.component.html`)**
   - Clean, semantic HTML with proper Angular structural directives (`*ngIf`, `*ngFor`, etc. or modern `@if`, `@for`).
2. **TypeScript Component (`<kebab-name>.component.ts`)**
   - Import required services, models, and RxJS operators.
   - Inject dependencies via standard constructor/`inject()` pattern.
   - Implement lifecycle hooks (e.g., `OnInit`, `OnDestroy`) and clean up subscriptions using `Subject` + `takeUntil` or Signals.
3. **Styles (`<kebab-name>.component.scss`)**
   - Component-scoped SCSS matching the design tokens/variables of the `samiti/` workspace.
4. **Data Models (`<kebab-name>.models.ts`)**
   - TypeScript interfaces/types defining API payloads, query responses, and component state.
   - Strictly declare required (`field: T`) vs optional (`field?: T | null`) properties.
5. **Data Service (`<kebab-name>.service.ts`)**
   - Angular `@Injectable()` service to communicate with the GraphQL BE2 backend.
   - Send `POST` requests to `environment.graphqlUrl` with `{ withCredentials: true }`.
   - Parse response using `.pipe(map(res => res.data.<fieldName>))`.
6. **Component Unit Test (`<kebab-name>.component.spec.ts`)**
   - `TestBed` setup with Angular Testing Utilities, mock providers, and component initialization tests.
7. **Service Unit Test (`<kebab-name>.service.spec.ts`)**
   - Unit tests using `HttpClientTestingModule` or mock Apollo/GraphQL client to test request building and response mapping.

---

## Step-by-Step Generation Workflow

### Step 1: Define Model & Service Layer First
- **`*.models.ts`**:
  ```typescript
  export interface I<PascalName>Node {
    id: string;
    name: string;
    status: string;
    isOptional?: boolean | null;
  }