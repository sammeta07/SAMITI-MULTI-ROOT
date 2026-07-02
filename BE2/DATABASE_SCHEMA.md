# Database Schema - Events Table

## Updated Events Table Structure

### Previous Structure
```
+--------------+--------------+------+-----+-------------------+-------------------+
| Field        | Type         | Null | Key | Default           | Extra             |
+--------------+--------------+------+-----+-------------------+-------------------+
| id           | int          | NO   | PRI | NULL              | auto_increment    |
| committee_id | int          | YES  | MUL | NULL              |                   |
| event_name   | varchar(255) | NO   |     | NULL              |                   |
| created_at   | timestamp    | YES  |     | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
+--------------+--------------+------+-----+-------------------+-------------------+
```

### New Structure (After Migration)
```
+--------------+------------------+------+-----+-------------------+-------------------+
| Field        | Type             | Null | Key | Default           | Extra             |
+--------------+------------------+------+-----+-------------------+-------------------+
| id           | int              | NO   | PRI | NULL              | auto_increment    |
| committee_id | int              | YES  | MUL | NULL              |                   |
| event_name   | varchar(255)     | NO   |     | NULL              |                   |
| description  | LONGTEXT         | YES  |     | NULL              |                   |
| event_banner | LONGTEXT         | YES  |     | NULL              | (base64/URL)      |
| status       | varchar(50)      | NO   |     | UPCOMING          |                   |
| type         | varchar(100)     | YES  |     | NULL              |                   |
| visibility   | varchar(50)      | NO   |     | HIDDEN            |                   |
| start_date   | date             | YES  |     | NULL              |                   |
| end_date     | date             | YES  |     | NULL              |                   |
| created_by   | int              | NO   | MUL | NULL              | (FK → users)      |
| updated_by   | int              | YES  | MUL | NULL              | (FK → users)      |
| created_at   | timestamp        | YES  |     | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
+--------------+------------------+------+-----+-------------------+-------------------+
```

## Field Descriptions

| Field | Type | Null | Default | Description |
|-------|------|------|---------|-------------|
| `id` | int | NO | auto_increment | Primary key - Event ID |
| `committee_id` | int | YES | - | Foreign key to committees table |
| `event_name` | varchar(255) | NO | - | Event name/title |
| `description` | LONGTEXT | YES | - | Detailed event description |
| `event_banner` | LONGTEXT | YES | - | Event banner image (base64 encoded or URL) |
| `status` | varchar(50) | NO | UPCOMING | Event status: `UPCOMING`, `ONGOING`, `COMPLETED`, `CANCELLED` |
| `type` | varchar(100) | YES | - | Event type: `puja`, `sports`, `meeting`, `celebration`, `workshop`, `other` |
| `visibility` | varchar(50) | NO | HIDDEN | Visibility: `VISIBLE`, `HIDDEN` |
| `start_date` | date | YES | - | Event start date (YYYY-MM-DD) |
| `end_date` | date | YES | - | Event end date (YYYY-MM-DD) |
| `created_by` | int | NO | - | User ID who created the event (FK → users) |
| `updated_by` | int | YES | - | User ID who last updated the event (FK → users) |
| `created_at` | timestamp | YES | CURRENT_TIMESTAMP | Event creation timestamp |

## Indexes Created

- `idx_events_committee_id` - For filtering events by committee
- `idx_events_created_by` - For filtering events by creator
- `idx_events_status` - For filtering events by status
- `idx_events_visibility` - For filtering events by visibility
- `idx_events_start_date` - For date range queries

## Foreign Keys

- `fk_events_committee` - committee_id → committees.committee_id (CASCADE DELETE)
- `fk_events_created_by` - created_by → users.user_id (RESTRICT DELETE)
- `fk_events_updated_by` - updated_by → users.user_id (SET NULL DELETE)

## Status Values

- `UPCOMING` - Event is scheduled for future
- `ONGOING` - Event is currently happening
- `COMPLETED` - Event has finished
- `CANCELLED` - Event is cancelled

## Type Values

- `puja` - Religious/Puja event
- `sports` - Sports event
- `meeting` - Committee meeting
- `celebration` - Celebration event
- `workshop` - Workshop/Training
- `other` - Other event types

## Visibility Values

- `VISIBLE` - Event is visible to all members
- `HIDDEN` - Event is private/hidden (default)

## Users Table Structure

### Updated Structure
```
+--------------+---------------+------+-----+-------------------+------------------------------+
| Field        | Type          | Null | Key | Default           | Extra                        |
+--------------+---------------+------+-----+-------------------+------------------------------+
| id           | int           | NO   | PRI | NULL              | auto_increment               |
| name         | varchar(255)  | NO   |     | NULL              |                              |
| email        | varchar(255)  | NO   | UNI | NULL              |                              |
| password     | varchar(255)  | NO   |     | NULL              |                              |
| date_of_birth| date          | NO   |     | NULL              |                              |
| gender       | varchar(15)   | NO   |     | NULL              |                              |
| mobile       | varchar(20)   | NO   | UNI | NULL              |                              |
| base_role    | varchar(50)   | NO   |     | AUTH_USER         |                              |
| profile_photo| varchar(255)  | YES  |     | NULL              |                              |
| fcm_token    | varchar(255)  | YES  |     | NULL              |                              |
| provider     | varchar(50)   | YES  |     | NULL              | social login provider        |
| provider_id  | varchar(255)  | YES  |     | NULL              | social provider user id      |
| status       | enum(...)     | NO   |     | active            | active/inactive/suspended    |
| is_verified  | tinyint(1)    | NO   |     | 0                 | email/mobile verified flag   |
| email_verified_at | timestamp | YES  |     | NULL              | verified timestamp           |
| deleted_at   | timestamp     | YES  |     | NULL              | soft delete timestamp        |
| created_at   | timestamp     | NO   |     | CURRENT_TIMESTAMP | DEFAULT_GENERATED            |
| updated_at   | timestamp     | NO   |     | CURRENT_TIMESTAMP | DEFAULT_GENERATED ON UPDATE  |
+--------------+---------------+------+-----+-------------------+------------------------------+
```

### Constraints

- `email` is unique and stored in lowercase.
- `mobile` is unique and can support longer values up to 20 characters.
- `gender` is restricted to `male`, `female`, or `other`.
- `date_of_birth` is stored as a native `date` value.
- `base_role` defaults to `AUTH_USER` for new registrations.
- `profile_photo` stores an uploaded image URL when available.
- `provider` and `provider_id` support social login integrations.
- `status` defaults to `active` and can be used to suspend or inactivate users.
- `is_verified` defaults to `0` until the user is verified.
- `email_verified_at` stores the verification timestamp.
- `deleted_at` supports soft deletes.
