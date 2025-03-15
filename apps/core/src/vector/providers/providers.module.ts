import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { QdrantProvider } from "./qdrant.provider";

@Module({
  imports: [ConfigModule],
  providers: [QdrantProvider],
  exports: [QdrantProvider],
})
export class VectorProvidersModule {}
