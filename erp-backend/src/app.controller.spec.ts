import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;
  const dataSource = { query: vi.fn() };

  beforeEach(async () => {
    dataSource.query.mockReset();

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: DataSource, useValue: dataSource }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('status', () => {
    it('should report that the server is active', () => {
      expect(appController.getStatus()).toMatchObject({
        status: 'ok',
        message: 'SPS ERP backend server is active',
      });
    });
  });

  describe('health', () => {
    it('should report the database as up when it answers', async () => {
      dataSource.query.mockResolvedValue([{ '?column?': 1 }]);

      await expect(appController.getHealth()).resolves.toMatchObject({
        status: 'ok',
        server: 'up',
        database: 'up',
      });
    });

    it('should respond 503 when the database is unreachable', async () => {
      dataSource.query.mockRejectedValue(new Error('connection refused'));

      await expect(appController.getHealth()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
