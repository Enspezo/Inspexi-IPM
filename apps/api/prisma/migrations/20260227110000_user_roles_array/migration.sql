-- Migration: user-roles-array
-- Converts single `role Role` to `roles Role[]` while preserving existing data

-- Step 1: Add new roles column (nullable initially to allow backfill)
ALTER TABLE "imp_users" ADD COLUMN "roles" "Role"[];

-- Step 2: Copy existing single role into array
UPDATE "imp_users" SET "roles" = ARRAY["role"::"Role"];

-- Step 3: Set NOT NULL constraint (all rows now have a value)
ALTER TABLE "imp_users" ALTER COLUMN "roles" SET NOT NULL;

-- Step 4: Set default for future rows
ALTER TABLE "imp_users" ALTER COLUMN "roles" SET DEFAULT ARRAY[]::"Role"[];

-- Step 5: Drop old column
ALTER TABLE "imp_users" DROP COLUMN "role";
