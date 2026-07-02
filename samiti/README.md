## 🛠️ Tech Stack & Role Setup
- **Frontend:** Angular
- **Backend:** Fastify (Node.js) - Chosen for high performance and native JSON schema validation.
- **Database:** MySQL
- **AI Collaborator Email:** hariprasad8976@gmail.com

---

## 👤 1. System Access & Roles Hierarchy

The application enforces a strict, multi-level role boundaries mapping:

1. **App Base Level:**
   - `AUTH_USER`: Any standard registered user who logs into the app.
2. **Group Level:**
   - `GROUP_MEMBER`: A user whose request to join a specific group has been approved by an admin.
   - `GROUP_ADMIN`: The creator of the group, as well as any approved `GROUP_MEMBER` promoted to admin by an existing admin. All admins hold equal management powers.
3. **Event Level:**
   - There is **no** `EVENT_CREATOR` role. Inside an event, users hold specific governance designations: **`ADHYAKSH`**, **`UPADYAKSH`**, **`CASHIER`**, or **`SACHIV`**.

---

## 🔁 2. Join Request & Escalation Workflows

### Group-Level Pipeline:
- An `AUTH_USER` sends a "Join Request" to a group from the UI.
- Any current `GROUP_ADMIN` can mark the request as **ACCEPTED**, **REJECTED**, or **PENDING**.
- On **ACCEPTED**, the user is written into the database as a `GROUP_MEMBER`.
- A `GROUP_ADMIN` can later promote a `GROUP_MEMBER` to a `GROUP_ADMIN`.

### Event-Level Pipeline:
- A `GROUP_MEMBER` cannot be assigned an event designation directly.
- They must explicitly submit a request to join/participate in a specific event.
- Once accepted by the event handlers, they become an active event member and can be designated a post (e.g., `CASHIER`).

---

## 📅 3. Event Internal Structure: Programs vs Tasks

Inside any given Event, data splits into two entirely separate realms:

### A. Programs (Public-Facing Stream)
- **Visibility:** Rendered on the Home Page's right section/live feed for the public.
- **Access Control:** Can **only** be Created, Edited, or Deleted by the event **`ADHYAKSH`**.
- **Required Data:** Program Type, Location Coordinates (Latitude & Longitude), and Photos are strictly mandatory.
- **UI Binding:** The `type` field dynamically binds as label names in Angular's `mat-tab` navigation components.

### B. Tasks & Child Tasks (Internal Operational Stream)
- **Visibility:** Hidden from the public feed; visible only inside the management Dashboard.
- **Structure:** Hierarchical parent-child mapping (e.g., Main Task: Pandal Fabrication ➔ Child Task: Bamboo Binding).
- **The OWNER Rule:** Every task/child task must have a single designated `OWNER` responsible for execution.
- **Strict Security Constraint:** The `OWNER` **must** be an approved member of that specific event (whose event join request was accepted). Random group members cannot own event tasks.

---

## 🔐 4. Core Security Middleware
- **`checkGroupAdmin`**: A Fastify preHandler gatekeeper. Whenever a group or event modification request arrives, this middleware queries the database to confirm if the executing user's ID maps as a `GROUP_ADMIN` for that specific `group_id`. If unauthorized, it immediately terminates the process with a `403 Forbidden` response without wasting database overhead.

---

## 📦 5. Finalized Login API JSON Response Structure

A clean, non-flat, highly intuitive true hierarchical structure that maps the precise relationship of groups down to events, public programs, and internal tasks:

```json
{
  "status": "success",
  "data": {
    "user_id": 101,
    "name": "Hari Prasad",
    "email": "hariprasad8976@gmail.com",
    "base_role": "AUTH_USER",
   
    "groups": [
      {
        "group_id": 15,
        "group_name": "Charoda Yuva Mandal",
        "is_group_admin": true,
        "events": [
          {
            "event_id": 501,
            "name": "Durga Puja 2026",
            "designation": "ADHYAKSH",
           
            "programs": [
              {
                "program_id": 901,
                "program_name": "Garba Night 2026",
                "type": "Dandiya",
                "latitude": 21.2143,
                "longitude": 81.4322,
                "photos": ["garba_main.jpg"],
                "status": "Upcoming"
              }
            ],
           
            "tasks": [
              {
                "task_id": 4001,
                "task_title": "Pandal Fabrication",
                "task_owner_id": 105,
                "task_owner_name": "Amit Verma",
                "status": "In_Progress",
                "child_tasks": [
                  {
                    "child_task_id": 40011,
                    "title": "Bamboo structure binding",
                    "owner_id": 110,
                    "owner_name": "Suresh Kumar",
                    "status": "Pending"
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
}