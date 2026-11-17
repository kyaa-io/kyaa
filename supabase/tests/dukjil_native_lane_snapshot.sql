-- BYUS_CLEAN_DB_UPGRADE_BEFORE_FILE for 20261231120000: keep a copy of the chain just before it for dukjil_native_lane_gate.sh.
\c postgres
create database byus_lane_pre template byus_clean;
\c byus_clean
