-- Program repetition is no longer stored; the repeat indicator is derived from end_date.
ALTER TABLE programs DROP COLUMN is_recurring;
