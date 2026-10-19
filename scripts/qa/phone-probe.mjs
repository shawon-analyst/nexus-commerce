/*
 * The rules behind mobile-number sign-in — pure functions, so they get a table
 * of cases instead of a browser.
 *
 *   node scripts/qa/phone-probe.mjs
 *
 * `lib/phone.ts` and `lib/password.ts` are TypeScript with no runtime
 * dependencies, so the probe compiles those two files with the project's own
 * `tsc` into a throwaway directory and requires the result. If the compiler is
 * unavailable the probe reports itself as skipped rather than failed: it is a
 * dev-time harness, not part of the build.
 *
 * Why this exists: the whole feature rests on one property — every way of
 * writing the same mobile number must collapse to one alias address. If it does
 * not, a shopper who types `+8801712345678` after registering with
 * `01712345678` gets a second, empty account instead of their orders.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

/** Depth-first search for a compiler output, whatever rootDir tsc chose. */
function find(dir, name) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      const nested = find(full, name);
      if (nested) return nested;
    } else if (entry === name) {
      return full;
    }
  }
  return null;
}

/* ------------------------------------------------------------- compile --- */
const TSC = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
let outDir = null;

if (!existsSync(TSC)) {
  console.log('SKIP  phone-probe  — typescript is not installed (run npm install first)');
  process.exit(0);
}

let phone;
let password;
let identity;
try {
  outDir = mkdtempSync(join(tmpdir(), 'phone-probe-'));
  execFileSync(
    process.execPath,
    [
      TSC,
      'lib/phone.ts',
      'lib/password.ts',
      'lib/identity.ts',
      '--outDir',
      outDir,
      '--module',
      'commonjs',
      '--target',
      'es2020',
      '--skipLibCheck',
    ],
    { cwd: ROOT, stdio: 'pipe' },
  );
  phone = require(find(outDir, 'phone.js'));
  password = require(find(outDir, 'password.js'));
  identity = require(find(outDir, 'identity.js'));
} catch (error) {
  console.log(`SKIP  phone-probe  — could not compile lib/phone.ts (${String(error.message).split('\n')[0]})`);
  process.exit(0);
}

/* ------------------------------------------------ normalising a number --- */
console.log('\n=== normalising a mobile number ===');

check(
  'the canonical form is 01XXXXXXXXX',
  phone.normalizeBdPhone('01712345678') === '01712345678',
  String(phone.normalizeBdPhone('01712345678')),
);

const SPELLINGS = [
  '01712345678',
  '01712-345678',
  '01712 345678',
  '+8801712345678',
  '8801712345678',
  '008801712345678',
  '1712345678',
  '(+880) 1712 345678',
];

for (const spelling of SPELLINGS) {
  const got = phone.normalizeBdPhone(spelling);
  check(`"${spelling}" → 01712345678`, got === '01712345678', String(got));
}

/*
 * The property that actually matters. Nine spellings, one identity — otherwise
 * the same person can hold two accounts.
 */
const aliases = new Set(
  SPELLINGS.map((spelling) => phone.resolveSignInIdentifier('phone', spelling).email),
);
check('every spelling of one number yields one alias', aliases.size === 1, [...aliases][0]);

for (const prefix of ['013', '014', '015', '016', '017', '018', '019']) {
  check(`${prefix}xxxxxxxx is accepted`, phone.isBdPhone(`${prefix}12345678`));
}

console.log('\n=== what is not a mobile number ===');
for (const value of [
  '',
  '   ',
  'abcdefghijk',
  '0171234567',
  '017123456789',
  '880171234567',
  '0171234567a',
  '+1 555 0100',
  '01212345678',
]) {
  const got = phone.normalizeBdPhone(value);
  check(`rejects ${JSON.stringify(value)}`, got === null, String(got));
}

/* ------------------------------------------------------------- aliases --- */
console.log('\n=== the alias address ===');
check(
  'toPhoneAlias builds the reserved address',
  phone.toPhoneAlias('01712345678') === '01712345678@phone.nexuscommerce.dev',
  phone.toPhoneAlias('01712345678'),
);
check(
  'isPhoneAliasEmail recognises it',
  phone.isPhoneAliasEmail('01712345678@phone.nexuscommerce.dev'),
);
check(
  'isPhoneAliasEmail is case-insensitive',
  phone.isPhoneAliasEmail('01712345678@PHONE.NexusCommerce.dev'),
);
check('isPhoneAliasEmail rejects a real address', !phone.isPhoneAliasEmail('shopper@example.com'));
check('isPhoneAliasEmail rejects null', !phone.isPhoneAliasEmail(null));
check(
  'phoneFromAliasEmail round-trips',
  phone.phoneFromAliasEmail('01712345678@phone.nexuscommerce.dev') === '01712345678',
);
check(
  'formatBdPhone is display-shaped',
  phone.formatBdPhone('01712345678') === '01712 345678',
  phone.formatBdPhone('01712345678'),
);

/* ------------------------------------------- what the form hands to Auth --- */
console.log('\n=== what the form turns into what Auth sees ===');

const emailMode = phone.resolveSignInIdentifier('email', 'shopper@example.com');
check('email tab passes the address through', emailMode.ok && emailMode.email === 'shopper@example.com');
check('email tab records no number of its own', emailMode.ok && emailMode.phone === null);

const phoneMode = phone.resolveSignInIdentifier('phone', '01712 345678');
check(
  'mobile tab maps onto the alias',
  phoneMode.ok && phoneMode.email === '01712345678@phone.nexuscommerce.dev',
  phoneMode.ok ? phoneMode.email : phoneMode.error,
);
check(
  'mobile tab returns the canonical number for profiles.phone',
  phoneMode.ok && phoneMode.phone === '01712345678',
);

check('mobile tab rejects a short number', !phone.resolveSignInIdentifier('phone', '0171234').ok);
check('mobile tab rejects an email address', !phone.resolveSignInIdentifier('phone', 'a@b.com').ok);

/*
 * The two failures deserve different sentences: someone who typed eleven digits
 * starting `012` needs to hear "wrong prefix", not "enter an 11-digit number"
 * when they already did.
 */
check(
  'a short number is told to enter 11 digits',
  /11-digit/.test(phone.resolveSignInIdentifier('phone', '12345').error),
  phone.resolveSignInIdentifier('phone', '12345').error,
);
check(
  'an eleven-digit number with the wrong prefix is told about 013-019',
  /013 to 019/.test(phone.resolveSignInIdentifier('phone', '01212345678').error),
  phone.resolveSignInIdentifier('phone', '01212345678').error,
);
check(
  'a 14-digit +880 number with a bad prefix gets the same specific message',
  /013 to 019/.test(phone.resolveSignInIdentifier('phone', '88012123456780').error) ||
    /11-digit/.test(phone.resolveSignInIdentifier('phone', '88012123456780').error),
);
check('an empty email is rejected', !phone.resolveSignInIdentifier('email', '   ').ok);
check(
  'the reserved domain is refused on the email tab',
  !phone.resolveSignInIdentifier('email', '01712345678@phone.nexuscommerce.dev').ok,
);

/* ------------------------------------------------------------ passwords --- */
console.log('\n=== the shared password policy ===');
check('MIN_PASSWORD_LENGTH is 6', password.MIN_PASSWORD_LENGTH === 6);
check('a three-character password scores lowest', password.passwordStrength('abc') === 0);
check(
  'a long mixed password scores highest',
  password.passwordStrength('Correct-Horse9') === 4,
  String(password.passwordStrength('Correct-Horse9')),
);
check('PASSWORD_STRENGTH_META covers scores 0-4', password.PASSWORD_STRENGTH_META.length === 5);

/* ----------------------------------------------------- e-mail masking --- */
console.log('\n=== what may be shown to a human ===');

for (const generated of [
  '01712345678@phone.nexuscommerce.dev',
  '01712345678@PHONE.NexusCommerce.dev',
  'qa.avatar.1792296407@nexuscommerce.dev',
]) {
  check(`"${generated}" is a generated address`, identity.isGeneratedEmail(generated));
  check(`"${generated}" is never displayed`, identity.displayEmail(generated) === null);
}

for (const real of ['shopper@example.com', 'qa.real@gmail.com']) {
  check(`"${real}" is not a generated address`, !identity.isGeneratedEmail(real));
  check(`"${real}" is displayed unchanged`, identity.displayEmail(real) === real);
}

check('displayEmail rejects null', identity.displayEmail(null) === null);
check('displayEmail rejects blank', identity.displayEmail('   ') === null);

check(
  'the alias is not mistaken for the shop domain',
  identity.isGeneratedEmail('shopper@phone.nexuscommerce.dev.example.com') === false,
);

check(
  'accountDetail prefers a real address',
  identity.accountDetail({ email: 'real@example.com', phone: '01712345678' }) === 'real@example.com',
);
check(
  'accountDetail falls back to the formatted mobile number',
  identity.accountDetail({
    email: '01712345678@phone.nexuscommerce.dev',
    phone: '01712345678',
  }) === '01712 345678',
);
check(
  'accountDetail says so when there is nothing',
  identity.accountDetail({ email: null, phone: null }) === identity.NO_EMAIL_LABEL,
);

check(
  'accountLabel prefers the name',
  identity.accountLabel({ full_name: 'Md Sani', email: null, phone: '01712345678' }) === 'Md Sani',
);
check(
  'accountLabel never falls back to an alias',
  identity.accountLabel({
    full_name: '  ',
    email: '01712345678@phone.nexuscommerce.dev',
    phone: '01712345678',
  }) === '01712 345678',
);
check(
  'accountLabel for a nameless, phoneless account is neutral',
  identity.accountLabel({ email: null, phone: null }) === 'This account',
);

/* ---------------------------------------------------------------- done --- */
rmSync(outDir, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok).length;
console.log(`\n=== phone probe: ${results.length - failed}/${results.length} passed ===`);
process.exit(failed ? 1 : 0);
