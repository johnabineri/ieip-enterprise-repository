-- =====================================================================
-- 020_ref_cmp.sql : replika READ-ONLY dari SEDDI (kalla_cmp) — 31 tabel publikasi pub_cmp_ref
--
-- DIHASILKAN oleh `SELECT mdm.generate_ref_ddl()` di kalla_cmp (JANGAN diedit manual). Bila publikasi CMP berubah,
-- bangkitkan ulang:  psql -d kalla_cmp -tAc "SELECT mdm.generate_ref_ddl()" > ... lalu periksa dengan
-- scripts/cross_check_consumers.sh (gate NFR-17 / ADR-CMP-005).
-- Penulisan oleh aplikasi ditolak trigger ref.tg_reject_write(); data masuk HANYA lewat langganan CDC (docker/postgres/initdb/20-eap.sh).
-- Semua 31 tabel wajib ada: langganan logis gagal bila tabel target tidak ada.
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS ref;
CREATE OR REPLACE FUNCTION ref.tg_reject_write() RETURNS trigger LANGUAGE plpgsql AS $b$
BEGIN
    RAISE EXCEPTION 'ref.% bersifat read-only (replika dari kalla_cmp); % ditolak', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $b$;
CREATE TABLE ref.users (
    id uuid NOT NULL,
    username citext NOT NULL,
    display_name character varying(200) NOT NULL,
    employee_id uuid,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_users_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.users FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.account_mappings (
    id uuid NOT NULL,
    local_account_id uuid NOT NULL,
    group_account_id uuid NOT NULL,
    valid_from date NOT NULL,
    valid_to date,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_account_mappings_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.account_mappings FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.banks (
    id uuid NOT NULL,
    code shared.business_code NOT NULL,
    name character varying(200) NOT NULL,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_banks_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.banks FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.branch_units (
    id uuid NOT NULL,
    branch_id uuid NOT NULL,
    unit_code shared.business_code NOT NULL,
    org_unit_id uuid,
    valid_from date NOT NULL,
    valid_to date,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_branch_units_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.branch_units FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.branches (
    id uuid NOT NULL,
    company_id uuid NOT NULL,
    parent_id uuid,
    code shared.business_code NOT NULL,
    name character varying(200) NOT NULL,
    office_type character varying(12) NOT NULL,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_branches_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.branches FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.business_group_companies (
    id uuid NOT NULL,
    business_group_id uuid NOT NULL,
    company_id uuid NOT NULL,
    relation_type character varying(12) NOT NULL,
    valid_from date NOT NULL,
    valid_to date,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_business_group_companies_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.business_group_companies FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.business_groups (
    id uuid NOT NULL,
    code shared.business_code NOT NULL,
    name character varying(200) NOT NULL,
    group_kind character varying(15) NOT NULL,
    parent_id uuid,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_business_groups_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.business_groups FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.chart_of_accounts (
    id uuid NOT NULL,
    company_id uuid,
    parent_id uuid,
    code shared.business_code NOT NULL,
    name character varying(200) NOT NULL,
    account_type character varying(10) NOT NULL,
    normal_balance character varying(6) NOT NULL,
    is_contra boolean NOT NULL,
    is_header boolean NOT NULL,
    valid_from date NOT NULL,
    valid_to date,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_chart_of_accounts_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.chart_of_accounts FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.cities (
    id uuid NOT NULL,
    province_id uuid NOT NULL,
    code character varying(4) NOT NULL,
    name character varying(100) NOT NULL,
    city_type character varying(10) NOT NULL,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_cities_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.cities FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.companies (
    id uuid NOT NULL,
    code shared.business_code NOT NULL,
    legal_name character varying(255) NOT NULL,
    brand_name character varying(200),
    company_type character varying(12) NOT NULL,
    parent_id uuid,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_companies_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.companies FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.cost_centers (
    id uuid NOT NULL,
    company_id uuid NOT NULL,
    parent_id uuid,
    code shared.business_code NOT NULL,
    name character varying(200) NOT NULL,
    cc_type character varying(12) NOT NULL,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_cost_centers_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.cost_centers FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.countries (
    id uuid NOT NULL,
    iso2 character(2) NOT NULL,
    iso3 character(3) NOT NULL,
    name character varying(150) NOT NULL,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_countries_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.countries FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.currencies (
    id uuid NOT NULL,
    code character(3) NOT NULL,
    name character varying(100) NOT NULL,
    symbol character varying(10),
    decimal_places smallint NOT NULL,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_currencies_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.currencies FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.districts (
    id uuid NOT NULL,
    city_id uuid NOT NULL,
    code character varying(6) NOT NULL,
    name character varying(100) NOT NULL,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_districts_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.districts FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.employees (
    id uuid NOT NULL,
    employee_number shared.business_code NOT NULL,
    full_name character varying(300) NOT NULL,
    work_email citext,
    company_id uuid,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_employees_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.employees FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.employments (
    id uuid NOT NULL,
    employee_id uuid NOT NULL,
    company_id uuid NOT NULL,
    local_employee_no shared.business_code NOT NULL,
    position_id uuid,
    org_unit_id uuid,
    branch_id uuid,
    supervisor_employment_id uuid,
    employment_type character varying(12) NOT NULL,
    is_primary boolean NOT NULL,
    start_date date NOT NULL,
    end_date date,
    status character varying(8) NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_employments_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.employments FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.exchange_rates (
    id uuid NOT NULL,
    from_currency_id uuid NOT NULL,
    to_currency_id uuid NOT NULL,
    rate_type character varying(10) NOT NULL,
    rate_date date NOT NULL,
    rate numeric(15,6) NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_exchange_rates_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.exchange_rates FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.org_units (
    id uuid NOT NULL,
    company_id uuid NOT NULL,
    parent_id uuid,
    code shared.business_code NOT NULL,
    name character varying(200) NOT NULL,
    unit_kind character varying(12) NOT NULL,
    path character varying(1000) NOT NULL,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_org_units_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.org_units FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.parties (
    id uuid NOT NULL,
    code shared.business_code NOT NULL,
    party_type character varying(12) NOT NULL,
    status character varying(12) NOT NULL,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_parties_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.parties FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.party_roles (
    id uuid NOT NULL,
    party_id uuid NOT NULL,
    role_type character varying(15) NOT NULL,
    company_id uuid,
    valid_from date NOT NULL,
    valid_to date,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_party_roles_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.party_roles FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.payment_terms (
    id uuid NOT NULL,
    code shared.business_code NOT NULL,
    name character varying(150) NOT NULL,
    net_days smallint NOT NULL,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_payment_terms_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.payment_terms FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.positions (
    id uuid NOT NULL,
    company_id uuid,
    code shared.business_code NOT NULL,
    name character varying(200) NOT NULL,
    job_family_code character varying(50),
    job_grade_code character varying(50),
    job_level smallint,
    valid_from date NOT NULL,
    valid_to date,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_positions_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.positions FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.product_categories (
    id uuid NOT NULL,
    parent_id uuid,
    code shared.business_code NOT NULL,
    name character varying(200) NOT NULL,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_product_categories_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.product_categories FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.products (
    id uuid NOT NULL,
    code shared.business_code NOT NULL,
    name character varying(300) NOT NULL,
    product_kind character varying(12) NOT NULL,
    category_id uuid,
    base_uom_id uuid NOT NULL,
    lifecycle_status character varying(12) NOT NULL,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_products_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.products FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.provinces (
    id uuid NOT NULL,
    country_id uuid NOT NULL,
    code character varying(2) NOT NULL,
    name character varying(100) NOT NULL,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_provinces_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.provinces FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.reference_codes (
    id uuid NOT NULL,
    group_id uuid NOT NULL,
    code shared.business_code NOT NULL,
    name character varying(200) NOT NULL,
    parent_id uuid,
    valid_from date NOT NULL,
    valid_to date,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_reference_codes_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.reference_codes FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.reference_groups (
    id uuid NOT NULL,
    code shared.business_code NOT NULL,
    name character varying(200) NOT NULL,
    is_extensible boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_reference_groups_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.reference_groups FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.subdistricts (
    id uuid NOT NULL,
    district_id uuid NOT NULL,
    code character varying(10) NOT NULL,
    name character varying(100) NOT NULL,
    postal_code character varying(5),
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_subdistricts_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.subdistricts FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.tax_rates (
    id uuid NOT NULL,
    tax_id uuid NOT NULL,
    rate_percent numeric(7,4) NOT NULL,
    tax_base_factor numeric(7,4) NOT NULL,
    valid_from date NOT NULL,
    valid_to date,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_tax_rates_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.tax_rates FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.taxes (
    id uuid NOT NULL,
    code shared.business_code NOT NULL,
    name character varying(150) NOT NULL,
    tax_kind character varying(12) NOT NULL,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_taxes_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.taxes FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();
CREATE TABLE ref.uoms (
    id uuid NOT NULL,
    code shared.business_code NOT NULL,
    name character varying(100) NOT NULL,
    uom_type character varying(10) NOT NULL,
    decimals smallint NOT NULL,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    row_version integer NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE TRIGGER trg_uoms_readonly BEFORE INSERT OR UPDATE OR DELETE ON ref.uoms FOR EACH ROW EXECUTE FUNCTION ref.tg_reject_write();

