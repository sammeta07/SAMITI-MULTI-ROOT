-- Add request type to track whether pending request is for member or admin role
ALTER TABLE users_committees
ADD COLUMN request_type ENUM('COMMITTEE_MEMBER', 'COMMITTEE_ADMIN') NULL AFTER user_id;
