-- Migration: Add users auth/status/social-login support columns
-- Date: 2026-07-01

ALTER TABLE users
  ADD COLUMN provider VARCHAR(50) NULL AFTER fcm_token,
  ADD COLUMN provider_id VARCHAR(255) NULL AFTER provider,
  ADD COLUMN status ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active' AFTER provider_id,
  ADD COLUMN is_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER status,
  ADD COLUMN email_verified_at TIMESTAMP NULL DEFAULT NULL AFTER is_verified,
  ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER email_verified_at;

CREATE INDEX idx_social_provider ON users(provider, provider_id);