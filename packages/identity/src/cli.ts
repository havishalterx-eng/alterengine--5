import { loadConfig } from '@alter/contracts';
import {
  OWNER_ONLY_ACTIONS,
  PERMISSION_TOGGLES,
  TOGGLE_LABELS,
} from './permissions.js';
import { createIdentityStore, type IdentityStore } from './store.js';

/**
 * Component 42's terminal surface — the physical test for step 1.
 *
 * There is no console yet (it arrives at step 3 with component 48), so the
 * thing a human can run and read is this CLI. Every command prints real
 * rows read from the real database: `member show` prints the member's
 * resolved permission list, which is the output that proves step 1.
 *
 * Usage:
 *   pnpm identity <command>      (requires DATABASE_URL in the environment;
 *                                  see the step-1 report for the exact line)
 *
 * Commands:
 *   account create <name> <ownerEmail>
 *   member add <accountName> <email> <role>
 *   member show <accountName> <email>
 *   roles <accountName>
 */

interface Command {
  readonly name: string;
  readonly usage: string;
  run(store: IdentityStore, args: readonly string[]): Promise<void>;
}

const commands: readonly Command[] = [
  {
    name: 'account',
    usage: 'account create <name> <ownerEmail>',
    async run(store, args) {
      if (args[0] !== 'create' || args.length !== 3) badUsage('account');
      const name = args[1] ?? '';
      const ownerEmail = args[2] ?? '';
      const account = await store.createAccount({ name, ownerEmail });
      console.log('account created');
      console.log(`  name      : ${account.name}`);
      console.log(`  owner     : ${ownerEmail}`);
      console.log(`  account id: ${account.accountId}`);
    },
  },
  {
    name: 'member',
    usage: 'member add <accountName> <email> <role> | member show <accountName> <email>',
    async run(store, args) {
      if (args[0] === 'add' && args.length === 4) {
        const account = await mustFindAccount(store, args[1] ?? '');
        const email = args[2] ?? '';
        const role = args[3] ?? '';
        const member = await store.addMember({ accountId: account.accountId, email, role });
        console.log('member added');
        console.log(`  account : ${account.name}`);
        console.log(`  email   : ${email}`);
        console.log(`  role    : ${role}`);
        console.log(`  user id : ${member.userId}`);
        return;
      }
      if (args[0] === 'show' && args.length === 3) {
        const account = await mustFindAccount(store, args[1] ?? '');
        const email = args[2] ?? '';
        const user = await store.findUserByEmail(email);
        if (user === null) {
          console.log(`no user with email ${email} exists`);
          process.exitCode = 1;
          return;
        }
        const resolved = await store.resolvePermissions({
          accountId: account.accountId,
          userId: user.userId,
        });
        if (resolved === null) {
          console.log(`${email} is not a member of account "${account.name}"`);
          process.exitCode = 1;
          return;
        }
        console.log(`member ${email} in account "${account.name}"`);
        console.log(`  role    : ${resolved.roleName}`);
        console.log(`  owner   : ${resolved.isOwner ? 'yes' : 'no'}`);
        console.log(`  permissions (${resolved.permissions.length} of ${PERMISSION_TOGGLES.length}):`);
        for (const toggle of PERMISSION_TOGGLES) {
          const granted = resolved.permissions.includes(toggle);
          console.log(`    [${granted ? 'x' : ' '}] ${TOGGLE_LABELS[toggle]}`);
        }
        console.log('  owner-only actions (never grantable through a role):');
        for (const action of OWNER_ONLY_ACTIONS) {
          console.log(`    [${resolved.isOwner ? 'x' : ' '}] ${action}`);
        }
        return;
      }
      badUsage('member');
    },
  },
  {
    name: 'roles',
    usage: 'roles <accountName>',
    async run(store, args) {
      if (args.length !== 1) badUsage('roles');
      const account = await mustFindAccount(store, args[0] ?? '');
      const roles = await store.listRoles(account.accountId);
      console.log(`roles available in account "${account.name}"`);
      for (const role of roles) {
        console.log(`  ${role.name}${role.predefined ? ' (predefined)' : ' (custom)'}`);
        for (const toggle of role.toggles) {
          console.log(`      - ${TOGGLE_LABELS[toggle]}`);
        }
      }
    },
  },
];

async function main(): Promise<void> {
  const [commandName, ...args] = process.argv.slice(2);
  const command = commands.find((candidate) => candidate.name === commandName);
  if (command === undefined) {
    console.log('alter identity — component 42 terminal surface\n');
    for (const candidate of commands) console.log(`  ${candidate.usage}`);
    process.exitCode = commandName === undefined ? 0 : 1;
    return;
  }
  const store = createIdentityStore({ databaseUrl: loadConfig().databaseUrl });
  try {
    await store.migrate();
    await command.run(store, args);
  } finally {
    await store.close();
  }
}

async function mustFindAccount(store: IdentityStore, name: string) {
  const account = await store.findAccountByName(name);
  if (account === null) {
    console.log(`no account named "${name}" exists`);
    process.exitCode = 1;
    throw new Error(`no account named "${name}"`);
  }
  return account;
}

function badUsage(commandName: string): never {
  const command = commands.find((candidate) => candidate.name === commandName);
  console.log(`usage: ${command?.usage ?? commandName}`);
  process.exitCode = 1;
  throw new Error('bad usage');
}

await main();
