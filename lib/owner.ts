// Compte « propriétaire » : certaines fonctions (bascule vue admin/joueur) ne
// sont visibles que pour lui. On identifie par l'email d'authentification.
// - Connexion par téléphone → email interne "<chiffres>@vchamps.club"
// - Connexion Google (comptes v1) → email Google
export const OWNER_IDENTIFIERS: string[] = [
  "verger.alexandre@gmail.com",
  // Ajouter ici l'email de connexion téléphone si besoin, ex :
  // "0612345678@vchamps.club",
];

export function isOwner(email?: string | null): boolean {
  if (!email) return false;
  return OWNER_IDENTIFIERS.map((e) => e.toLowerCase()).includes(email.toLowerCase());
}
