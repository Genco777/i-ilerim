import NextAuth, { type NextAuthConfig } from 'next-auth';
import Nodemailer from 'next-auth/providers/nodemailer';
import Facebook from 'next-auth/providers/facebook';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/lib/db';
import {
  users,
  accounts,
  sessions,
  verificationTokens,
} from '@/lib/db/schema';

const ALLOWED_EMAIL = 'info@fly-froth.com';

// Build provider list dynamically: Facebook only if both env vars are set
// (otherwise NextAuth throws at module load when secret is undefined).
function buildProviders(): NextAuthConfig['providers'] {
  const list: NextAuthConfig['providers'] = [
    Nodemailer({
      server: process.env.EMAIL_SERVER!,
      from: process.env.EMAIL_FROM!,
    }),
  ];

  const fbId = process.env.META_APP_ID;
  const fbSecret = process.env.META_APP_SECRET;
  if (fbId && fbSecret) {
    list.push(
      Facebook({
        clientId: fbId,
        clientSecret: fbSecret,
        // Request email scope so we can match against allowlist.
        authorization: { params: { scope: 'email,public_profile' } },
      }),
    );
  }
  return list;
}

export const authConfig: NextAuthConfig = {
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: buildProviders(),
  pages: { signIn: '/admin/login' },
  callbacks: {
    async signIn({ user }) {
      // Single allowlist for all providers (email magic link AND FB).
      return user.email === ALLOWED_EMAIL;
    },
    async session({ session, user }) {
      if (session.user && user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  session: { strategy: 'database' },
  secret: process.env.NEXTAUTH_SECRET,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
