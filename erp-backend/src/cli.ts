import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import {
  CliError,
  createPlatformAdmin,
} from './identity/cli/create-platform-admin.js';

// Backend commands: npm run cli -- <command> [options]
//   create-platform-admin --name "Ada Admin" --email ada@school.test
const USAGE =
  'Usage: npm run cli -- create-platform-admin --name <name> --email <email>';

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command !== 'create-platform-admin') {
    console.error(USAGE);
    return 2;
  }
  const { values } = parseArgs({
    args: rest,
    options: { name: { type: 'string' }, email: { type: 'string' } },
    strict: true,
  });

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  try {
    const result = await createPlatformAdmin(app, values);
    console.log(`Account created for ${values.email}.`);
    console.log(
      `One-time invitation link (expires ${result.expiresAt.toISOString()}):`,
    );
    console.log(result.link);
    return 0;
  } catch (error) {
    if (error instanceof CliError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  } finally {
    await app.close();
  }
}

process.exitCode = await main(process.argv.slice(2));
