import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeatureSetting } from './feature-setting.entity.js';
import { FeatureService } from './feature.service.js';
import { FeaturesController } from './features.controller.js';

// Stage 2: the features a campus can switch off, and their settings.
@Module({
  imports: [TypeOrmModule.forFeature([FeatureSetting])],
  controllers: [FeaturesController],
  providers: [FeatureService],
  exports: [FeatureService],
})
export class FeaturesModule {}
