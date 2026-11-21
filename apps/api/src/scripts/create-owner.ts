/**
 * Crée le compte du propriétaire de la plateforme (le premier compte : personne ne peut l'inviter),
 * ou remet son mot de passe à zéro s'il l'a perdu (personne ne peut l'approuver par ticket).
 *
 *   IAMIN_OWNER_PASSWORD='…' node dist/scripts/create-owner.js <identifiant> <pseudo-plato>
 *   IAMIN_OWNER_PASSWORD='…' node dist/scripts/create-owner.js <identifiant> <pseudo-plato> --reset-password
 *
 * Le mot de passe passe par une variable d'environnement, jamais par un argument : un argument
 * reste visible dans la liste des processus et dans l'historique du terminal.
 */
import { PrismaClient, Role } from '@prisma/client';
import { ZodError } from 'zod';
import { hashPassword } from '../auth/crypto';
import { passwordSchema, platoUsernameSchema, usernameSchema } from '../auth/schemas';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const resetPassword = args.includes('--reset-password');
  const [rawUsername, rawPlato] = args.filter((a) => !a.startsWith('--'));
  const rawPassword = process.env.IAMIN_OWNER_PASSWORD;
  const databaseUrl = process.env.DATABASE_URL;

  if (!rawUsername || !rawPlato || !rawPassword || !databaseUrl) {
    throw new Error(
      'Usage : IAMIN_OWNER_PASSWORD=… DATABASE_URL=… create-owner <identifiant> <pseudo-plato> [--reset-password]',
    );
  }
  const username = usernameSchema.parse(rawUsername);
  const platoUsername = platoUsernameSchema.parse(rawPlato);
  const password = passwordSchema.parse(rawPassword);

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const existing = await prisma.user.findFirst({ where: { role: Role.PLATFORM_OWNER } });
    const passwordHash = await hashPassword(password);

    if (existing) {
      if (!resetPassword || existing.username !== username) {
        throw new Error(
          'Un propriétaire existe déjà. Pour changer son mot de passe : même identifiant et --reset-password.',
        );
      }
      await prisma.$transaction([
        prisma.user.update({
          where: { id: existing.id },
          data: { passwordHash, passwordChangedAt: new Date() },
        }),
        prisma.session.deleteMany({ where: { userId: existing.id } }),
      ]);
      console.log('Mot de passe du propriétaire remis à zéro ; ses sessions sont fermées.');
      return;
    }

    await prisma.user.create({
      data: { username, platoUsername, passwordHash, role: Role.PLATFORM_OWNER },
    });
    console.log(`Propriétaire « ${username} » créé.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Les erreurs de validation zod listent des champs, jamais la valeur du mot de passe.
  if (error instanceof ZodError) {
    console.error(error.issues.map((i) => i.message).join('\n'));
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
