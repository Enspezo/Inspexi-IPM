-- CreateEnum
CREATE TYPE "InspectionExecStatus" AS ENUM ('not_started', 'in_progress', 'completed');

-- CreateEnum
CREATE TYPE "FindingInspectionType" AS ENUM ('visual', 'measurement');

-- CreateEnum
CREATE TYPE "PhotoEntityType" AS ENUM ('asset', 'finding', 'inspection_plan', 'location');

-- CreateEnum
CREATE TYPE "MeasurementDataType" AS ENUM ('number', 'text', 'select', 'boolean');

-- CreateEnum
CREATE TYPE "SyncOperation" AS ENUM ('create', 'update', 'delete');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'conflict');

-- CreateEnum
CREATE TYPE "ChecklistStatus" AS ENUM ('CONCEPT', 'ACTIEF', 'VERVALLEN');

-- CreateEnum
CREATE TYPE "AssetFieldType" AS ENUM ('text', 'number', 'select', 'checkbox', 'date', 'textarea');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('CONCEPT', 'ACTIEF', 'VERVALLEN');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PLAN', 'REPORT');

-- CreateEnum
CREATE TYPE "TemplateMode" AS ENUM ('SECTIONS', 'BLOCKS', 'DOCX');

-- CreateEnum
CREATE TYPE "SectionType" AS ENUM ('STATIC', 'REPEATING', 'TABLE_OF_CONTENTS', 'SIGNATURE_BLOCK', 'CONDITIONAL');

-- CreateEnum
CREATE TYPE "GeneratedDocumentStatus" AS ENUM ('DRAFT', 'PENDING_SIGNATURES', 'SIGNED', 'FINALIZED');

-- CreateEnum
CREATE TYPE "SignatureStatus" AS ENUM ('PENDING', 'REQUESTED', 'SIGNED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MeasurementSheetTemplateStatus" AS ENUM ('CONCEPT', 'ACTIEF', 'VERVALLEN');

-- CreateEnum
CREATE TYPE "MeasurementSheetFieldType" AS ENUM ('NUMBER', 'TEXT', 'TEXTAREA', 'CHECKBOX', 'DROPDOWN', 'CALCULATED', 'PHOTO');

-- CreateEnum
CREATE TYPE "MeasurementSheetFieldWidth" AS ENUM ('QUARTER', 'THIRD', 'HALF', 'TWO_THIRDS', 'THREE_QUARTERS', 'FULL');

-- CreateEnum
CREATE TYPE "PassFailOperator" AS ENUM ('GTE', 'GT', 'LTE', 'LT', 'EQ', 'RANGE', 'IN');

-- CreateEnum
CREATE TYPE "MeasurementSheetRecordStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'VALIDATED');

-- CreateEnum
CREATE TYPE "ClientUserStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ClientAccessRole" AS ENUM ('VIEWER', 'SIGNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "MarkerType" AS ENUM ('ASSET', 'MEASUREMENT', 'FINDING');

-- CreateTable
CREATE TABLE "imp_inspection_types" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_inspection_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_plan_status_types" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_plan_status_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_asset_status_types" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_asset_status_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_finding_status_types" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_finding_status_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_report_status_types" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_report_status_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_signatory_types" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_signatory_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_signer_roles" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_signer_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_pass_fail_status_types" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_pass_fail_status_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_resolution_status_types" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_resolution_status_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_client_request_types" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_client_request_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_client_request_status_types" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_client_request_status_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_norm_type_definitions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "asset_types" TEXT[],
    "classification_model_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,

    CONSTRAINT "imp_norm_type_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_norm_configurations" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "norm_type" TEXT NOT NULL,
    "norm_version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "asset_types" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" DATE,
    "valid_until" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_norm_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_classification_models" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID NOT NULL,

    CONSTRAINT "imp_classification_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_classification_characteristics" (
    "id" UUID NOT NULL,
    "classification_model_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "imp_classification_characteristics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_classification_options" (
    "id" UUID NOT NULL,
    "characteristic_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "imp_classification_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_inspection_plans" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "project_id" UUID,
    "inspection_template_id" UUID,
    "project_name" TEXT NOT NULL,
    "description" TEXT,
    "reference_number" TEXT,
    "norm_type" TEXT NOT NULL,
    "inspection_type" TEXT NOT NULL DEFAULT 'initial',
    "address_street" TEXT,
    "address_house_number" TEXT,
    "address_postal_code" TEXT,
    "address_city" TEXT,
    "gps_latitude" DECIMAL(10,8),
    "gps_longitude" DECIMAL(11,8),
    "planned_date" DATE,
    "planned_duration_hours" DECIMAL(4,1),
    "deadline" DATE,
    "assigned_to" UUID,
    "reviewer_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "started_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "installation_responsible_id" UUID,
    "notes" TEXT,
    "internal_notes" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3),
    "created_by" UUID,
    "last_modified_by" UUID,
    "device_id" TEXT,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "imp_inspection_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_assets" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "inspection_plan_id" UUID NOT NULL,
    "parent_asset_id" UUID,
    "location_id" UUID,
    "asset_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "identifier" TEXT,
    "location_description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "tree_path" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "technical_data" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3),
    "created_by" UUID,
    "device_id" TEXT,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "imp_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_visual_inspections" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "status" "InspectionExecStatus" NOT NULL DEFAULT 'not_started',
    "checklist_results" JSONB NOT NULL DEFAULT '[]',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "inspector_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3),
    "device_id" TEXT,

    CONSTRAINT "imp_visual_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_measurement_records" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "status" "InspectionExecStatus" NOT NULL DEFAULT 'not_started',
    "measurements" JSONB NOT NULL DEFAULT '[]',
    "instrument_type" TEXT,
    "instrument_serial" TEXT,
    "calibration_date" DATE,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "inspector_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3),
    "device_id" TEXT,

    CONSTRAINT "imp_measurement_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_findings" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "visual_inspection_id" UUID,
    "measurement_record_id" UUID,
    "finding_template_id" UUID,
    "inspection_type" "FindingInspectionType" NOT NULL,
    "short_description" TEXT NOT NULL,
    "long_description" TEXT,
    "classification_values" JSONB NOT NULL DEFAULT '{}',
    "location_description" TEXT,
    "location_marker" JSONB,
    "recommendation" TEXT,
    "recommendation_custom" TEXT,
    "norm_reference" TEXT,
    "checklist_item_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolved_at" TIMESTAMP(3),
    "resolved_by" UUID,
    "resolution_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3),
    "created_by" UUID,
    "device_id" TEXT,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "imp_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_photos" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "entity_type" "PhotoEntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "storage_path" TEXT NOT NULL,
    "thumbnail_path" TEXT,
    "original_filename" TEXT,
    "file_size" INTEGER,
    "mime_type" TEXT NOT NULL DEFAULT 'image/jpeg',
    "width" INTEGER,
    "height" INTEGER,
    "captured_at" TIMESTAMP(3),
    "gps_latitude" DECIMAL(10,8),
    "gps_longitude" DECIMAL(11,8),
    "device_info" JSONB,
    "annotations" JSONB NOT NULL DEFAULT '[]',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "caption" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synced_at" TIMESTAMP(3),
    "uploaded_by" UUID,
    "device_id" TEXT,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "imp_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_signatures" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "inspection_plan_id" UUID NOT NULL,
    "signatory_type" TEXT NOT NULL,
    "signatory_name" TEXT NOT NULL,
    "signatory_function" TEXT,
    "signatory_user_id" UUID,
    "signatory_contact_id" UUID,
    "signature_data" TEXT NOT NULL,
    "signature_hash" TEXT,
    "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "device_info" JSONB,
    "gps_latitude" DECIMAL(10,8),
    "gps_longitude" DECIMAL(11,8),
    "synced_at" TIMESTAMP(3),
    "device_id" TEXT,

    CONSTRAINT "imp_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_reports" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "inspection_plan_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "template_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "custom_content" JSONB NOT NULL DEFAULT '{}',
    "pdf_path" TEXT,
    "word_path" TEXT,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "approval_notes" TEXT,
    "sent_at" TIMESTAMP(3),
    "sent_to" JSONB NOT NULL DEFAULT '[]',
    "delivery_status" TEXT,
    "generated_at" TIMESTAMP(3),
    "file_size" INTEGER,
    "page_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "imp_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_inspection_locations" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "inspection_plan_id" UUID NOT NULL,
    "parent_location_id" UUID,
    "location_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "identifier" TEXT,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "tree_path" TEXT,
    "technical_data" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3),
    "created_by" UUID,
    "device_id" TEXT,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "imp_inspection_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_checklist_items" (
    "id" UUID NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "org_id" UUID,
    "code" TEXT,
    "question" TEXT NOT NULL,
    "instruction" TEXT,
    "norm_reference" TEXT,
    "category_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID NOT NULL,

    CONSTRAINT "imp_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_checklists" (
    "id" UUID NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "org_id" UUID,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "norm_type" TEXT NOT NULL,
    "asset_types" TEXT[],
    "location_types" TEXT[],
    "version" TEXT NOT NULL DEFAULT '1.0',
    "status" "ChecklistStatus" NOT NULL DEFAULT 'CONCEPT',
    "previous_version_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "retired_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "imp_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_checklist_item_links" (
    "id" UUID NOT NULL,
    "checklist_id" UUID NOT NULL,
    "checklist_item_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "category_override" TEXT,

    CONSTRAINT "imp_checklist_item_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_checklist_version_history" (
    "id" UUID NOT NULL,
    "checklist_id" UUID NOT NULL,
    "from_version" TEXT NOT NULL,
    "to_version" TEXT NOT NULL,
    "from_status" "ChecklistStatus" NOT NULL,
    "to_status" "ChecklistStatus" NOT NULL,
    "change_description" TEXT NOT NULL,
    "approval_reason" TEXT,
    "changed_by" UUID NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB,

    CONSTRAINT "imp_checklist_version_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_categories" (
    "id" UUID NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "org_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "parent_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID NOT NULL,

    CONSTRAINT "imp_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_finding_templates" (
    "id" UUID NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "org_id" UUID,
    "code" TEXT,
    "category_id" UUID,
    "short_description" TEXT NOT NULL,
    "long_description" TEXT,
    "explanation" TEXT,
    "norm_reference" TEXT,
    "classification_model_id" UUID NOT NULL,
    "default_classification" JSONB NOT NULL DEFAULT '{}',
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID NOT NULL,

    CONSTRAINT "imp_finding_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_measurement_field_templates" (
    "id" UUID NOT NULL,
    "norm_configuration_id" UUID NOT NULL,
    "field_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "data_type" "MeasurementDataType" NOT NULL,
    "unit" TEXT,
    "min_value" DECIMAL(12,4),
    "max_value" DECIMAL(12,4),
    "allowed_values" JSONB,
    "regex_pattern" TEXT,
    "pass_criteria" JSONB,
    "asset_types" JSONB NOT NULL DEFAULT '[]',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_measurement_field_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_report_templates" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "norm_types" JSONB NOT NULL DEFAULT '[]',
    "header_template" TEXT,
    "footer_template" TEXT,
    "cover_template" TEXT,
    "toc_template" TEXT,
    "content_template" TEXT,
    "styles_css" TEXT,
    "logo_path" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_report_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_asset_type_definitions" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "norm_types" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "imp_asset_type_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_asset_type_fields" (
    "id" UUID NOT NULL,
    "asset_type_definition_id" UUID NOT NULL,
    "field_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "help_text" TEXT,
    "field_type" "AssetFieldType" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "default_value" TEXT,
    "placeholder" TEXT,
    "validation_rules" JSONB NOT NULL DEFAULT '{}',
    "unit" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_width" TEXT,
    "group_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_asset_type_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_asset_type_constraints" (
    "id" UUID NOT NULL,
    "asset_type_definition_id" UUID NOT NULL,
    "allowed_parent_type_id" UUID,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_asset_type_constraints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_asset_type_measurement_configs" (
    "id" UUID NOT NULL,
    "asset_type_definition_id" UUID NOT NULL,
    "measurement_field_template_id" UUID NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_asset_type_measurement_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_location_type_definitions" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "norm_types" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "imp_location_type_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_location_type_fields" (
    "id" UUID NOT NULL,
    "location_type_definition_id" UUID NOT NULL,
    "field_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "help_text" TEXT,
    "field_type" "AssetFieldType" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "default_value" TEXT,
    "placeholder" TEXT,
    "validation_rules" JSONB NOT NULL DEFAULT '{}',
    "unit" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_width" TEXT,
    "group_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_location_type_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_location_type_constraints" (
    "id" UUID NOT NULL,
    "location_type_definition_id" UUID NOT NULL,
    "allowed_parent_type_id" UUID,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_location_type_constraints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_inspection_templates" (
    "id" UUID NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "org_id" UUID,
    "forked_from_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "norm_type" TEXT NOT NULL,
    "classification_model_id" UUID NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "status" "TemplateStatus" NOT NULL DEFAULT 'CONCEPT',
    "previous_version_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "retired_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "imp_inspection_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_inspection_template_checklist_links" (
    "id" UUID NOT NULL,
    "inspection_template_id" UUID NOT NULL,
    "checklist_id" UUID NOT NULL,
    "asset_types" TEXT[],
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "imp_inspection_template_checklist_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_inspection_template_measurement_sheet_links" (
    "id" UUID NOT NULL,
    "inspection_template_id" UUID NOT NULL,
    "measurement_sheet_template_id" UUID NOT NULL,
    "asset_types" TEXT[],
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "imp_inspection_template_measurement_sheet_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_inspection_template_version_history" (
    "id" UUID NOT NULL,
    "inspection_template_id" UUID NOT NULL,
    "from_version" TEXT NOT NULL,
    "to_version" TEXT NOT NULL,
    "from_status" "TemplateStatus" NOT NULL,
    "to_status" "TemplateStatus" NOT NULL,
    "change_description" TEXT,
    "changed_by" UUID NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB,

    CONSTRAINT "imp_inspection_template_version_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_document_templates" (
    "id" UUID NOT NULL,
    "inspection_template_id" UUID NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "page_size" TEXT NOT NULL DEFAULT 'A4',
    "orientation" TEXT NOT NULL DEFAULT 'portrait',
    "margin_top" INTEGER NOT NULL DEFAULT 20,
    "margin_bottom" INTEGER NOT NULL DEFAULT 20,
    "margin_left" INTEGER NOT NULL DEFAULT 25,
    "margin_right" INTEGER NOT NULL DEFAULT 20,
    "header_html" TEXT,
    "footer_html" TEXT,
    "cover_page_html" TEXT,
    "template_mode" "TemplateMode" NOT NULL DEFAULT 'SECTIONS',
    "content_blocks" JSONB,
    "docx_storage_key" TEXT,
    "docx_file_name" TEXT,
    "docx_file_size" INTEGER,

    CONSTRAINT "imp_document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_document_template_docx_revisions" (
    "id" UUID NOT NULL,
    "document_template_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_document_template_docx_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_document_sections" (
    "id" UUID NOT NULL,
    "document_template_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "section_type" "SectionType" NOT NULL,
    "content_html" TEXT,
    "repeat_on" TEXT,
    "repeat_item_template" TEXT,
    "condition" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "include_in_toc" BOOLEAN NOT NULL DEFAULT true,
    "page_break_before" BOOLEAN NOT NULL DEFAULT false,
    "page_break_after" BOOLEAN NOT NULL DEFAULT false,
    "parent_section_id" UUID,

    CONSTRAINT "imp_document_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_generated_documents" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "document_template_id" UUID NOT NULL,
    "inspection_plan_id" UUID NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "html_content" TEXT NOT NULL,
    "status" "GeneratedDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "is_edited" BOOLEAN NOT NULL DEFAULT false,
    "edited_content" TEXT,
    "edited_by" UUID,
    "edited_at" TIMESTAMP(3),
    "pdf_url" TEXT,
    "word_url" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generated_by" UUID NOT NULL,
    "finalized_at" TIMESTAMP(3),

    CONSTRAINT "imp_generated_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_document_signatures" (
    "id" UUID NOT NULL,
    "generated_document_id" UUID NOT NULL,
    "signer_role" TEXT NOT NULL,
    "signer_name" TEXT,
    "signer_email" TEXT,
    "signer_function" TEXT,
    "signature_image" TEXT,
    "signed_at" TIMESTAMP(3),
    "signed_ip_address" TEXT,
    "signature_request_id" TEXT,
    "signature_request_sent_at" TIMESTAMP(3),
    "signature_request_url" TEXT,
    "status" "SignatureStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "imp_document_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_measurement_sheet_templates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "norm_type" TEXT NOT NULL,
    "asset_types" TEXT[],
    "location_types" TEXT[],
    "version" TEXT NOT NULL DEFAULT '1.0',
    "status" "MeasurementSheetTemplateStatus" NOT NULL DEFAULT 'CONCEPT',
    "previous_version_id" UUID,
    "final_check_rules" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "retired_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "imp_measurement_sheet_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_measurement_sheet_sections" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_repeating" BOOLEAN NOT NULL DEFAULT false,
    "min_rows" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "collapsible" BOOLEAN NOT NULL DEFAULT true,
    "default_collapsed" BOOLEAN NOT NULL DEFAULT false,
    "row_validation_rules" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "imp_measurement_sheet_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_measurement_sheet_fields" (
    "id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "field_type" "MeasurementSheetFieldType" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "placeholder" TEXT,
    "width" "MeasurementSheetFieldWidth" NOT NULL DEFAULT 'FULL',
    "unit" TEXT,
    "decimals" INTEGER,
    "min_value" DECIMAL(18,6),
    "max_value" DECIMAL(18,6),
    "dropdown_options" JSONB,
    "formula" TEXT,
    "formula_dependencies" TEXT[],
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "pass_fail_enabled" BOOLEAN NOT NULL DEFAULT false,
    "pass_fail_operator" "PassFailOperator",
    "pass_fail_value" DECIMAL(18,6),
    "pass_fail_min_value" DECIMAL(18,6),
    "pass_fail_max_value" DECIMAL(18,6),
    "pass_fail_values" JSONB,
    "pass_fail_fail_message" TEXT,
    "auto_finding_enabled" BOOLEAN NOT NULL DEFAULT false,
    "auto_finding_template_id" UUID,
    "copy_value_on_new_row" BOOLEAN NOT NULL DEFAULT false,
    "allow_bulk_edit" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "imp_measurement_sheet_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_measurement_sheet_version_history" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "from_version" TEXT NOT NULL,
    "to_version" TEXT NOT NULL,
    "from_status" "MeasurementSheetTemplateStatus" NOT NULL,
    "to_status" "MeasurementSheetTemplateStatus" NOT NULL,
    "change_description" TEXT NOT NULL,
    "approval_reason" TEXT,
    "changed_by" UUID NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB,

    CONSTRAINT "imp_measurement_sheet_version_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_measurement_sheet_records" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "inspection_plan_id" UUID,
    "template_version" TEXT NOT NULL,
    "template_snapshot" JSONB NOT NULL,
    "status" "MeasurementSheetRecordStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "data" JSONB NOT NULL DEFAULT '{}',
    "final_check_executed" BOOLEAN NOT NULL DEFAULT false,
    "final_check_passed" BOOLEAN,
    "final_check_results" JSONB,
    "synced_at" TIMESTAMP(3),
    "device_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,

    CONSTRAINT "imp_measurement_sheet_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_location_images" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "storage_path" TEXT NOT NULL,
    "thumbnail_path" TEXT,
    "original_filename" TEXT,
    "file_size" INTEGER,
    "mime_type" TEXT NOT NULL DEFAULT 'image/jpeg',
    "width" INTEGER,
    "height" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3),
    "created_by" UUID,
    "device_id" TEXT,

    CONSTRAINT "imp_location_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_location_image_markers" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "location_image_id" UUID NOT NULL,
    "position_x" DOUBLE PRECISION NOT NULL,
    "position_y" DOUBLE PRECISION NOT NULL,
    "marker_type" "MarkerType" NOT NULL,
    "asset_id" UUID,
    "finding_id" UUID,
    "standalone_measurement_id" UUID,
    "annotation" JSONB,
    "label" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3),
    "created_by" UUID,
    "device_id" TEXT,

    CONSTRAINT "imp_location_image_markers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_standalone_measurements" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "inspection_plan_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "measurement_type" TEXT NOT NULL,
    "description" TEXT,
    "linked_asset_id" UUID,
    "sample_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3),
    "created_by" UUID,
    "device_id" TEXT,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "imp_standalone_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_standalone_measurement_values" (
    "id" UUID NOT NULL,
    "standalone_measurement_id" UUID NOT NULL,
    "field_name" TEXT NOT NULL,
    "field_type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "pass_fail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_standalone_measurement_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_sync_queue" (
    "id" UUID NOT NULL,
    "device_id" TEXT NOT NULL,
    "user_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "operation" "SyncOperation" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "conflict_data" JSONB,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" UUID,

    CONSTRAINT "imp_sync_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_device_registrations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" TEXT NOT NULL,
    "device_name" TEXT,
    "device_type" TEXT,
    "os_name" TEXT,
    "os_version" TEXT,
    "app_version" TEXT,
    "push_token" TEXT,
    "last_sync_at" TIMESTAMP(3),
    "last_active_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_device_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_client_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "function" TEXT,
    "status" "ClientUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_client_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_client_access" (
    "id" UUID NOT NULL,
    "client_user_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "role" "ClientAccessRole" NOT NULL DEFAULT 'VIEWER',
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" UUID,

    CONSTRAINT "imp_client_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_client_magic_links" (
    "id" UUID NOT NULL,
    "client_user_id" UUID,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "inspection_plan_id" UUID,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "imp_client_magic_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_inspection_client_access" (
    "id" UUID NOT NULL,
    "inspection_plan_id" UUID NOT NULL,
    "client_user_id" UUID,
    "invited_email" TEXT,
    "can_view" BOOLEAN NOT NULL DEFAULT true,
    "can_sign" BOOLEAN NOT NULL DEFAULT false,
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invited_by" UUID NOT NULL,
    "accepted_at" TIMESTAMP(3),

    CONSTRAINT "imp_inspection_client_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_inspection_messages" (
    "id" UUID NOT NULL,
    "inspection_plan_id" UUID NOT NULL,
    "client_user_id" UUID,
    "user_id" UUID,
    "content" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_inspection_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_message_attachments" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,

    CONSTRAINT "imp_message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_finding_resolutions" (
    "id" UUID NOT NULL,
    "finding_id" UUID NOT NULL,
    "resolved_by_client_user_id" UUID NOT NULL,
    "description" TEXT,
    "resolved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verified_at" TIMESTAMP(3),
    "verified_by" UUID,
    "verification_notes" TEXT,

    CONSTRAINT "imp_finding_resolutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_finding_resolution_photos" (
    "id" UUID NOT NULL,
    "resolution_id" UUID NOT NULL,
    "photo_url" TEXT NOT NULL,
    "caption" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_finding_resolution_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_client_requests" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "client_user_id" UUID NOT NULL,
    "request_type" TEXT NOT NULL,
    "related_inspection_plan_id" UUID,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "preferred_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING_REQUEST',
    "handled_by" UUID,
    "handled_at" TIMESTAMP(3),
    "response_notes" TEXT,
    "resulting_inspection_plan_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_client_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_voice_base_prompts" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_voice_base_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_voice_template_prompts" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_voice_template_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_voice_user_prompts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "template_id" UUID,
    "content" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_voice_user_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_inspection_types_org_id_is_active_idx" ON "imp_inspection_types"("org_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "imp_inspection_types_org_id_code_key" ON "imp_inspection_types"("org_id", "code");

-- CreateIndex
CREATE INDEX "imp_plan_status_types_org_id_is_active_idx" ON "imp_plan_status_types"("org_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "imp_plan_status_types_org_id_code_key" ON "imp_plan_status_types"("org_id", "code");

-- CreateIndex
CREATE INDEX "imp_asset_status_types_org_id_is_active_idx" ON "imp_asset_status_types"("org_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "imp_asset_status_types_org_id_code_key" ON "imp_asset_status_types"("org_id", "code");

-- CreateIndex
CREATE INDEX "imp_finding_status_types_org_id_is_active_idx" ON "imp_finding_status_types"("org_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "imp_finding_status_types_org_id_code_key" ON "imp_finding_status_types"("org_id", "code");

-- CreateIndex
CREATE INDEX "imp_report_status_types_org_id_is_active_idx" ON "imp_report_status_types"("org_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "imp_report_status_types_org_id_code_key" ON "imp_report_status_types"("org_id", "code");

-- CreateIndex
CREATE INDEX "imp_signatory_types_org_id_is_active_idx" ON "imp_signatory_types"("org_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "imp_signatory_types_org_id_code_key" ON "imp_signatory_types"("org_id", "code");

-- CreateIndex
CREATE INDEX "imp_signer_roles_org_id_is_active_idx" ON "imp_signer_roles"("org_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "imp_signer_roles_org_id_code_key" ON "imp_signer_roles"("org_id", "code");

-- CreateIndex
CREATE INDEX "imp_pass_fail_status_types_org_id_is_active_idx" ON "imp_pass_fail_status_types"("org_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "imp_pass_fail_status_types_org_id_code_key" ON "imp_pass_fail_status_types"("org_id", "code");

-- CreateIndex
CREATE INDEX "imp_resolution_status_types_org_id_is_active_idx" ON "imp_resolution_status_types"("org_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "imp_resolution_status_types_org_id_code_key" ON "imp_resolution_status_types"("org_id", "code");

-- CreateIndex
CREATE INDEX "imp_client_request_types_org_id_is_active_idx" ON "imp_client_request_types"("org_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "imp_client_request_types_org_id_code_key" ON "imp_client_request_types"("org_id", "code");

-- CreateIndex
CREATE INDEX "imp_client_request_status_types_org_id_is_active_idx" ON "imp_client_request_status_types"("org_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "imp_client_request_status_types_org_id_code_key" ON "imp_client_request_status_types"("org_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "imp_norm_type_definitions_code_key" ON "imp_norm_type_definitions"("code");

-- CreateIndex
CREATE INDEX "imp_norm_type_definitions_is_active_idx" ON "imp_norm_type_definitions"("is_active");

-- CreateIndex
CREATE INDEX "imp_norm_type_definitions_code_idx" ON "imp_norm_type_definitions"("code");

-- CreateIndex
CREATE INDEX "imp_norm_type_definitions_classification_model_id_idx" ON "imp_norm_type_definitions"("classification_model_id");

-- CreateIndex
CREATE INDEX "imp_norm_configurations_org_id_idx" ON "imp_norm_configurations"("org_id");

-- CreateIndex
CREATE INDEX "imp_norm_configurations_norm_type_idx" ON "imp_norm_configurations"("norm_type");

-- CreateIndex
CREATE UNIQUE INDEX "imp_classification_models_code_key" ON "imp_classification_models"("code");

-- CreateIndex
CREATE INDEX "imp_classification_models_is_active_idx" ON "imp_classification_models"("is_active");

-- CreateIndex
CREATE INDEX "imp_classification_characteristics_classification_model_id__idx" ON "imp_classification_characteristics"("classification_model_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "imp_classification_characteristics_classification_model_id__key" ON "imp_classification_characteristics"("classification_model_id", "code");

-- CreateIndex
CREATE INDEX "imp_classification_options_characteristic_id_sort_order_idx" ON "imp_classification_options"("characteristic_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "imp_classification_options_characteristic_id_code_key" ON "imp_classification_options"("characteristic_id", "code");

-- CreateIndex
CREATE INDEX "imp_inspection_plans_org_id_status_idx" ON "imp_inspection_plans"("org_id", "status");

-- CreateIndex
CREATE INDEX "imp_inspection_plans_contact_id_idx" ON "imp_inspection_plans"("contact_id");

-- CreateIndex
CREATE INDEX "imp_inspection_plans_project_id_idx" ON "imp_inspection_plans"("project_id");

-- CreateIndex
CREATE INDEX "imp_inspection_plans_assigned_to_idx" ON "imp_inspection_plans"("assigned_to");

-- CreateIndex
CREATE INDEX "imp_assets_org_id_idx" ON "imp_assets"("org_id");

-- CreateIndex
CREATE INDEX "imp_assets_inspection_plan_id_idx" ON "imp_assets"("inspection_plan_id");

-- CreateIndex
CREATE INDEX "imp_visual_inspections_org_id_idx" ON "imp_visual_inspections"("org_id");

-- CreateIndex
CREATE INDEX "imp_visual_inspections_asset_id_idx" ON "imp_visual_inspections"("asset_id");

-- CreateIndex
CREATE INDEX "imp_measurement_records_org_id_idx" ON "imp_measurement_records"("org_id");

-- CreateIndex
CREATE INDEX "imp_measurement_records_asset_id_idx" ON "imp_measurement_records"("asset_id");

-- CreateIndex
CREATE INDEX "imp_findings_org_id_idx" ON "imp_findings"("org_id");

-- CreateIndex
CREATE INDEX "imp_findings_asset_id_idx" ON "imp_findings"("asset_id");

-- CreateIndex
CREATE INDEX "imp_findings_finding_template_id_idx" ON "imp_findings"("finding_template_id");

-- CreateIndex
CREATE INDEX "imp_photos_org_id_idx" ON "imp_photos"("org_id");

-- CreateIndex
CREATE INDEX "imp_photos_entity_type_entity_id_idx" ON "imp_photos"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "imp_signatures_org_id_idx" ON "imp_signatures"("org_id");

-- CreateIndex
CREATE INDEX "imp_signatures_inspection_plan_id_idx" ON "imp_signatures"("inspection_plan_id");

-- CreateIndex
CREATE INDEX "imp_reports_org_id_idx" ON "imp_reports"("org_id");

-- CreateIndex
CREATE INDEX "imp_reports_inspection_plan_id_idx" ON "imp_reports"("inspection_plan_id");

-- CreateIndex
CREATE INDEX "imp_inspection_locations_org_id_idx" ON "imp_inspection_locations"("org_id");

-- CreateIndex
CREATE INDEX "imp_inspection_locations_inspection_plan_id_idx" ON "imp_inspection_locations"("inspection_plan_id");

-- CreateIndex
CREATE INDEX "imp_checklist_items_org_id_is_system_idx" ON "imp_checklist_items"("org_id", "is_system");

-- CreateIndex
CREATE INDEX "imp_checklist_items_category_id_idx" ON "imp_checklist_items"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_checklist_items_org_id_code_key" ON "imp_checklist_items"("org_id", "code");

-- CreateIndex
CREATE INDEX "imp_checklists_org_id_is_system_idx" ON "imp_checklists"("org_id", "is_system");

-- CreateIndex
CREATE INDEX "imp_checklists_norm_type_idx" ON "imp_checklists"("norm_type");

-- CreateIndex
CREATE INDEX "imp_checklists_status_idx" ON "imp_checklists"("status");

-- CreateIndex
CREATE UNIQUE INDEX "imp_checklists_org_id_code_version_key" ON "imp_checklists"("org_id", "code", "version");

-- CreateIndex
CREATE INDEX "imp_checklist_item_links_checklist_id_sort_order_idx" ON "imp_checklist_item_links"("checklist_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "imp_checklist_item_links_checklist_id_checklist_item_id_key" ON "imp_checklist_item_links"("checklist_id", "checklist_item_id");

-- CreateIndex
CREATE INDEX "imp_checklist_version_history_checklist_id_changed_at_idx" ON "imp_checklist_version_history"("checklist_id", "changed_at");

-- CreateIndex
CREATE INDEX "imp_categories_org_id_is_system_idx" ON "imp_categories"("org_id", "is_system");

-- CreateIndex
CREATE INDEX "imp_categories_parent_id_idx" ON "imp_categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_categories_org_id_name_parent_id_key" ON "imp_categories"("org_id", "name", "parent_id");

-- CreateIndex
CREATE INDEX "imp_finding_templates_org_id_is_system_idx" ON "imp_finding_templates"("org_id", "is_system");

-- CreateIndex
CREATE INDEX "imp_finding_templates_category_id_idx" ON "imp_finding_templates"("category_id");

-- CreateIndex
CREATE INDEX "imp_finding_templates_classification_model_id_idx" ON "imp_finding_templates"("classification_model_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_finding_templates_org_id_code_key" ON "imp_finding_templates"("org_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "imp_asset_type_definitions_org_id_code_key" ON "imp_asset_type_definitions"("org_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "imp_asset_type_fields_asset_type_definition_id_field_key_key" ON "imp_asset_type_fields"("asset_type_definition_id", "field_key");

-- CreateIndex
CREATE UNIQUE INDEX "imp_asset_type_constraints_asset_type_definition_id_allowed_key" ON "imp_asset_type_constraints"("asset_type_definition_id", "allowed_parent_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_asset_type_measurement_configs_asset_type_definition_id_key" ON "imp_asset_type_measurement_configs"("asset_type_definition_id", "measurement_field_template_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_location_type_definitions_org_id_code_key" ON "imp_location_type_definitions"("org_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "imp_location_type_fields_location_type_definition_id_field__key" ON "imp_location_type_fields"("location_type_definition_id", "field_key");

-- CreateIndex
CREATE UNIQUE INDEX "imp_location_type_constraints_location_type_definition_id_a_key" ON "imp_location_type_constraints"("location_type_definition_id", "allowed_parent_type_id");

-- CreateIndex
CREATE INDEX "imp_inspection_templates_org_id_is_system_idx" ON "imp_inspection_templates"("org_id", "is_system");

-- CreateIndex
CREATE INDEX "imp_inspection_templates_norm_type_idx" ON "imp_inspection_templates"("norm_type");

-- CreateIndex
CREATE INDEX "imp_inspection_templates_status_idx" ON "imp_inspection_templates"("status");

-- CreateIndex
CREATE UNIQUE INDEX "imp_inspection_templates_org_id_code_version_key" ON "imp_inspection_templates"("org_id", "code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "imp_inspection_template_checklist_links_inspection_template_key" ON "imp_inspection_template_checklist_links"("inspection_template_id", "checklist_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_inspection_template_measurement_sheet_links_inspection__key" ON "imp_inspection_template_measurement_sheet_links"("inspection_template_id", "measurement_sheet_template_id");

-- CreateIndex
CREATE INDEX "imp_inspection_template_version_history_inspection_template_idx" ON "imp_inspection_template_version_history"("inspection_template_id", "changed_at");

-- CreateIndex
CREATE UNIQUE INDEX "imp_document_templates_inspection_template_id_document_type_key" ON "imp_document_templates"("inspection_template_id", "document_type");

-- CreateIndex
CREATE INDEX "imp_document_sections_document_template_id_sort_order_idx" ON "imp_document_sections"("document_template_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "imp_document_sections_document_template_id_code_key" ON "imp_document_sections"("document_template_id", "code");

-- CreateIndex
CREATE INDEX "imp_generated_documents_org_id_idx" ON "imp_generated_documents"("org_id");

-- CreateIndex
CREATE INDEX "imp_generated_documents_inspection_plan_id_document_type_idx" ON "imp_generated_documents"("inspection_plan_id", "document_type");

-- CreateIndex
CREATE INDEX "imp_document_signatures_generated_document_id_signer_role_idx" ON "imp_document_signatures"("generated_document_id", "signer_role");

-- CreateIndex
CREATE INDEX "imp_measurement_sheet_templates_norm_type_idx" ON "imp_measurement_sheet_templates"("norm_type");

-- CreateIndex
CREATE INDEX "imp_measurement_sheet_templates_status_idx" ON "imp_measurement_sheet_templates"("status");

-- CreateIndex
CREATE INDEX "imp_measurement_sheet_templates_previous_version_id_idx" ON "imp_measurement_sheet_templates"("previous_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_measurement_sheet_templates_code_version_key" ON "imp_measurement_sheet_templates"("code", "version");

-- CreateIndex
CREATE INDEX "imp_measurement_sheet_sections_template_id_sort_order_idx" ON "imp_measurement_sheet_sections"("template_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "imp_measurement_sheet_sections_template_id_code_key" ON "imp_measurement_sheet_sections"("template_id", "code");

-- CreateIndex
CREATE INDEX "imp_measurement_sheet_fields_section_id_sort_order_idx" ON "imp_measurement_sheet_fields"("section_id", "sort_order");

-- CreateIndex
CREATE INDEX "imp_measurement_sheet_fields_auto_finding_template_id_idx" ON "imp_measurement_sheet_fields"("auto_finding_template_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_measurement_sheet_fields_section_id_code_key" ON "imp_measurement_sheet_fields"("section_id", "code");

-- CreateIndex
CREATE INDEX "imp_measurement_sheet_version_history_template_id_changed_a_idx" ON "imp_measurement_sheet_version_history"("template_id", "changed_at");

-- CreateIndex
CREATE INDEX "imp_measurement_sheet_records_org_id_idx" ON "imp_measurement_sheet_records"("org_id");

-- CreateIndex
CREATE INDEX "imp_measurement_sheet_records_template_id_idx" ON "imp_measurement_sheet_records"("template_id");

-- CreateIndex
CREATE INDEX "imp_measurement_sheet_records_asset_id_idx" ON "imp_measurement_sheet_records"("asset_id");

-- CreateIndex
CREATE INDEX "imp_measurement_sheet_records_inspection_plan_id_idx" ON "imp_measurement_sheet_records"("inspection_plan_id");

-- CreateIndex
CREATE INDEX "imp_measurement_sheet_records_status_idx" ON "imp_measurement_sheet_records"("status");

-- CreateIndex
CREATE UNIQUE INDEX "imp_location_images_location_id_key" ON "imp_location_images"("location_id");

-- CreateIndex
CREATE INDEX "imp_location_images_org_id_idx" ON "imp_location_images"("org_id");

-- CreateIndex
CREATE INDEX "imp_location_images_location_id_idx" ON "imp_location_images"("location_id");

-- CreateIndex
CREATE INDEX "imp_location_image_markers_org_id_idx" ON "imp_location_image_markers"("org_id");

-- CreateIndex
CREATE INDEX "imp_location_image_markers_location_image_id_idx" ON "imp_location_image_markers"("location_image_id");

-- CreateIndex
CREATE INDEX "imp_location_image_markers_asset_id_idx" ON "imp_location_image_markers"("asset_id");

-- CreateIndex
CREATE INDEX "imp_location_image_markers_finding_id_idx" ON "imp_location_image_markers"("finding_id");

-- CreateIndex
CREATE INDEX "imp_location_image_markers_standalone_measurement_id_idx" ON "imp_location_image_markers"("standalone_measurement_id");

-- CreateIndex
CREATE INDEX "imp_standalone_measurements_org_id_idx" ON "imp_standalone_measurements"("org_id");

-- CreateIndex
CREATE INDEX "imp_standalone_measurements_inspection_plan_id_idx" ON "imp_standalone_measurements"("inspection_plan_id");

-- CreateIndex
CREATE INDEX "imp_standalone_measurements_location_id_idx" ON "imp_standalone_measurements"("location_id");

-- CreateIndex
CREATE INDEX "imp_standalone_measurements_linked_asset_id_idx" ON "imp_standalone_measurements"("linked_asset_id");

-- CreateIndex
CREATE INDEX "imp_standalone_measurement_values_standalone_measurement_id_idx" ON "imp_standalone_measurement_values"("standalone_measurement_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_device_registrations_user_id_device_id_key" ON "imp_device_registrations"("user_id", "device_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_client_users_email_key" ON "imp_client_users"("email");

-- CreateIndex
CREATE INDEX "imp_client_users_email_idx" ON "imp_client_users"("email");

-- CreateIndex
CREATE INDEX "imp_client_access_contact_id_idx" ON "imp_client_access"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_client_access_client_user_id_contact_id_key" ON "imp_client_access"("client_user_id", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_client_magic_links_token_key" ON "imp_client_magic_links"("token");

-- CreateIndex
CREATE INDEX "imp_client_magic_links_token_idx" ON "imp_client_magic_links"("token");

-- CreateIndex
CREATE INDEX "imp_client_magic_links_email_idx" ON "imp_client_magic_links"("email");

-- CreateIndex
CREATE UNIQUE INDEX "imp_inspection_client_access_inspection_plan_id_client_user_key" ON "imp_inspection_client_access"("inspection_plan_id", "client_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_inspection_client_access_inspection_plan_id_invited_ema_key" ON "imp_inspection_client_access"("inspection_plan_id", "invited_email");

-- CreateIndex
CREATE INDEX "imp_inspection_messages_inspection_plan_id_created_at_idx" ON "imp_inspection_messages"("inspection_plan_id", "created_at");

-- CreateIndex
CREATE INDEX "imp_finding_resolutions_finding_id_idx" ON "imp_finding_resolutions"("finding_id");

-- CreateIndex
CREATE INDEX "imp_client_requests_org_id_status_idx" ON "imp_client_requests"("org_id", "status");

-- CreateIndex
CREATE INDEX "imp_client_requests_contact_id_idx" ON "imp_client_requests"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_voice_base_prompts_name_key" ON "imp_voice_base_prompts"("name");

-- CreateIndex
CREATE INDEX "imp_voice_template_prompts_org_id_idx" ON "imp_voice_template_prompts"("org_id");

-- CreateIndex
CREATE INDEX "imp_voice_template_prompts_template_id_idx" ON "imp_voice_template_prompts"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_voice_template_prompts_org_id_template_id_key" ON "imp_voice_template_prompts"("org_id", "template_id");

-- CreateIndex
CREATE INDEX "imp_voice_user_prompts_user_id_idx" ON "imp_voice_user_prompts"("user_id");

-- CreateIndex
CREATE INDEX "imp_voice_user_prompts_template_id_idx" ON "imp_voice_user_prompts"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_voice_user_prompts_user_id_template_id_key" ON "imp_voice_user_prompts"("user_id", "template_id");

-- AddForeignKey
ALTER TABLE "imp_inspection_types" ADD CONSTRAINT "imp_inspection_types_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_plan_status_types" ADD CONSTRAINT "imp_plan_status_types_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_asset_status_types" ADD CONSTRAINT "imp_asset_status_types_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_finding_status_types" ADD CONSTRAINT "imp_finding_status_types_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_report_status_types" ADD CONSTRAINT "imp_report_status_types_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_signatory_types" ADD CONSTRAINT "imp_signatory_types_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_signer_roles" ADD CONSTRAINT "imp_signer_roles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_pass_fail_status_types" ADD CONSTRAINT "imp_pass_fail_status_types_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_resolution_status_types" ADD CONSTRAINT "imp_resolution_status_types_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_client_request_types" ADD CONSTRAINT "imp_client_request_types_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_client_request_status_types" ADD CONSTRAINT "imp_client_request_status_types_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_norm_type_definitions" ADD CONSTRAINT "imp_norm_type_definitions_classification_model_id_fkey" FOREIGN KEY ("classification_model_id") REFERENCES "imp_classification_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_norm_configurations" ADD CONSTRAINT "imp_norm_configurations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_classification_characteristics" ADD CONSTRAINT "imp_classification_characteristics_classification_model_id_fkey" FOREIGN KEY ("classification_model_id") REFERENCES "imp_classification_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_classification_options" ADD CONSTRAINT "imp_classification_options_characteristic_id_fkey" FOREIGN KEY ("characteristic_id") REFERENCES "imp_classification_characteristics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_plans" ADD CONSTRAINT "imp_inspection_plans_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_plans" ADD CONSTRAINT "imp_inspection_plans_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "imp_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_plans" ADD CONSTRAINT "imp_inspection_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "imp_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_plans" ADD CONSTRAINT "imp_inspection_plans_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_plans" ADD CONSTRAINT "imp_inspection_plans_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_plans" ADD CONSTRAINT "imp_inspection_plans_installation_responsible_id_fkey" FOREIGN KEY ("installation_responsible_id") REFERENCES "imp_contact_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_plans" ADD CONSTRAINT "imp_inspection_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_plans" ADD CONSTRAINT "imp_inspection_plans_last_modified_by_fkey" FOREIGN KEY ("last_modified_by") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_plans" ADD CONSTRAINT "imp_inspection_plans_inspection_template_id_fkey" FOREIGN KEY ("inspection_template_id") REFERENCES "imp_inspection_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_assets" ADD CONSTRAINT "imp_assets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_assets" ADD CONSTRAINT "imp_assets_inspection_plan_id_fkey" FOREIGN KEY ("inspection_plan_id") REFERENCES "imp_inspection_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_assets" ADD CONSTRAINT "imp_assets_parent_asset_id_fkey" FOREIGN KEY ("parent_asset_id") REFERENCES "imp_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_assets" ADD CONSTRAINT "imp_assets_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "imp_inspection_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_assets" ADD CONSTRAINT "imp_assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_visual_inspections" ADD CONSTRAINT "imp_visual_inspections_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_visual_inspections" ADD CONSTRAINT "imp_visual_inspections_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "imp_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_visual_inspections" ADD CONSTRAINT "imp_visual_inspections_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_measurement_records" ADD CONSTRAINT "imp_measurement_records_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_measurement_records" ADD CONSTRAINT "imp_measurement_records_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "imp_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_measurement_records" ADD CONSTRAINT "imp_measurement_records_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_findings" ADD CONSTRAINT "imp_findings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_findings" ADD CONSTRAINT "imp_findings_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "imp_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_findings" ADD CONSTRAINT "imp_findings_visual_inspection_id_fkey" FOREIGN KEY ("visual_inspection_id") REFERENCES "imp_visual_inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_findings" ADD CONSTRAINT "imp_findings_measurement_record_id_fkey" FOREIGN KEY ("measurement_record_id") REFERENCES "imp_measurement_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_findings" ADD CONSTRAINT "imp_findings_finding_template_id_fkey" FOREIGN KEY ("finding_template_id") REFERENCES "imp_finding_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_findings" ADD CONSTRAINT "imp_findings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_findings" ADD CONSTRAINT "imp_findings_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_photos" ADD CONSTRAINT "imp_photos_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_photos" ADD CONSTRAINT "imp_photos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_signatures" ADD CONSTRAINT "imp_signatures_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_signatures" ADD CONSTRAINT "imp_signatures_inspection_plan_id_fkey" FOREIGN KEY ("inspection_plan_id") REFERENCES "imp_inspection_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_signatures" ADD CONSTRAINT "imp_signatures_signatory_user_id_fkey" FOREIGN KEY ("signatory_user_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_signatures" ADD CONSTRAINT "imp_signatures_signatory_contact_id_fkey" FOREIGN KEY ("signatory_contact_id") REFERENCES "imp_contact_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_reports" ADD CONSTRAINT "imp_reports_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_reports" ADD CONSTRAINT "imp_reports_inspection_plan_id_fkey" FOREIGN KEY ("inspection_plan_id") REFERENCES "imp_inspection_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_reports" ADD CONSTRAINT "imp_reports_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "imp_report_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_reports" ADD CONSTRAINT "imp_reports_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_reports" ADD CONSTRAINT "imp_reports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_locations" ADD CONSTRAINT "imp_inspection_locations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_locations" ADD CONSTRAINT "imp_inspection_locations_inspection_plan_id_fkey" FOREIGN KEY ("inspection_plan_id") REFERENCES "imp_inspection_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_locations" ADD CONSTRAINT "imp_inspection_locations_parent_location_id_fkey" FOREIGN KEY ("parent_location_id") REFERENCES "imp_inspection_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_locations" ADD CONSTRAINT "imp_inspection_locations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_checklist_items" ADD CONSTRAINT "imp_checklist_items_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_checklist_items" ADD CONSTRAINT "imp_checklist_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "imp_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_checklists" ADD CONSTRAINT "imp_checklists_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_checklists" ADD CONSTRAINT "imp_checklists_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "imp_checklists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_checklist_item_links" ADD CONSTRAINT "imp_checklist_item_links_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "imp_checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_checklist_item_links" ADD CONSTRAINT "imp_checklist_item_links_checklist_item_id_fkey" FOREIGN KEY ("checklist_item_id") REFERENCES "imp_checklist_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_checklist_version_history" ADD CONSTRAINT "imp_checklist_version_history_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "imp_checklists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_categories" ADD CONSTRAINT "imp_categories_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_categories" ADD CONSTRAINT "imp_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "imp_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_finding_templates" ADD CONSTRAINT "imp_finding_templates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_finding_templates" ADD CONSTRAINT "imp_finding_templates_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "imp_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_finding_templates" ADD CONSTRAINT "imp_finding_templates_classification_model_id_fkey" FOREIGN KEY ("classification_model_id") REFERENCES "imp_classification_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_measurement_field_templates" ADD CONSTRAINT "imp_measurement_field_templates_norm_configuration_id_fkey" FOREIGN KEY ("norm_configuration_id") REFERENCES "imp_norm_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_report_templates" ADD CONSTRAINT "imp_report_templates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_asset_type_definitions" ADD CONSTRAINT "imp_asset_type_definitions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_asset_type_fields" ADD CONSTRAINT "imp_asset_type_fields_asset_type_definition_id_fkey" FOREIGN KEY ("asset_type_definition_id") REFERENCES "imp_asset_type_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_asset_type_constraints" ADD CONSTRAINT "imp_asset_type_constraints_asset_type_definition_id_fkey" FOREIGN KEY ("asset_type_definition_id") REFERENCES "imp_asset_type_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_asset_type_constraints" ADD CONSTRAINT "imp_asset_type_constraints_allowed_parent_type_id_fkey" FOREIGN KEY ("allowed_parent_type_id") REFERENCES "imp_asset_type_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_asset_type_measurement_configs" ADD CONSTRAINT "imp_asset_type_measurement_configs_asset_type_definition_i_fkey" FOREIGN KEY ("asset_type_definition_id") REFERENCES "imp_asset_type_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_asset_type_measurement_configs" ADD CONSTRAINT "imp_asset_type_measurement_configs_measurement_field_templ_fkey" FOREIGN KEY ("measurement_field_template_id") REFERENCES "imp_measurement_field_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_location_type_definitions" ADD CONSTRAINT "imp_location_type_definitions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_location_type_fields" ADD CONSTRAINT "imp_location_type_fields_location_type_definition_id_fkey" FOREIGN KEY ("location_type_definition_id") REFERENCES "imp_location_type_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_location_type_constraints" ADD CONSTRAINT "imp_location_type_constraints_location_type_definition_id_fkey" FOREIGN KEY ("location_type_definition_id") REFERENCES "imp_location_type_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_location_type_constraints" ADD CONSTRAINT "imp_location_type_constraints_allowed_parent_type_id_fkey" FOREIGN KEY ("allowed_parent_type_id") REFERENCES "imp_location_type_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_templates" ADD CONSTRAINT "imp_inspection_templates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_templates" ADD CONSTRAINT "imp_inspection_templates_classification_model_id_fkey" FOREIGN KEY ("classification_model_id") REFERENCES "imp_classification_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_templates" ADD CONSTRAINT "imp_inspection_templates_forked_from_id_fkey" FOREIGN KEY ("forked_from_id") REFERENCES "imp_inspection_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_templates" ADD CONSTRAINT "imp_inspection_templates_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "imp_inspection_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_template_checklist_links" ADD CONSTRAINT "imp_inspection_template_checklist_links_inspection_templat_fkey" FOREIGN KEY ("inspection_template_id") REFERENCES "imp_inspection_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_template_checklist_links" ADD CONSTRAINT "imp_inspection_template_checklist_links_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "imp_checklists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_template_measurement_sheet_links" ADD CONSTRAINT "imp_inspection_template_measurement_sheet_links_inspection_fkey" FOREIGN KEY ("inspection_template_id") REFERENCES "imp_inspection_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_template_measurement_sheet_links" ADD CONSTRAINT "imp_inspection_template_measurement_sheet_links_measuremen_fkey" FOREIGN KEY ("measurement_sheet_template_id") REFERENCES "imp_measurement_sheet_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_template_version_history" ADD CONSTRAINT "imp_inspection_template_version_history_inspection_templat_fkey" FOREIGN KEY ("inspection_template_id") REFERENCES "imp_inspection_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_document_templates" ADD CONSTRAINT "imp_document_templates_inspection_template_id_fkey" FOREIGN KEY ("inspection_template_id") REFERENCES "imp_inspection_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_document_template_docx_revisions" ADD CONSTRAINT "imp_document_template_docx_revisions_document_template_id_fkey" FOREIGN KEY ("document_template_id") REFERENCES "imp_document_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_document_template_docx_revisions" ADD CONSTRAINT "imp_document_template_docx_revisions_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_document_sections" ADD CONSTRAINT "imp_document_sections_document_template_id_fkey" FOREIGN KEY ("document_template_id") REFERENCES "imp_document_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_document_sections" ADD CONSTRAINT "imp_document_sections_parent_section_id_fkey" FOREIGN KEY ("parent_section_id") REFERENCES "imp_document_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_generated_documents" ADD CONSTRAINT "imp_generated_documents_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_generated_documents" ADD CONSTRAINT "imp_generated_documents_document_template_id_fkey" FOREIGN KEY ("document_template_id") REFERENCES "imp_document_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_generated_documents" ADD CONSTRAINT "imp_generated_documents_inspection_plan_id_fkey" FOREIGN KEY ("inspection_plan_id") REFERENCES "imp_inspection_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_document_signatures" ADD CONSTRAINT "imp_document_signatures_generated_document_id_fkey" FOREIGN KEY ("generated_document_id") REFERENCES "imp_generated_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_measurement_sheet_templates" ADD CONSTRAINT "imp_measurement_sheet_templates_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "imp_measurement_sheet_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_measurement_sheet_sections" ADD CONSTRAINT "imp_measurement_sheet_sections_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "imp_measurement_sheet_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_measurement_sheet_fields" ADD CONSTRAINT "imp_measurement_sheet_fields_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "imp_measurement_sheet_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_measurement_sheet_fields" ADD CONSTRAINT "imp_measurement_sheet_fields_auto_finding_template_id_fkey" FOREIGN KEY ("auto_finding_template_id") REFERENCES "imp_finding_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_measurement_sheet_version_history" ADD CONSTRAINT "imp_measurement_sheet_version_history_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "imp_measurement_sheet_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_measurement_sheet_records" ADD CONSTRAINT "imp_measurement_sheet_records_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_measurement_sheet_records" ADD CONSTRAINT "imp_measurement_sheet_records_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "imp_measurement_sheet_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_measurement_sheet_records" ADD CONSTRAINT "imp_measurement_sheet_records_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "imp_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_measurement_sheet_records" ADD CONSTRAINT "imp_measurement_sheet_records_inspection_plan_id_fkey" FOREIGN KEY ("inspection_plan_id") REFERENCES "imp_inspection_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_location_images" ADD CONSTRAINT "imp_location_images_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_location_images" ADD CONSTRAINT "imp_location_images_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "imp_inspection_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_location_image_markers" ADD CONSTRAINT "imp_location_image_markers_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_location_image_markers" ADD CONSTRAINT "imp_location_image_markers_location_image_id_fkey" FOREIGN KEY ("location_image_id") REFERENCES "imp_location_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_location_image_markers" ADD CONSTRAINT "imp_location_image_markers_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "imp_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_location_image_markers" ADD CONSTRAINT "imp_location_image_markers_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "imp_findings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_location_image_markers" ADD CONSTRAINT "imp_location_image_markers_standalone_measurement_id_fkey" FOREIGN KEY ("standalone_measurement_id") REFERENCES "imp_standalone_measurements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_standalone_measurements" ADD CONSTRAINT "imp_standalone_measurements_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_standalone_measurements" ADD CONSTRAINT "imp_standalone_measurements_inspection_plan_id_fkey" FOREIGN KEY ("inspection_plan_id") REFERENCES "imp_inspection_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_standalone_measurements" ADD CONSTRAINT "imp_standalone_measurements_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "imp_inspection_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_standalone_measurements" ADD CONSTRAINT "imp_standalone_measurements_linked_asset_id_fkey" FOREIGN KEY ("linked_asset_id") REFERENCES "imp_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_standalone_measurement_values" ADD CONSTRAINT "imp_standalone_measurement_values_standalone_measurement_i_fkey" FOREIGN KEY ("standalone_measurement_id") REFERENCES "imp_standalone_measurements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_sync_queue" ADD CONSTRAINT "imp_sync_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_sync_queue" ADD CONSTRAINT "imp_sync_queue_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_device_registrations" ADD CONSTRAINT "imp_device_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_client_access" ADD CONSTRAINT "imp_client_access_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "imp_client_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_client_access" ADD CONSTRAINT "imp_client_access_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "imp_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_client_magic_links" ADD CONSTRAINT "imp_client_magic_links_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "imp_client_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_client_magic_links" ADD CONSTRAINT "imp_client_magic_links_inspection_plan_id_fkey" FOREIGN KEY ("inspection_plan_id") REFERENCES "imp_inspection_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_client_access" ADD CONSTRAINT "imp_inspection_client_access_inspection_plan_id_fkey" FOREIGN KEY ("inspection_plan_id") REFERENCES "imp_inspection_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_client_access" ADD CONSTRAINT "imp_inspection_client_access_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "imp_client_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_messages" ADD CONSTRAINT "imp_inspection_messages_inspection_plan_id_fkey" FOREIGN KEY ("inspection_plan_id") REFERENCES "imp_inspection_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_messages" ADD CONSTRAINT "imp_inspection_messages_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "imp_client_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_messages" ADD CONSTRAINT "imp_inspection_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_message_attachments" ADD CONSTRAINT "imp_message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "imp_inspection_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_finding_resolutions" ADD CONSTRAINT "imp_finding_resolutions_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "imp_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_finding_resolutions" ADD CONSTRAINT "imp_finding_resolutions_resolved_by_client_user_id_fkey" FOREIGN KEY ("resolved_by_client_user_id") REFERENCES "imp_client_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_finding_resolution_photos" ADD CONSTRAINT "imp_finding_resolution_photos_resolution_id_fkey" FOREIGN KEY ("resolution_id") REFERENCES "imp_finding_resolutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_client_requests" ADD CONSTRAINT "imp_client_requests_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_client_requests" ADD CONSTRAINT "imp_client_requests_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "imp_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_client_requests" ADD CONSTRAINT "imp_client_requests_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "imp_client_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_client_requests" ADD CONSTRAINT "imp_client_requests_related_inspection_plan_id_fkey" FOREIGN KEY ("related_inspection_plan_id") REFERENCES "imp_inspection_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_voice_template_prompts" ADD CONSTRAINT "imp_voice_template_prompts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_voice_template_prompts" ADD CONSTRAINT "imp_voice_template_prompts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "imp_measurement_sheet_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_voice_user_prompts" ADD CONSTRAINT "imp_voice_user_prompts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_voice_user_prompts" ADD CONSTRAINT "imp_voice_user_prompts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "imp_measurement_sheet_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
