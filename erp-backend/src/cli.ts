import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { removeDemoUsers, seedDemoUsers } from './demo/seed-demo-users.js';
import {
  CliError,
  createPlatformAdmin,
} from './identity/cli/create-platform-admin.js';
import { install } from './organizations/cli/install.js';

// Backend commands: npm run cli -- <command> [options]
//   install --organization "Sunrise Schools" --campus "Main campus"
//           --timezone Africa/Lagos --admin-email ada@school.test --admin-name "Ada Admin"
//   create-platform-admin --name "Ada Admin" --email ada@school.test
//   seed-demo-users --password <password>   one sign-in per role
//   seed-demo-users --remove                archives them all
const USAGE = [
  'Usage:',
  '  npm run cli -- install --organization <name> --campus <name> --timezone <IANA zone> --admin-email <email> --admin-name <name>',
  '  npm run cli -- create-platform-admin --name <name> --email <email>',
  '  npm run cli -- seed-demo-users --password <password>',
  '  npm run cli -- seed-demo-users --remove',
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

  async 'seed-demo-users'(app, args) {
    const { values } = parseArgs({
      args,
      options: {
        password: { type: 'string' },
        remove: { type: 'boolean' },
      },
      strict: true,
    });
    if (values.remove) {
      if (values.password !== undefined) {
        throw new CliError('Use either --password or --remove, not both.');
      }
      const count = await removeDemoUsers(app);
      console.log(`Archived ${count} demo accounts and ended their sessions.`);
      return;
    }
    const result = await seedDemoUsers(app, { password: values.password });
    console.log('Demo accounts ready (sign in with email and password):');
    for (const account of result.accounts) {
      const state = account.created ? 'created' : 'restored';
      console.log(`  ${account.email.padEnd(38)} ${account.name} (${state})`);
    }
    console.log(`Campus: ${result.schoolId}`);
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
