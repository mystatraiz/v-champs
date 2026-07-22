# V-Champs Pro (v2)

Application professionnelle de gestion de tournois de padel — refonte complète de la v1
(fichier `index.html` unique) en **Next.js 15 + TypeScript + Tailwind CSS + Supabase**.

Les deux versions **partagent la même base de données Supabase** : l'historique des sessions,
le classement V-Champs, les joueurs connus et les comptes existants fonctionnent dans les
deux applications. Vous pouvez donc utiliser la v1 et la v2 en parallèle et choisir.

## ✨ Fonctionnalités

### Espace joueur
- Connexion / inscription par numéro de téléphone (compatible avec les comptes v1)
- **Tournois filtrés par niveau** : un joueur de niveau 6 ne voit que les tournois 5/6 et 6/7
- **Demandes d'inscription** aux tournois (en attente → validée par l'admin / refusée / liste d'attente)
- Classement général V-Champs avec filtres par niveau, tendances (▲▼), mentions spéciales
- Profil avec statistiques personnelles (donut V/N/D, jeux, côtés gauche/droite, palmarès)
- Règlement complet

### Espace admin / organisateur
- Planification des tournois (date, créneau 1h30, **niveau**, nombre de terrains)
- Créneaux récurrents automatiques (lundi/mardi 12:30 niveau 6/7)
- Validation des **demandes d'inscription** (badge de notifications)
- Composition des équipes tactile (joueur → emplacement Gauche/Droite), noms d'équipes mémorisés par paire
- Partage WhatsApp avec lien d'inscription public (`/join/<id>`)
- **Session live** : aperçu des affiches + tirage du service, échauffement 6 min,
  3 rounds de 27 min avec cloche, saisie des scores (jeux ou sets), classement en direct,
  archivage automatique + calcul des points V-Champs
- Gestion des utilisateurs : rôles (joueur / organisateur / admin), **attribution des niveaux**,
  liaison compte ↔ joueur, remise à zéro du classement

### Système V-Champs (identique à la v1)
- Barème par position (100/75/50/25) × multiplicateur de niveau (4/5 ×0.5 → 7/8 ×1.5)
- Coefficient d'ajustement selon la force des adversaires (×0.80 → ×1.20)
- 8 meilleures performances sur 180 jours, statut actif à partir de 4 sessions

## 🚀 Mise en route

### 1. Base de données (une seule fois)

Ouvrez [Supabase → SQL Editor](https://supabase.com/dashboard/project/shficsyskgqcmtinguum/sql/new)
et exécutez le contenu de [`supabase/migration.sql`](supabase/migration.sql).

Le script est **idempotent** et **ne touche à aucune donnée v1**. Il :
- ajoute la colonne `level` aux profils,
- crée les tables `tournaments` et `registrations` (avec RLS),
- importe les tournois planifiés à venir de la v1.

### 2. Déploiement sur Vercel

1. Poussez ce dossier dans un repo GitHub (ex. `v-champs-pro`).
2. Sur [vercel.com](https://vercel.com/new) → **Add New Project** → importez le repo.
3. Framework détecté automatiquement (Next.js) — aucun réglage nécessaire → **Deploy**.

Optionnel (recommandé) : définissez les variables d'environnement dans Vercel →
Settings → Environment Variables :

| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://shficsyskgqcmtinguum.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la clé anon du projet |

(Sans ces variables, l'app utilise les valeurs par défaut du projet actuel.)

### 3. Développement local

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # build de production
```

## 🗂 Structure

```
app/
  login/            Connexion / inscription / complétion du profil
  pending/          Compte en attente de validation
  join/[id]/        Page publique d'inscription (lien WhatsApp)
  player/           Espace joueur (tournois, classement, profil, règlement)
  admin/            Espace admin (tournois, tournoi/[id], session, classement, joueurs, règlement)
components/         UI (Card, Btn…), RankingBoard, PlayerSheet, TeamComposer, Reglement
lib/
  supabase.ts       Client + identifiant téléphone→email (compatible v1)
  types.ts          Types du domaine (formats v1 conservés)
  scoring.ts        Système de points V-Champs (port fidèle)
  stats.ts          Statistiques joueurs / équipes / côtés / palmarès
  session.ts        Rounds, affiches, scores, chronos
  store.ts          Accès Supabase (app_state, tournaments, registrations…)
supabase/
  migration.sql     Migration v2 (à exécuter une fois)
```

## 🔒 Modèle de données partagé avec la v1

| Donnée | Stockage | Partagé v1/v2 |
|---|---|---|
| Session en cours | `app_state.current_session` | ✅ |
| Historique des sessions | `app_state.session_history` | ✅ |
| Points V-Champs | `player_session_scores` | ✅ |
| Joueurs connus / noms d'équipes | `known_players`, `pair_names` | ✅ |
| Comptes & rôles | `profiles` (+ `level` en v2) | ✅ |
| Tournois planifiés | v1 : JSON `planned_tournaments` · v2 : table `tournaments` | ⚠️ séparé |
| Inscriptions | v2 : table `registrations` | v2 uniquement |
