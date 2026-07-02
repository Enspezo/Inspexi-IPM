-- AlterEnum: twee nieuwe nummering-modellen (LOCATION/ASSET-nodes)
ALTER TYPE "NumberingModel" ADD VALUE 'LOCATION_NODE';
ALTER TYPE "NumberingModel" ADD VALUE 'ASSET_NODE';

-- AlterTable: server-toegekend, uniek-per-org nodeNumber op de AssetNode-boom
ALTER TABLE "imp_asset_nodes" ADD COLUMN "node_number" TEXT;

-- AlterTable: shortcode voor de [typecode]-placeholder
ALTER TABLE "imp_asset_type_definitions" ADD COLUMN "short_code" TEXT;
ALTER TABLE "imp_location_type_definitions" ADD COLUMN "short_code" TEXT;

-- CreateIndex: uniek-per-org (Postgres staat meerdere NULLs toe, dus bestaande rijen botsen niet)
CREATE UNIQUE INDEX "imp_asset_nodes_org_id_node_number_key" ON "imp_asset_nodes"("org_id", "node_number");
CREATE UNIQUE INDEX "imp_asset_type_definitions_org_id_short_code_key" ON "imp_asset_type_definitions"("org_id", "short_code");
CREATE UNIQUE INDEX "imp_location_type_definitions_org_id_short_code_key" ON "imp_location_type_definitions"("org_id", "short_code");
