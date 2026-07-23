import { Card, SectionTitle } from "./ui";

const cellCls = "px-3 py-2";

// Règlement officiel — repris de la v1.
export function Reglement() {
  return (
    <div className="mx-auto max-w-xl space-y-5 pb-8">
      <div>
        <SectionTitle>🎾 Format général</SectionTitle>
        <Card className="p-4 text-sm leading-7 text-sub">
          <b className="text-body">8 joueurs</b> répartis en <b className="text-body">4 équipes de 2</b>{" "}
          (un joueur côté <b className="text-body">Gauche</b>, un côté <b className="text-body">Droite</b> —
          positions fixes pour toute la session).
          <br />
          <br />
          <b className="text-body">2 terrains</b> en simultané. Une session dure{" "}
          <b className="text-body">3 rounds</b> : à chaque round les 4 équipes jouent (2 matchs en
          parallèle), donc <b className="text-body">chaque joueur dispute 3 matchs</b> par session.
          <br />
          <br />
          Les associations équipe vs équipe évitent les répétitions d&apos;un round à l&apos;autre
          (priorité aux paires qui se sont le moins affrontées).
        </Card>
      </div>

      <div>
        <SectionTitle>⏱ Temps de jeu</SectionTitle>
        <Card className="p-4 text-sm leading-7 text-sub">
          <b className="text-body">Échauffement</b> : 6 minutes avant le 1ᵉʳ round (démarrage anticipé
          possible).
          <br />
          <b className="text-body">Durée d&apos;un match</b> : 27 minutes chrono — une cloche sonne à la
          fin du temps imparti.
          <br />
          <br />
          Le score (en jeux) se saisit librement pendant le match, sans limite fixe — on joue
          jusqu&apos;à la fin du temps. L&apos;organisateur valide ensuite les scores (un 0-0 ne peut pas
          être validé). Après validation, le round suivant démarre automatiquement, sans nouvel
          échauffement.
        </Card>
      </div>

      <div>
        <SectionTitle>🎲 Tirage du service</SectionTitle>
        <Card className="p-4 text-sm leading-7 text-sub">
          Au début de <b className="text-body">chaque match</b>, l&apos;équipe qui sert en premier est{" "}
          <b className="text-body">tirée au sort aléatoirement</b> (50/50) — affichée à l&apos;écran avant
          le lancement du round.
        </Card>
      </div>

      <div>
        <SectionTitle>📋 Déroulement d&apos;une session</SectionTitle>
        <Card className="p-4 text-sm leading-8 text-sub">
          1. Inscription des 8 participants (liste d&apos;attente si complet)
          <br />
          2. Composition des équipes (Gauche / Droite)
          <br />
          3. Échauffement (6 min) puis tirage du service
          <br />
          4. 3 rounds de matchs (27 min chacun), validation des scores après chaque round
          <br />
          5. Fin de session après le 3ᵉ round → résultats archivés
        </Card>
      </div>

      <div>
        <SectionTitle>🏆 Classement de la session</SectionTitle>
        <Card className="p-4 text-sm leading-7 text-sub">
          Les équipes sont classées par <b className="text-body">Victoires</b> (3 pts) +{" "}
          <b className="text-body">Nuls</b> (1 pt), puis par{" "}
          <b className="text-body">différence de jeux (+/-)</b>, puis par jeux marqués.
        </Card>
      </div>

      <div>
        <SectionTitle>⭐ Points V-Champs — barème par niveau</SectionTitle>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wider text-mut">
                <th className={cellCls}>Niveau</th>
                <th className={cellCls}>Coeff.</th>
                <th className={cellCls}>1er</th>
                <th className={cellCls}>2e</th>
                <th className={cellCls}>3e</th>
                <th className={cellCls}>4e</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["3/4", "×0.35", 35, 26, 18, 9, false],
                  ["4/5", "×0.5", 50, 38, 25, 13, false],
                  ["5/6", "×0.75", 75, 56, 38, 19, false],
                  ["6/7", "×1.0", 100, 75, 50, 25, true],
                  ["7/8", "×1.5", 150, 113, 75, 38, false],
                  ["8/9", "×2.0", 200, 150, 100, 50, false],
                  ["9/10", "×2.5", 250, 188, 125, 63, false],
                ] as const
              ).map(([lv, coeff, a, b, c, d, hl]) => (
                <tr
                  key={lv}
                  className={`border-b border-line/50 last:border-0 ${hl ? "font-bold text-gold" : "text-sub"}`}
                >
                  <td className={cellCls}>{lv}</td>
                  <td className={cellCls}>{coeff}</td>
                  <td className={cellCls}>{a}</td>
                  <td className={cellCls}>{b}</td>
                  <td className={cellCls}>{c}</td>
                  <td className={cellCls}>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div>
        <SectionTitle>⚖️ Ajustement selon la force des adversaires</SectionTitle>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wider text-mut">
                <th className={cellCls}>Écart de force</th>
                <th className={cellCls}>Coefficient</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Équipe largement plus forte (≥ +300)", "×0.95"],
                  ["Plus forte (≥ +200)", "×0.97"],
                  ["Légèrement plus forte (≥ +100)", "×0.99"],
                  ["Équilibré (-99 à +99)", "×1.00"],
                  ["Légèrement outsider (≥ -199)", "×1.01"],
                  ["Outsider (≥ -299)", "×1.03"],
                  ["Largement outsider (< -299)", "×1.05"],
                ] as const
              ).map(([label, coeff]) => (
                <tr key={label} className="border-b border-line/50 text-sub last:border-0">
                  <td className={cellCls}>{label}</td>
                  <td className={`${cellCls} font-semibold text-body`}>{coeff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="px-1 pt-2.5 text-xs leading-6 text-sub">
          💡 La « force » d&apos;un joueur ne compte qu&apos;à partir de sa{" "}
          <b className="text-body">3ᵉ session jouée</b> — avant cela, il est considéré neutre et ne
          déséquilibre pas le calcul.
        </p>
      </div>

      <div>
        <SectionTitle>📊 Classement général V-Champs</SectionTitle>
        <Card className="p-4 text-sm leading-7 text-sub">
          Seules les <b className="text-body">8 meilleures performances des 180 derniers jours</b> sont
          retenues pour chaque joueur — le score affiché est la somme de ces 8 meilleures
          performances.
          <br />
          <br />
          Un joueur devient <b className="text-body">actif</b> (classé) à partir de{" "}
          <b className="text-body">4 sessions valides</b> sur la période ; en dessous, il reste{" "}
          <b className="text-body">inactif</b>, classé après tous les actifs.
        </Card>
      </div>
    </div>
  );
}
