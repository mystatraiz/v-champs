// Compte « propriétaire » : certaines fonctions (bascule vue admin/joueur) ne
// sont visibles que pour lui. On identifie par l'email d'authentification.
// - Connexion par téléphone → email interne "<chiffres>@vchamps.club"
// - Connexion Google (comptes v1) → email Google
export const OWNER_IDENTIFIERS: string[] = [
  "0643490537@vchamps.club", // connexion par téléphone
  "verger.alexandre@gmail.com", // connexion Google (au cas où)
];

export function isOwner(email?: string | null): boolean {
  if (!email) return false;
  return OWNER_IDENTIFIERS.map((e) => e.toLowerCase()).includes(email.toLowerCase());
}
