-- Run this ONCE in pgAdmin (Query Tool) connected as postgres superuser
-- Creates the evaluation database only — does NOT touch fratelanza_erp

CREATE DATABASE fratelanza_eval OWNER fratelanza;

-- Verify:
-- SELECT datname FROM pg_database WHERE datname = 'fratelanza_eval';
