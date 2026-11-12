import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import {
  CliError,
  createPlatformAdmin,
} from './identity/cli/create-platform-admin.js';
import { install } from './organizations/cli/install.js';

// Backend commands: npm run cli -- <command> [options]
//   install --organization "Sunrise Schools" --campus "Main campus"
//           --timezone Africa/Lagos --admin-email ada@school.test --admin-name "Ada Admin"
//   create-platform-admin --name "Ada Admin" --email ada@school.test
const USAGE = [
  'Usage:',
  '  npm run cli -- install --organization <name> --campus <name> --timezone <IANA zone> --admin-email <email> --admin-name <name>',
  '  npm run cli -- create-platform-admin --name <name> --email <email>',
].join('\n');

type Command = (
  app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>,
  args: string[],
) => Promise<void>;

const COMMANDS: Record<string, Command> = {
  async install(app, args) {
    const { values } = parseArgs({
      args,
      options: {
        organization: { type: 'string' },
        campus: { type: 'string' },
        timezone: { type: 'string' },
        'admin-email': { type: 'string' },
        'admin-name': { type: 'string' },
      },
      strict: true,
    });
    const result = await install(app, {
      organization: values.organization,
      campus: values.campus,
      timezone: values.timezone,
      adminEmail: values['admin-email'],
      adminName: values['admin-name'],
    });
    console.log('Installed.');
    console.log(`Organization: ${result.organizationId}`);
    console.log(`Campus:       ${result.schoolId}`);
    console.log(
      `Platform administrator invitation link (one-time, expires ${result.expiresAt.toISOString()}):`,
    );
    console.log(result.link);
  },

  async 'create-platform-admin'(app, args) {
    const { values } = parseArgs({
      args,
      options: { name: { type: 'string' }, email: { type: 'string' } },
      strict: true,
    });
    const result = await createPlatformAdmin(app, values);
    console.log(`Account created for ${values.email}.`);
    console.log(
      `One-time invitation link (expires ${result.expiresAt.toISOString()}):`,
    );
    console.log(result.link);
  },
};

async function main(argv: string[]): Promise<number> {
  const [name, ...rest] = argv;
  const command = name ? COMMANDS[name] : undefined;
  if (!command || !Object.hasOwn(COMMANDS, name)) {
    console.error(USAGE);
    return 2;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  try {
    await command(app, rest);
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
